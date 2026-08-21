/*
# Restore execution permissions for RLS helper functions

1. Purpose
- Restore the permissions required for signed-in users to read and write protected application data.
- The helper functions are SECURITY DEFINER functions used by row-level security policies.

2. Functions
- `public.is_admin()` checks whether the signed-in user is an active administrator.
- `public.is_group_lead_of(uuid)` checks group-lead membership.
- `public.led_group_ids()` returns groups led by the signed-in user.

3. Security
- Grant EXECUTE only to `authenticated`, because these functions depend on `auth.uid()` and are used by signed-in policies.
- Keep anonymous users unable to execute the functions directly.
- The functions retain their fixed `search_path` and SECURITY DEFINER settings.

4. Data safety
- No tables, rows, columns, or stored data are changed.
*/

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_lead_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.led_group_ids() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_group_lead_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.led_group_ids() FROM anon;
