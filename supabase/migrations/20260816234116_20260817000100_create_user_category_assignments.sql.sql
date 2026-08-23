/*
# Create user_category_assignments table

Replaces the dropped category_memberships table. Links a volunteer to parent categories
they are allowed to log hours under.
*/
CREATE TABLE IF NOT EXISTS user_category_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id)
);

ALTER TABLE user_category_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uca_select_own_admin" ON user_category_assignments;
CREATE POLICY "uca_select_own_admin"
ON user_category_assignments FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "uca_insert_admin" ON user_category_assignments;
CREATE POLICY "uca_insert_admin"
ON user_category_assignments FOR INSERT
TO authenticated
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "uca_delete_admin" ON user_category_assignments;
CREATE POLICY "uca_delete_admin"
ON user_category_assignments FOR DELETE
TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS "uca_update_admin" ON user_category_assignments;
CREATE POLICY "uca_update_admin"
ON user_category_assignments FOR UPDATE
TO authenticated
USING (is_admin()) WITH CHECK (is_admin());
