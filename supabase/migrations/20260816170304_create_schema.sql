/*
# Vrindavan Seva — core schema

1. Overview
Builds the database for a volunteer hours tracking system ("Vrindavan Seva")
for a non-profit Vrindavan ashram. Replaces a legacy Track it Forward tool.
Three roles: VOLUNTEER, GROUP_LEAD, ADMIN. Authentication is handled by
Supabase Auth (auth.users); this schema holds the application data and
enforces role-based access through Row Level Security policies.

2. Enums
- user_role: VOLUNTEER | GROUP_LEAD | ADMIN
- volunteer_type: MIDDLE_SCHOOL | HIGH_SCHOOL | ADULT
- user_status: ACTIVE | INACTIVE
- membership_type: MEMBER | LEAD
- entry_status: PENDING | APPROVED | REJECTED
- milestone_scope: GLOBAL | GROUP

3. Tables
- profiles: application fields for each auth user (role, name, volunteer type,
  graduation year, school, phone, status). 1:1 with auth.users.
- project_groups: named groups a volunteer can serve under (soft-delete via is_active).
- beneficiary_teams: named beneficiary teams (soft-delete via is_active).
- categories: two-tier hierarchy via self-referencing parent_id (soft-delete + order).
- group_memberships: links users to groups as MEMBER or LEAD.
- hour_entries: the core timesheet row — date, hours, group/team/category,
  sub-category, reflection, approval status, approver, rejection reason.
- milestones: target-hour goals for a period, global or per-group.

4. Helper functions (SECURITY DEFINER, STABLE, owned by postgres)
- public.is_admin()           — true if current user's profile role = ADMIN
- public.is_group_lead_of(uuid) — true if current user LEADs the given group
- public.led_group_ids()      — set of group_ids the current user leads

5. Security (RLS)
RLS enabled on every table. Policies enforce:
- profiles: a user reads/updates only their own profile; admins read all and
  can update role/status/contact fields of any profile.
- reference tables (project_groups, beneficiary_teams, categories, milestones):
  read for all authenticated; write only for admins.
- group_memberships: read for all authenticated (needed to resolve leads);
  write only for admins.
- hour_entries:
  SELECT — volunteer sees own rows; group leads see entries for groups they
    lead; admins see all.
  INSERT — authenticated user may insert only their own row (volunteer_id =
    auth.uid()); hours must be within 0.25–24.00 enforced by a CHECK.
  UPDATE — volunteer may update only their own PENDING rows (and only while
    still PENDING); group leads may update status/approver fields for entries
    in groups they lead; admins may update any row.
  DELETE — volunteer may delete only their own PENDING rows; admins any.
- All datetimes stored as timestamptz (UTC). Display timezone is handled in app.

6. Notes
- hours is numeric(5,2) with a CHECK between 0.25 and 24.00.
- sub_category validation (child of chosen category) is enforced in the API layer;
  the CHECK here only enforces that sub_category_id is NULL when category_id is NULL.
*/

-- ===== Enums =====
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('VOLUNTEER', 'GROUP_LEAD', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE volunteer_type AS ENUM ('MIDDLE_SCHOOL', 'HIGH_SCHOOL', 'ADULT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE membership_type AS ENUM ('MEMBER', 'LEAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entry_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE milestone_scope AS ENUM ('GLOBAL', 'GROUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== profiles =====
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL DEFAULT 'VOLUNTEER',
  volunteer_type volunteer_type,
  graduation_year int,
  school_name text,
  phone text,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique
  ON public.profiles (lower(email));

-- ===== project_groups =====
CREATE TABLE IF NOT EXISTS public.project_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== beneficiary_teams =====
CREATE TABLE IF NOT EXISTS public.beneficiary_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== categories =====
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  "order" int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories(parent_id);

-- ===== group_memberships =====
CREATE TABLE IF NOT EXISTS public.group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.project_groups(id) ON DELETE CASCADE,
  membership_type membership_type NOT NULL DEFAULT 'MEMBER',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS group_memberships_user_idx ON public.group_memberships(user_id);
CREATE INDEX IF NOT EXISTS group_memberships_group_idx ON public.group_memberships(group_id);

-- ===== hour_entries =====
CREATE TABLE IF NOT EXISTS public.hour_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours >= 0.25 AND hours <= 24.00),
  project_group_id uuid NOT NULL REFERENCES public.project_groups(id),
  team_id uuid NOT NULL REFERENCES public.beneficiary_teams(id),
  category_id uuid NOT NULL REFERENCES public.categories(id),
  sub_category_id uuid REFERENCES public.categories(id),
  reflection text,
  status entry_status NOT NULL DEFAULT 'PENDING',
  approver_id uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sub_category_id IS NULL OR category_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS hour_entries_volunteer_idx ON public.hour_entries(volunteer_id);
CREATE INDEX IF NOT EXISTS hour_entries_status_idx ON public.hour_entries(status);
CREATE INDEX IF NOT EXISTS hour_entries_group_idx ON public.hour_entries(project_group_id);
CREATE INDEX IF NOT EXISTS hour_entries_date_idx ON public.hour_entries(date);
CREATE INDEX IF NOT EXISTS hour_entries_category_idx ON public.hour_entries(category_id);

-- ===== milestones =====
CREATE TABLE IF NOT EXISTS public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_hours numeric(8,2) NOT NULL CHECK (target_hours > 0),
  period_start date NOT NULL,
  period_end date NOT NULL,
  scope milestone_scope NOT NULL DEFAULT 'GLOBAL',
  project_group_id uuid REFERENCES public.project_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope = 'GLOBAL' OR project_group_id IS NOT NULL),
  CHECK (period_end >= period_start)
);

-- ===== updated_at triggers =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS hour_entries_touch ON public.hour_entries;
CREATE TRIGGER hour_entries_touch BEFORE UPDATE ON public.hour_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Helper functions =====
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_lead_of(g_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.user_id = auth.uid()
      AND gm.group_id = g_id
      AND gm.membership_type = 'LEAD'
      AND p.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.led_group_ids()
RETURNS TABLE (group_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gm.group_id
  FROM public.group_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.user_id = auth.uid()
    AND gm.membership_type = 'LEAD'
    AND p.status = 'ACTIVE';
$$;

-- ===== RLS =====
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiary_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hour_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- profiles policies
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- project_groups policies
DROP POLICY IF EXISTS "pg_select_all" ON public.project_groups;
CREATE POLICY "pg_select_all"
  ON public.project_groups FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pg_write_admin" ON public.project_groups;
CREATE POLICY "pg_write_admin"
  ON public.project_groups FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pg_update_admin" ON public.project_groups;
CREATE POLICY "pg_update_admin"
  ON public.project_groups FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pg_delete_admin" ON public.project_groups;
CREATE POLICY "pg_delete_admin"
  ON public.project_groups FOR DELETE TO authenticated
  USING (public.is_admin());

-- beneficiary_teams policies
DROP POLICY IF EXISTS "bt_select_all" ON public.beneficiary_teams;
CREATE POLICY "bt_select_all"
  ON public.beneficiary_teams FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "bt_write_admin" ON public.beneficiary_teams;
CREATE POLICY "bt_write_admin"
  ON public.beneficiary_teams FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "bt_update_admin" ON public.beneficiary_teams;
CREATE POLICY "bt_update_admin"
  ON public.beneficiary_teams FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "bt_delete_admin" ON public.beneficiary_teams;
CREATE POLICY "bt_delete_admin"
  ON public.beneficiary_teams FOR DELETE TO authenticated
  USING (public.is_admin());

-- categories policies
DROP POLICY IF EXISTS "cat_select_all" ON public.categories;
CREATE POLICY "cat_select_all"
  ON public.categories FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cat_write_admin" ON public.categories;
CREATE POLICY "cat_write_admin"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cat_update_admin" ON public.categories;
CREATE POLICY "cat_update_admin"
  ON public.categories FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cat_delete_admin" ON public.categories;
CREATE POLICY "cat_delete_admin"
  ON public.categories FOR DELETE TO authenticated
  USING (public.is_admin());

-- group_memberships policies
DROP POLICY IF EXISTS "gm_select_all" ON public.group_memberships;
CREATE POLICY "gm_select_all"
  ON public.group_memberships FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "gm_write_admin" ON public.group_memberships;
CREATE POLICY "gm_write_admin"
  ON public.group_memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "gm_update_admin" ON public.group_memberships;
CREATE POLICY "gm_update_admin"
  ON public.group_memberships FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "gm_delete_admin" ON public.group_memberships;
CREATE POLICY "gm_delete_admin"
  ON public.group_memberships FOR DELETE TO authenticated
  USING (public.is_admin());

-- hour_entries policies
DROP POLICY IF EXISTS "he_select_own_lead_admin" ON public.hour_entries;
CREATE POLICY "he_select_own_lead_admin"
  ON public.hour_entries FOR SELECT TO authenticated
  USING (
    volunteer_id = auth.uid()
    OR public.is_admin()
    OR public.is_group_lead_of(project_group_id)
  );

DROP POLICY IF EXISTS "he_insert_own" ON public.hour_entries;
CREATE POLICY "he_insert_own"
  ON public.hour_entries FOR INSERT TO authenticated
  WITH CHECK (volunteer_id = auth.uid());

DROP POLICY IF EXISTS "he_update_own_pending_or_lead_or_admin" ON public.hour_entries;
CREATE POLICY "he_update_own_pending_or_lead_or_admin"
  ON public.hour_entries FOR UPDATE TO authenticated
  USING (
    (volunteer_id = auth.uid())
    OR public.is_admin()
    OR public.is_group_lead_of(project_group_id)
  )
  WITH CHECK (
    (volunteer_id = auth.uid())
    OR public.is_admin()
    OR public.is_group_lead_of(project_group_id)
  );

DROP POLICY IF EXISTS "he_delete_own_pending_or_admin" ON public.hour_entries;
CREATE POLICY "he_delete_own_pending_or_admin"
  ON public.hour_entries FOR DELETE TO authenticated
  USING (
    (volunteer_id = auth.uid())
    OR public.is_admin()
  );

-- milestones policies
DROP POLICY IF EXISTS "ms_select_all" ON public.milestones;
CREATE POLICY "ms_select_all"
  ON public.milestones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ms_write_admin" ON public.milestones;
CREATE POLICY "ms_write_admin"
  ON public.milestones FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ms_update_admin" ON public.milestones;
CREATE POLICY "ms_update_admin"
  ON public.milestones FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ms_delete_admin" ON public.milestones;
CREATE POLICY "ms_delete_admin"
  ON public.milestones FOR DELETE TO authenticated
  USING (public.is_admin());
