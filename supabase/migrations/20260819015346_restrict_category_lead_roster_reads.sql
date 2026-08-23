/*
# Limit who can read the category lead roster

1. Problem
- The SELECT policy on `category_lead_assignments` was `USING (true)` for every
  signed-in user, so any volunteer could download the complete internal approval
  hierarchy (which account leads which category) through the data API.

2. Change
- Recreates `cla_select_all` so a caller sees their own assignments, and admins see
  all of them.

3. Security notes
1. The only place the application reads this table is the Approvals screen, which
   already filters to the signed-in user's own assignments, so the narrower rule
   supports the existing feature unchanged.
2. Admin management screens keep full visibility through `is_admin()`.
3. Write policies (admin-only) are untouched.
*/

DROP POLICY IF EXISTS "cla_select_all" ON public.category_lead_assignments;

CREATE POLICY "cla_select_own_or_admin"
ON public.category_lead_assignments FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_admin());
