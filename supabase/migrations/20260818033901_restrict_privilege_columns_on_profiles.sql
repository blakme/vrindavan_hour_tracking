/*
# Stop users from writing their own role and account status

## Problem
`profiles` row-level policies allow a user to update their own row, and the
`authenticated` role held INSERT/UPDATE on ALL columns. A row-level rule does not
restrict columns, so any signed-in user could set `role = 'ADMIN'` or
`status = 'ACTIVE'` on their own profile, and the signup insert could create an
already-approved administrator outright.

## Changes

### 1. Column-level privileges on `profiles`
- Revoke table-wide INSERT and UPDATE from `authenticated`.
- Grant INSERT only on: id, email, name, volunteer_type, graduation_year,
  school_name, phone. `role` and `status` fall back to their column defaults
  ('VOLUNTEER' and 'PENDING_APPROVAL'), which is what the app already wanted.
- Grant UPDATE only on: name, volunteer_type, graduation_year, school_name,
  phone, updated_at. Users (and admins) keep editing profile content; nobody
  writes `role`, `status`, `id`, `email` or `created_at` through the data API.

### 2. Privileged functions for legitimate admin changes
- `admin_set_user_role(p_user_id, p_role)` and
  `admin_set_user_status(p_user_id, p_status)` are SECURITY DEFINER functions
  that authorize the CALLER from auth.uid() (must be an ACTIVE ADMIN), validate
  the requested value, and refuse self-targeting. They are the only remaining
  path to those two columns.
- EXECUTE granted to `authenticated` only, revoked from `anon` and `public`.

## Security notes
1. No data is lost: no column, table or row is dropped or altered in type.
2. Existing SELECT and DELETE behaviour on `profiles` is unchanged.
3. Both functions pin `search_path` so a caller cannot shadow the objects used.
*/

-- 1. Column-level privileges ------------------------------------------------

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE ON public.profiles FROM anon;

GRANT INSERT (id, email, name, volunteer_type, graduation_year, school_name, phone)
  ON public.profiles TO authenticated;

GRANT UPDATE (name, volunteer_type, graduation_year, school_name, phone, updated_at)
  ON public.profiles TO authenticated;

-- 2. Privileged role / status mutations --------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  IF p_role NOT IN ('VOLUNTEER', 'GROUP_LEAD', 'ADMIN') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  UPDATE public.profiles
     SET role = p_role::user_role,
         updated_at = now()
   WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own status';
  END IF;

  IF p_status NOT IN ('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.profiles
     SET status = p_status::user_status,
         updated_at = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text) TO authenticated;
