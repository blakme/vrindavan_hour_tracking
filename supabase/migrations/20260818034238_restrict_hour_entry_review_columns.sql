/*
  # Protect hour entry approval fields

  1. Column privileges on `hour_entries`
     - Table-wide INSERT and UPDATE are revoked from `authenticated` and `anon`.
     - INSERT is granted only on the fields a volunteer legitimately fills in:
       volunteer_id, date, hours, project_group_id, team_id, category_id,
       sub_category_id, reflection.
     - UPDATE is granted only on: date, hours, project_group_id, team_id,
       category_id, sub_category_id, reflection, updated_at.
     - `status`, `approver_id`, `approved_at` and `rejection_reason` therefore
       become impossible to write directly through the data API, which stops a
       volunteer from submitting pre-approved hours or approving their own.

  2. New function `review_hour_entry(uuid, entry_status, text)`
     - SECURITY DEFINER, fixed search_path, EXECUTE granted to `authenticated` only.
     - Derives the reviewer from `auth.uid()`; the caller cannot name an approver.
     - Requires the caller to be an ACTIVE admin, or an active category lead for
       the entry's category.
     - Claims the row atomically and only while it is still PENDING, so a double
       submit or a race cannot re-review an already decided entry.

  3. Policy tightening
     - The volunteer branch of the UPDATE and DELETE policies now applies only
       while the entry is PENDING. Admins and category leads are unaffected.
*/

REVOKE INSERT, UPDATE ON public.hour_entries FROM authenticated, anon;

GRANT INSERT (volunteer_id, date, hours, project_group_id, team_id, category_id, sub_category_id, reflection)
  ON public.hour_entries TO authenticated;

GRANT UPDATE (date, hours, project_group_id, team_id, category_id, sub_category_id, reflection, updated_at)
  ON public.hour_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.review_hour_entry(
  p_entry_id uuid,
  p_status entry_status,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_category uuid;
  v_is_admin boolean;
  v_updated uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('APPROVED'::entry_status, 'REJECTED'::entry_status) THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;

  SELECT category_id INTO v_category
  FROM hour_entries
  WHERE id = p_entry_id;

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Entry not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_caller AND role = 'ADMIN'::user_role AND status = 'ACTIVE'::user_status
  ) INTO v_is_admin;

  IF NOT v_is_admin AND NOT is_category_lead_of(v_category) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE hour_entries
  SET status = p_status,
      approver_id = v_caller,
      approved_at = CASE WHEN p_status = 'APPROVED'::entry_status THEN now() ELSE NULL END,
      rejection_reason = CASE WHEN p_status = 'REJECTED'::entry_status THEN p_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_entry_id
    AND status = 'PENDING'::entry_status
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'This entry has already been reviewed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_hour_entry(uuid, entry_status, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_hour_entry(uuid, entry_status, text) TO authenticated;

DROP POLICY IF EXISTS "he_update_own_pending_or_lead_or_admin" ON public.hour_entries;
CREATE POLICY "he_update_own_pending_or_lead_or_admin" ON public.hour_entries
  FOR UPDATE TO authenticated
  USING (
    ((volunteer_id = auth.uid()) AND status = 'PENDING'::entry_status)
    OR is_admin()
    OR is_category_lead_of(category_id)
  )
  WITH CHECK (
    (((volunteer_id = auth.uid()) AND status = 'PENDING'::entry_status) AND EXISTS (
       SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE'::user_status
    ))
    OR is_admin()
    OR is_category_lead_of(category_id)
  );

DROP POLICY IF EXISTS "he_delete_own_pending_or_admin" ON public.hour_entries;
CREATE POLICY "he_delete_own_pending_or_admin" ON public.hour_entries
  FOR DELETE TO authenticated
  USING (
    ((volunteer_id = auth.uid()) AND status = 'PENDING'::entry_status)
    OR is_admin()
  );
