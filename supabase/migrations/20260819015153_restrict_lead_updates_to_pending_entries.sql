/*
# Stop group leads editing hour entries that were already reviewed

1. Problem
- The UPDATE policy on `hour_entries` allowed the branch
  `is_category_lead_of(category_id)` to match rows in ANY status. A lead could
  therefore change the `hours`, `date` or `category` of an entry that had already
  been APPROVED — including one of their own — and the row kept its approved status
  and approver, so the altered total appeared in reports as fully reviewed.

2. Change
- Recreates `he_update_own_pending_or_lead_or_admin` on `public.hour_entries` so the
  lead branch only matches entries still awaiting review (`status = 'PENDING'`).
- The volunteer branch (own + PENDING + ACTIVE account) is unchanged.
- The admin branch is unchanged: admins may correct historical records.

3. Security notes
1. Both `USING` and `WITH CHECK` are updated identically, so a row cannot be moved
   out of the allowed set by the update itself.
2. Column-level UPDATE grants still limit which columns any client can write, so
   `status`, `approver_id` and `approved_at` remain non-client-writable.
3. No application screen performs a lead-side update, so no feature relies on the
   wider rule.
*/

DROP POLICY IF EXISTS "he_update_own_pending_or_lead_or_admin" ON public.hour_entries;

CREATE POLICY "he_update_own_pending_or_lead_or_admin"
ON public.hour_entries FOR UPDATE
TO authenticated
USING (
  ((volunteer_id = auth.uid()) AND (status = 'PENDING'::entry_status))
  OR is_admin()
  OR (is_category_lead_of(category_id) AND (status = 'PENDING'::entry_status))
)
WITH CHECK (
  (
    (volunteer_id = auth.uid())
    AND (status = 'PENDING'::entry_status)
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.status = 'ACTIVE'::user_status
    )
  )
  OR is_admin()
  OR (is_category_lead_of(category_id) AND (status = 'PENDING'::entry_status))
);
