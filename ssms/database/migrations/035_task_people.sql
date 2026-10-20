-- =============================================================================
-- SSMS — Migration 035: Tasks for people inside a department, and plans ↔ tasks
-- Depends on: 019 (tasks), 032 (plan_activities)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • tasks.assignee_person_id — the person in the department who does the work.
--   The head chooses them; they report progress on the website ("My tasks") or
--   in the Telegram bot ("🗂️ My tasks"), even without a website account.
-- • tasks.internal — a task the department gives its own people (the head
--   reviews it), not one from the Executive Committee.
-- • tasks.parent_task_id — part of a bigger task (a department splits an
--   Executive Committee task among its people).
-- • tasks.plan_activity_id — the activity of the department's yearly plan the
--   task carries out.
-- • task_updates.author_person_id — who reported, when they have no website
--   account (a report from the bot); kind 'HANDED' = given to a person.
-- =============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_person_id UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS internal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_activity_id UUID REFERENCES plan_activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_person_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_activity ON tasks(plan_activity_id);

ALTER TABLE task_updates ADD COLUMN IF NOT EXISTS author_person_id UUID REFERENCES persons(id) ON DELETE SET NULL;

-- One more kind of history entry: 'HANDED' (given to a person in the department)
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'task_updates'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE task_updates DROP CONSTRAINT %I', c);
  END IF;
  ALTER TABLE task_updates ADD CONSTRAINT task_updates_kind_check
    CHECK (kind IN ('PROGRESS', 'SUBMITTED', 'RETURNED', 'COMPLETED', 'CANCELLED', 'REMINDED', 'HANDED'));
END $$;
