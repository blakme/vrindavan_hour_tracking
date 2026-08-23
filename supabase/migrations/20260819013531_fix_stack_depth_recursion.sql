/*
  # Fix stack depth exceeded: break RLS recursion in helper functions

  ## Problem
  `is_admin()`, `is_category_lead_of()`, and `led_category_ids()` query the
  `profiles` table. RLS policies on `profiles` call `is_admin()`, which queries
  `profiles`, which triggers the policy again — infinite recursion that hits
  PostgreSQL's `max_stack_depth` (2048kB) and returns HTTP 500 with
  "stack depth limit exceeded".

  The same recursion occurs on `category_lead_assignments` (its SELECT policy
  calls `is_admin()`, and `is_category_lead_of` reads that table).

  ## Fix
  Mark all three helper functions `SECURITY INVOKER` (they already are, since
  they are not SECURITY DEFINER) but more importantly add a `BYPASSRLS` pattern
  by switching them to `SECURITY DEFINER` owned by `postgres` (which bypasses
  RLS). This breaks the recursion: when the policy calls `is_admin()`, the
  function reads `profiles` without re-triggering the profiles RLS policy.

  The functions still derive the caller from `auth.uid()` — they do not accept
  a caller parameter — so making them SECURITY DEFINER does not change who they
  authorize. EXECUTE is revoked from `anon` and granted to `authenticated`.
*/

-- is_admin: SECURITY DEFINER so it bypasses RLS on profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
);
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- is_category_lead_of: SECURITY DEFINER so it bypasses RLS on profiles and category_lead_assignments
CREATE OR REPLACE FUNCTION public.is_category_lead_of(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.category_lead_assignments cla
  WHERE cla.user_id = auth.uid()
  AND cla.category_id = c_id
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'ACTIVE'
  )
);
$$;

REVOKE ALL ON FUNCTION public.is_category_lead_of(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_category_lead_of(uuid) TO authenticated;

-- led_category_ids: SECURITY DEFINER so it bypasses RLS on profiles and category_lead_assignments
CREATE OR REPLACE FUNCTION public.led_category_ids()
RETURNS TABLE(category_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT cla.category_id
FROM public.category_lead_assignments cla
WHERE cla.user_id = auth.uid()
AND EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'ACTIVE'
);
$$;

REVOKE ALL ON FUNCTION public.led_category_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.led_category_ids() TO authenticated;
