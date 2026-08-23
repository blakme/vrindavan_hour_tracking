/*
# Tie category-lead powers to the current lead role

1. Problem
- `is_category_lead_of()` and `led_category_ids()` checked only that the caller's
  account was ACTIVE, never that the caller still holds a lead role. Because
  demoting a user rewrites `profiles.role` and leaves the row in
  `category_lead_assignments` untouched (nothing in the product deletes it), a
  demoted user kept the ability to read every volunteer's entries in that category
  and to approve or reject them.

2. Change
- Both helpers now additionally require `profiles.role IN ('GROUP_LEAD','ADMIN')`.
- Every policy and function that calls them (`he_select_own_lead_admin`,
  `he_update_own_pending_or_lead_or_admin`, `review_hour_entry`) inherits the check.

3. Security notes
1. Both stay SECURITY DEFINER with `search_path` pinned: they must bypass row level
   security to avoid recursing into the policies that call them.
2. Both remain read-only and report solely on `auth.uid()`; no parameter names the
   actor.
3. EXECUTE stays granted to `authenticated` only, as the policies require.
4. Verified before applying: the only existing lead assignments belong to an ACTIVE
   ADMIN, so no current lead loses access.
*/

CREATE OR REPLACE FUNCTION public.is_category_lead_of(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM public.category_lead_assignments cla
  JOIN public.profiles p ON p.id = cla.user_id
  WHERE cla.user_id = auth.uid()
    AND cla.category_id = c_id
    AND p.status = 'ACTIVE'::user_status
    AND p.role IN ('GROUP_LEAD'::user_role, 'ADMIN'::user_role)
);
$function$;

CREATE OR REPLACE FUNCTION public.led_category_ids()
RETURNS TABLE(category_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT cla.category_id
FROM public.category_lead_assignments cla
JOIN public.profiles p ON p.id = cla.user_id
WHERE cla.user_id = auth.uid()
  AND p.status = 'ACTIVE'::user_status
  AND p.role IN ('GROUP_LEAD'::user_role, 'ADMIN'::user_role);
$function$;

REVOKE ALL ON FUNCTION public.is_category_lead_of(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_category_lead_of(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.led_category_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.led_category_ids() TO authenticated;
