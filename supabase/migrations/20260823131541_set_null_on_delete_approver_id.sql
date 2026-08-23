/*
# Allow user deletion when they have approved hours

## Problem
hour_entries.approver_id has a plain FK to profiles(id) with no ON DELETE
clause, so the default RESTRICT applies. If an admin (or lead) approved any
hour entries, deleting their account fails with a foreign-key violation.

## Fix
Replace the approver_id FK with ON DELETE SET NULL so that when a user is
deleted, entries they approved keep their approved status but lose the
reference to the deleted approver. This is the correct semantic: the approval
decision was already made and should persist; only the audit trail of *who*
approved it is lost (which is unavoidable when the account no longer exists).

## Security
- No RLS changes. No data lost beyond the approver reference column.
- hour_entries rows themselves are preserved.
*/
ALTER TABLE public.hour_entries
  DROP CONSTRAINT IF EXISTS hour_entries_approver_id_fkey,
  ADD CONSTRAINT hour_entries_approver_id_fkey
    FOREIGN KEY (approver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
