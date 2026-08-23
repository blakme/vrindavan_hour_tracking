/*
# Force a profile's email to be the address of the signed-in account

1. Problem
- The sign-up form supplied `profiles.email` from the browser, and `email` was in the
  client's INSERT column grant. Anyone creating an account could therefore store
  somebody else's address on their own profile. That address is what the admin user
  list, the reports screen and the printable verification letters display, and the
  unique index on `lower(email)` meant the squatted address could no longer be used
  by its real owner.

2. Changes
- New function `public.profiles_force_session_email()` and trigger
  `profiles_force_session_email_trg`: BEFORE INSERT on `public.profiles`, the row's
  `email` is overwritten with the address on the matching `auth.users` row (lower
  cased and trimmed).
- Client INSERT privilege on `public.profiles` is re-granted without the `email`
  column, so a crafted request cannot even name it.

3. Security notes
1. The email now comes from the session's own auth record, not from the request body.
2. UPDATE on `email` was already revoked from clients, so the admin-only edge
   function remains the single path for changing an address afterwards.
3. The trigger function is SECURITY DEFINER with `search_path` pinned because it must
   read `auth.users`; it takes no arguments and looks up only the row being inserted.
4. If no auth record is found (which the foreign key makes impossible for clients),
   the supplied value is kept so that privileged/service-role inserts cannot fail on
   the NOT NULL constraint.
5. No behaviour change for legitimate sign-up: the address typed into the form is the
   one the account was created with, so the stored value is identical.
*/

CREATE OR REPLACE FUNCTION public.profiles_force_session_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.id;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    NEW.email := v_email;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_force_session_email_trg ON public.profiles;

CREATE TRIGGER profiles_force_session_email_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_force_session_email();

REVOKE INSERT ON public.profiles FROM authenticated, anon;

GRANT INSERT (id, name, volunteer_type, graduation_year, school_name, phone)
ON public.profiles TO authenticated;
