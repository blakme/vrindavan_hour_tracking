/*
# Restrict SECURITY DEFINER function execution to postgres only

The helper functions is_admin(), is_group_lead_of(), and led_group_ids() are
SECURITY DEFINER functions used internally by RLS policies. They must not be
callable via the Postgres REST API by anon or authenticated roles.

Postgres grants EXECUTE to PUBLIC by default on function creation, and
Supabase's anon/authenticated roles inherit from PUBLIC. Revoking from
anon/authenticated alone is insufficient — we must revoke from PUBLIC and
then grant only to the roles that run RLS policy evaluation (which execute
as the table owner / postgres, so no explicit grant to anon/authenticated
is needed).
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_lead_of(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.led_group_ids() FROM PUBLIC;
