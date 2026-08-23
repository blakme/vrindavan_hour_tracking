/*
# Merge project groups under categories + category memberships

## Purpose
Project groups (Arts & Crafts, Bioscience, Green, Media, Technology) are now
organized under parent categories (e.g. "CYSP Categories"). Volunteers are
assigned to categories rather than individual project groups. When logging
hours, they see only the project groups within their assigned categories.

## Changes

### 1. project_groups.category_id (new column)
- Adds `category_id uuid REFERENCES categories(id)` to project_groups.
- Links each existing project group to its matching child category by name
  (Arts & Crafts -> CYSP Categories > Arts & Crafts, etc.).
- category_id is nullable so groups not yet linked to a category remain valid.
- This is NOT a destructive change — the column is additive.

### 2. category_memberships (new table)
- Replaces the concept of group_memberships for volunteer assignments.
- Links users to parent-level categories (e.g. CYSP Categories, Temple Events).
- Fields: id, user_id, category_id, created_at, UNIQUE(user_id, category_id).
- RLS enabled: read for all authenticated, write only for admins.

### 3. Data migration: link existing project groups to categories
- For each project group whose name matches a child category name, set
  category_id to that child category's id.
- Groups with no matching child category remain unlinked (category_id = NULL).

### 4. group_memberships retained
- group_memberships is kept for group-lead authorization (is_group_lead_of
  still uses it). Only admin assignments of volunteers to categories change.

## Security
- RLS enabled on category_memberships with 4 CRUD policies (authenticated read, admin write).
- No data is deleted. No existing columns are dropped or renamed.
*/

-- 1. Add category_id to project_groups (nullable, additive)
ALTER TABLE public.project_groups
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_groups_category_idx ON public.project_groups(category_id);

-- 2. Link existing project groups to matching child categories by name
UPDATE public.project_groups pg
SET category_id = sub.id
FROM public.categories sub
WHERE sub.parent_id IS NOT NULL
  AND pg.category_id IS NULL
  AND pg.name = sub.name;

-- 3. Create category_memberships table
CREATE TABLE IF NOT EXISTS public.category_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS category_memberships_user_idx ON public.category_memberships(user_id);
CREATE INDEX IF NOT EXISTS category_memberships_category_idx ON public.category_memberships(category_id);

-- 4. RLS on category_memberships
ALTER TABLE public.category_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_select_all" ON public.category_memberships;
CREATE POLICY "cm_select_all"
  ON public.category_memberships FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cm_write_admin" ON public.category_memberships;
CREATE POLICY "cm_write_admin"
  ON public.category_memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cm_update_admin" ON public.category_memberships;
CREATE POLICY "cm_update_admin"
  ON public.category_memberships FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cm_delete_admin" ON public.category_memberships;
CREATE POLICY "cm_delete_admin"
  ON public.category_memberships FOR DELETE TO authenticated
  USING (public.is_admin());
