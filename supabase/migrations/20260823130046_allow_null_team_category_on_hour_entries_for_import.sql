/*
# Allow nullable team_id and category_id on hour_entries for spreadsheet import

## Purpose
The Track it Forward spreadsheet import can contain hour entries whose
Category does not match any existing category in our system. Per the product
owner's decision, those entries should still be imported but left "unassigned"
(category_id = NULL). The spreadsheet also has no beneficiary team column, so
team_id must also be nullable for imported rows.

## Changes
1. ALTER TABLE hour_entries: make `team_id` and `category_id` nullable (DROP NOT NULL).
2. Update the existing CHECK constraint so it allows sub_category_id to be NULL
   when category_id is NULL (the old check already required category_id for
   sub_category_id, which is still fine — but category_id itself can now be NULL).

## Security
- No RLS policy changes. RLS remains enabled on hour_entries.
- No data loss: existing rows keep their values; only the NOT NULL constraint is relaxed.
- The hour_entries_hours_check (0.25–24.00) remains in force.
*/

ALTER TABLE public.hour_entries ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE public.hour_entries ALTER COLUMN category_id DROP NOT NULL;

-- The existing CHECK is: (sub_category_id IS NULL OR category_id IS NOT NULL)
-- That still holds correctly with category_id nullable. No change needed.
