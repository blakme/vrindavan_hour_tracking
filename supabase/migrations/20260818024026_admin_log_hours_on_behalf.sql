/*
# Allow admins to log hours on behalf of any active volunteer

## Purpose
Admins should be able to enter service hours for themselves AND on behalf of
other volunteers. The current INSERT policy only allows a volunteer to insert
their own row. We add a second INSERT policy that allows admins to insert rows
for any active volunteer.

## Changes

### 1. hour_entries INSERT policy — admin on-behalf
- Add a new INSERT policy "he_insert_admin" that allows an admin to insert an
  hour_entries row for ANY volunteer whose profile status is 'ACTIVE'.
  This is additive — the existing "he_insert_own" policy (volunteer inserts
  their own row when ACTIVE) remains unchanged.

### 2. hour_entries UPDATE policy — admin on-behalf
- Replace the UPDATE policy so the WITH CHECK also allows admins to update
  any row (they already can via USING, but the WITH CHECK must also pass).
  The volunteer self-edit branch still requires ACTIVE status.

## Security
- RLS remains enabled. The new INSERT policy is scoped to admins only and
  requires the target volunteer to be ACTIVE. No data loss — no columns or
  tables changed.
*/

-- 1. Admin can insert hours on behalf of any ACTIVE volunteer
DROP POLICY IF EXISTS "he_insert_admin" ON public.hour_entries;
CREATE POLICY "he_insert_admin"
  ON public.hour_entries FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = volunteer_id
        AND p.status = 'ACTIVE'
    )
  );

-- 2. Update WITH CHECK on UPDATE policy to allow admin edits
DROP POLICY IF EXISTS "he_update_own_pending_or_lead_or_admin" ON public.hour_entries;
CREATE POLICY "he_update_own_pending_or_lead_or_admin"
  ON public.hour_entries FOR UPDATE TO authenticated
  USING (
    (volunteer_id = auth.uid())
    OR is_admin()
    OR is_category_lead_of(category_id)
  )
  WITH CHECK (
    (
      volunteer_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'ACTIVE'
      )
    )
    OR is_admin()
    OR is_category_lead_of(category_id)
  );
