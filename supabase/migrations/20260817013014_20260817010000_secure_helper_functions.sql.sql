/*
# Secure helper functions — switch to SECURITY INVOKER, restrict EXECUTE

These functions only query tables the caller already has RLS access to:
- profiles: caller can read their own row (profiles_select_own_or_admin)
- category_lead_assignments: all authenticated can read (cla_select_all)

So SECURITY INVOKER is safe and removes the SECURITY DEFINER attack surface.
Also revoke EXECUTE from anon/PUBLIC so only authenticated users can call them
(needed for RLS policy evaluation).
*/

-- is_admin: caller checks their own profile row
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  );
$$;

-- is_category_lead_of: checks caller's own assignments + active status
CREATE OR REPLACE FUNCTION public.is_category_lead_of(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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

-- led_category_ids: returns caller's own led categories (if active)
CREATE OR REPLACE FUNCTION public.led_category_ids()
RETURNS TABLE(category_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT cla.category_id
  FROM public.category_lead_assignments cla
  WHERE cla.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'ACTIVE'
    );
$$;

-- Revoke EXECUTE from anon and PUBLIC (PostgreSQL grants EXECUTE to PUBLIC by default)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_category_lead_of(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_category_lead_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.led_category_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.led_category_ids() FROM anon;

-- Grant EXECUTE only to authenticated (needed for RLS policy evaluation)
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_category_lead_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.led_category_ids() TO authenticated;
