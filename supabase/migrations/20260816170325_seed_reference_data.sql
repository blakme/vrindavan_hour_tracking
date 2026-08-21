/*
# Seed reference data + demo accounts

1. Reference data
- Project Groups: Arts & Crafts, Technology, Bioscience, Green, Media
- Beneficiary Teams: CYSP, Temple
- Categories (two-tier):
  Temple Events -> Festival Setup, Puja Support, Cleanup, Prasad Seva
  Balavihar House Events -> House Meeting, House Competition, Community Service
  Balavihar Activities -> Class Assistance, Craft & Skit, Material Prep
  Gita Activities -> Weekly Gita Class, Chanting Practice, Gita Chanting Competition
- Default global milestone: "Annual Seva Goal" 100 hours, Jan 1–Dec 31 2026.

2. Demo accounts (created via Supabase Auth admin API is not available from SQL,
   so this migration only inserts reference rows + milestone. Demo user auth
   accounts and their profiles/memberships/hour entries are created through the
   app's seed edge function in a follow-up step, OR manually by the admin.)
*/
INSERT INTO public.project_groups (name, is_active)
SELECT name, true
FROM (VALUES
  ('Arts & Crafts'),
  ('Technology'),
  ('Bioscience'),
  ('Green'),
  ('Media')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.project_groups pg WHERE pg.name = v.name);

INSERT INTO public.beneficiary_teams (name, is_active)
SELECT name, true
FROM (VALUES
  ('CYSP'),
  ('Temple')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.beneficiary_teams bt WHERE bt.name = v.name);

-- Categories: parents first, then children. We insert with explicit ids so
-- children can reference parents deterministically and the migration is re-runnable.
-- Use a DO block to upsert by name to keep it idempotent.
DO $$
DECLARE
  temple_id uuid;
  balavihar_house_id uuid;
  balavihar_act_id uuid;
  gita_id uuid;
BEGIN
  -- Temple Events (parent)
  SELECT id INTO temple_id FROM public.categories WHERE name = 'Temple Events' AND parent_id IS NULL;
  IF temple_id IS NULL THEN
    INSERT INTO public.categories (name, parent_id, is_active, "order")
    VALUES ('Temple Events', NULL, true, 1)
    RETURNING id INTO temple_id;
  END IF;

  -- Balavihar House Events (parent)
  SELECT id INTO balavihar_house_id FROM public.categories WHERE name = 'Balavihar House Events' AND parent_id IS NULL;
  IF balavihar_house_id IS NULL THEN
    INSERT INTO public.categories (name, parent_id, is_active, "order")
    VALUES ('Balavihar House Events', NULL, true, 2)
    RETURNING id INTO balavihar_house_id;
  END IF;

  -- Balavihar Activities (parent)
  SELECT id INTO balavihar_act_id FROM public.categories WHERE name = 'Balavihar Activities' AND parent_id IS NULL;
  IF balavihar_act_id IS NULL THEN
    INSERT INTO public.categories (name, parent_id, is_active, "order")
    VALUES ('Balavihar Activities', NULL, true, 3)
    RETURNING id INTO balavihar_act_id;
  END IF;

  -- Gita Activities (parent)
  SELECT id INTO gita_id FROM public.categories WHERE name = 'Gita Activities' AND parent_id IS NULL;
  IF gita_id IS NULL THEN
    INSERT INTO public.categories (name, parent_id, is_active, "order")
    VALUES ('Gita Activities', NULL, true, 4)
    RETURNING id INTO gita_id;
  END IF;

  -- Children: Temple Events
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Festival Setup', temple_id, true, 1
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Festival Setup' AND c.parent_id = temple_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Puja Support', temple_id, true, 2
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Puja Support' AND c.parent_id = temple_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Cleanup', temple_id, true, 3
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Cleanup' AND c.parent_id = temple_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Prasad Seva', temple_id, true, 4
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Prasad Seva' AND c.parent_id = temple_id);

  -- Children: Balavihar House Events
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'House Meeting', balavihar_house_id, true, 1
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'House Meeting' AND c.parent_id = balavihar_house_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'House Competition', balavihar_house_id, true, 2
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'House Competition' AND c.parent_id = balavihar_house_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Community Service', balavihar_house_id, true, 3
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Community Service' AND c.parent_id = balavihar_house_id);

  -- Children: Balavihar Activities
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Class Assistance', balavihar_act_id, true, 1
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Class Assistance' AND c.parent_id = balavihar_act_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Craft & Skit', balavihar_act_id, true, 2
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Craft & Skit' AND c.parent_id = balavihar_act_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Material Prep', balavihar_act_id, true, 3
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Material Prep' AND c.parent_id = balavihar_act_id);

  -- Children: Gita Activities
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Weekly Gita Class', gita_id, true, 1
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Weekly Gita Class' AND c.parent_id = gita_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Chanting Practice', gita_id, true, 2
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Chanting Practice' AND c.parent_id = gita_id);
  INSERT INTO public.categories (name, parent_id, is_active, "order")
  SELECT 'Gita Chanting Competition', gita_id, true, 3
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = 'Gita Chanting Competition' AND c.parent_id = gita_id);
END $$;

-- Default global milestone for 2026
INSERT INTO public.milestones (name, target_hours, period_start, period_end, scope, project_group_id)
SELECT 'Annual Seva Goal 2026', 100, '2026-01-01'::date, '2026-12-31'::date, 'GLOBAL', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.milestones m WHERE m.name = 'Annual Seva Goal 2026' AND m.scope = 'GLOBAL'
);
