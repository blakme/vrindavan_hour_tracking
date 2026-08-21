/*
# Keep the email-forcing trigger function off the public API

1. Problem
- `public.profiles_force_session_email()` is a trigger function, but it was created
  with the default EXECUTE grant to `public`, so the database linter reported it as a
  SECURITY DEFINER function callable over the REST API by anyone.

2. Change
- Revokes EXECUTE from `public`, `anon` and `authenticated`.

3. Security notes
1. PostgreSQL checks EXECUTE permission on a trigger function when the trigger is
   created, not each time it fires, so the existing
   `profiles_force_session_email_trg` trigger keeps working for sign-up.
2. Nothing calls the function directly; it is only ever run by that trigger.
*/

REVOKE ALL ON FUNCTION public.profiles_force_session_email() FROM public, anon, authenticated;
