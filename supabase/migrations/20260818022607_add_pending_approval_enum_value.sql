/*
# Add PENDING_APPROVAL status (step 1: enum value only)

Adds the 'PENDING_APPROVAL' value to the user_status enum.
This must be committed before any default or policy can reference it.

No existing data is changed. A follow-up migration sets the column
default and tightens RLS policies.
*/

DO $$ BEGIN
  ALTER TYPE public.user_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
