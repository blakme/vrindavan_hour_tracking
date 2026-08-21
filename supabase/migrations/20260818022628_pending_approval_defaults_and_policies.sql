/*
# Require admin approval for new sign-ups (step 2: defaults + policies)

## Purpose
New volunteers who sign up should start in a PENDING_APPROVAL state.
An admin must activate them before they can log service hours.

## Changes

### 1. profiles table default
- Change the column default for `status` from 'ACTIVE' to 'PENDING_APPROVAL'
  so any new profile row created without an explicit status starts pending.
  Existing rows are NOT changed.

### 2. hour_entries INSERT policy
- A volunteer may only insert their own row IF their profile status is 'ACTIVE'.
  PENDING_APPROVAL and INACTIVE users are blocked from logging hours at the
  database level.

### 3. hour_entries UPDATE policy
- A volunteer may only update their own entries if their profile status is
  'ACTIVE'. Leads and admins are unaffected.

## Security
- RLS remains enabled. Policies are stricter, not looser. No data loss.
*/

-- 1. Change profiles.status default to PENDING_APPROVAL for new rows
ALTER TABLE public.profiles
  ALTER COLUMN status SET DEFAULT 'PENDING_APPROVAL';

-- 2. Replace hour_entries INSERT policy: only ACTIVE volunteers may insert
DROP POLICY IF EXISTS "he_insert_own" ON public.hour_entries;
CREATE POLICY "he_insert_own"
  ON public.hour_entries FOR INSERT TO authenticated
  WITH CHECK (
    volunteer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'ACTIVE'
    )
  );

-- 3. Replace hour_entries UPDATE policy: volunteer self-edit requires ACTIVE
DROP POLICY IF EXISTS "he_update_own_pending_or_lead_or_admin" ON public.hour_entries;
CREATE POLICY "he_update_own_pending_or_lead_or_admin"
  ON public.hour_entries FOR UPDATE TO authenticated
  USING (
    (volunteer_id = auth.uid())
    OR is_admin()
    OR is_category_lead_of(category_id)
  )
  WITH CHECK (
    (
      volunteer_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'ACTIVE'
      )
    )
    OR is_admin()
    OR is_category_lead_of(category_id)
  );
