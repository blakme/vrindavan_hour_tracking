/*
# Add CYSP Categories parent with five sub-groups

## Purpose
The user requested that "Arts & Crafts", "Bioscience", "Green", "Media", and
"Technology" be listed as sub-categories under a new top-level parent called
"CYSP Categories".

## Changes
- Inserts a new top-level (parent_id IS NULL) category named "CYSP Categories"
  with is_active=true, ordered after the existing parents (order = 5).
- Inserts five child categories under that parent: Arts & Crafts, Bioscience,
  Green, Media, Technology — each is_active=true, ordered 1–5.
- All inserts are idempotent (WHERE NOT EXISTS) so re-running is safe.
- No tables, columns, or policies are changed.
- No data is deleted or modified.

## Notes
These are NEW category rows. The existing project_groups table already has
entries with the same names — those are separate reference data used for group
membership. The new rows here are categories in the two-tier category hierarchy,
intentionally grouped under "CYSP Categories".
*/

DO $$
DECLARE
  v_cysp_id uuid;
BEGIN
  -- Create the parent "CYSP Categories" if it doesn't exist
  SELECT id INTO v_cysp_id
  FROM public.categories
  WHERE name = 'CYSP Categories' AND parent_id IS NULL;

  IF v_cysp_id IS NULL THEN
    INSERT INTO public.categories (name, parent_id, is_active, "order")
    VALUES ('CYSP Categories', NULL, true, 5)
    RETURNING id INTO v_cysp_id;
  END IF;

  -- Children under CYSP Categories
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Arts & Crafts', v_cysp_id, true, 1
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.name = 'Arts & Crafts' AND c.parent_id = v_cysp_id
  );

  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Bioscience', v_cysp_id, true, 2
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.name = 'Bioscience' AND c.parent_id = v_cysp_id
  );

  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Green', v_cysp_id, true, 3
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.name = 'Green' AND c.parent_id = v_cysp_id
  );

  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Media', v_cysp_id, true, 4
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.name = 'Media' AND c.parent_id = v_cysp_id
  );

  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Technology', v_cysp_id, true, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.name = 'Technology' AND c.parent_id = v_cysp_id
  );
END $$;
