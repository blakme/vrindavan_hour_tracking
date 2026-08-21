/*
# Remove project_groups — use categories and sub-categories exclusively

## What changed

The app previously had both `project_groups` (Arts & Crafts, Bioscience, Green, Media, Technology)
and `categories` with parent/child hierarchy. The 5 project groups were already duplicated as
sub-categories under "CYSP Categories". This migration removes the `project_groups` table entirely
and makes `categories` (parent) + sub-categories (child) the only way to classify service hours.

## Migration steps

1. Drop hour_entries RLS policies that reference is_group_lead_of() (they depend on the function).
2. Drop FK constraints referencing project_groups.
3. Make hour_entries.project_group_id nullable.
4. Drop old group lead functions (is_group_lead_of, led_group_ids).
5. Drop group_memberships and category_memberships tables (0 rows).
6. Create category_lead_assignments table + RLS.
7. Create is_category_lead_of() and led_category_ids() functions.
8. Recreate hour_entries RLS policies using is_category_lead_of(category_id).
9. Add category_id to milestones. Add 'CATEGORY' to milestone_scope enum.
10. Drop project_groups table.

## New tables
- `category_lead_assignments` — links a user (lead) to a category they can approve hours for.

## Security
- RLS enabled on category_lead_assignments with admin-only write, all-authenticated read.
- hour_entries policies updated to use is_category_lead_of(category_id).
*/

-- Step 1: Drop hour_entries policies that depend on is_group_lead_of()
DROP POLICY IF EXISTS "he_select_own_lead_admin" ON hour_entries;
DROP POLICY IF EXISTS "he_update_own_pending_or_lead_or_admin" ON hour_entries;

-- Step 2: Drop FK constraints referencing project_groups
ALTER TABLE hour_entries DROP CONSTRAINT IF EXISTS hour_entries_project_group_id_fkey;
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_project_group_id_fkey;
ALTER TABLE group_memberships DROP CONSTRAINT IF EXISTS group_memberships_group_id_fkey;
ALTER TABLE project_groups DROP CONSTRAINT IF EXISTS project_groups_category_id_fkey;

-- Step 3: Make project_group_id nullable on hour_entries
ALTER TABLE hour_entries ALTER COLUMN project_group_id DROP NOT NULL;

-- Step 4: Drop old group lead functions
DROP FUNCTION IF EXISTS is_group_lead_of(uuid);
DROP FUNCTION IF EXISTS led_group_ids();

-- Step 5: Drop group_memberships and category_memberships tables (0 rows)
DROP TABLE IF EXISTS group_memberships;
DROP TABLE IF EXISTS category_memberships;

-- Step 6: Create category_lead_assignments table
CREATE TABLE IF NOT EXISTS category_lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id)
);

ALTER TABLE category_lead_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cla_select_all" ON category_lead_assignments;
CREATE POLICY "cla_select_all"
ON category_lead_assignments FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "cla_write_admin" ON category_lead_assignments;
CREATE POLICY "cla_write_admin"
ON category_lead_assignments FOR INSERT
TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "cla_delete_admin" ON category_lead_assignments;
CREATE POLICY "cla_delete_admin"
ON category_lead_assignments FOR DELETE
TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "cla_update_admin" ON category_lead_assignments;
CREATE POLICY "cla_update_admin"
ON category_lead_assignments FOR UPDATE
TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Step 7: Create new category lead functions
CREATE OR REPLACE FUNCTION is_category_lead_of(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.category_lead_assignments cla
  JOIN public.profiles p ON p.id = cla.user_id
  WHERE cla.user_id = auth.uid()
  AND cla.category_id = c_id
  AND p.status = 'ACTIVE'
);
$$;

CREATE OR REPLACE FUNCTION led_category_ids()
RETURNS TABLE(category_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT cla.category_id
FROM public.category_lead_assignments cla
JOIN public.profiles p ON p.id = cla.user_id
WHERE cla.user_id = auth.uid()
AND p.status = 'ACTIVE';
$$;

-- Step 8: Recreate hour_entries RLS policies using is_category_lead_of(category_id)
CREATE POLICY "he_select_own_lead_admin"
ON hour_entries FOR SELECT
TO authenticated
USING (volunteer_id = auth.uid() OR is_admin() OR is_category_lead_of(category_id));

CREATE POLICY "he_update_own_pending_or_lead_or_admin"
ON hour_entries FOR UPDATE
TO authenticated
USING (volunteer_id = auth.uid() OR is_admin() OR is_category_lead_of(category_id))
WITH CHECK (volunteer_id = auth.uid() OR is_admin() OR is_category_lead_of(category_id));

-- Step 9: Add category_id to milestones
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- Update milestone_scope enum: add CATEGORY
DO $$ BEGIN
  ALTER TYPE milestone_scope ADD VALUE IF NOT EXISTS 'CATEGORY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Step 10: Drop the project_groups table
DROP TABLE IF EXISTS project_groups;

-- Step 11: Grant execute on new functions to authenticated
GRANT EXECUTE ON FUNCTION is_category_lead_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION led_category_ids() TO authenticated;
