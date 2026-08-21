/*
# Tighten helper function permissions

1. Security changes
- Revoke EXECUTE on is_admin(), is_group_lead_of(uuid), and led_group_ids()
  from anon and authenticated. These functions are used internally by RLS
  policies only — they should not be callable directly via the REST API.
- Set a fixed search_path on touch_updated_at() to clear the
  "mutable search_path" warning.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_lead_of(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.led_group_ids() FROM anon, authenticated;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
DROP TRIGGER IF EXISTS hour_entries_touch ON public.hour_entries;
DROP FUNCTION IF EXISTS public.touch_updated_at();

CREATE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER hour_entries_touch BEFORE UPDATE ON public.hour_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
