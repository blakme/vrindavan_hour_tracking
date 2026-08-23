/*
# Block self-review of volunteer hours by group leads

1. Problem
- `review_hour_entry` authorized the caller as an active admin or as a lead of the
  entry's category, but never compared the entry's volunteer to the caller. A group
  lead could therefore approve their own hour entries, defeating the purpose of the
  approval step (a second person attesting the hours).

2. Change
- `public.review_hour_entry(uuid, entry_status, text)` now refuses when the entry
  belongs to the caller AND the caller is not an active ADMIN.
- Admins keep the ability to review their own entries: they are the operator of last
  resort, and blocking them would leave an admin's own hours permanently pending in a
  deployment with a single admin.

3. Security notes
1. The actor is still derived from `auth.uid()`, never from a parameter.
2. `search_path` remains pinned to `public`.
3. The single-use claim (`AND status = 'PENDING'`) is preserved, so two concurrent
   reviewers cannot both succeed.
4. EXECUTE grants are unchanged: `authenticated` only.
*/

CREATE OR REPLACE FUNCTION public.review_hour_entry(
  p_entry_id uuid,
  p_status entry_status,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_category uuid;
  v_volunteer uuid;
  v_is_admin boolean;
  v_updated uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('APPROVED'::entry_status, 'REJECTED'::entry_status) THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;

  SELECT category_id, volunteer_id
  INTO v_category, v_volunteer
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

  -- Separation of duties: a group lead may not review their own hours.
  IF NOT v_is_admin AND v_volunteer = v_caller THEN
    RAISE EXCEPTION 'You cannot review your own hours';
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
$function$;

REVOKE ALL ON FUNCTION public.review_hour_entry(uuid, entry_status, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_hour_entry(uuid, entry_status, text) TO authenticated;
