ALTER TYPE project_task_status ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE project_task_status ADD VALUE IF NOT EXISTS 'changes_requested';

ALTER TABLE project_task
  ADD COLUMN review_requested_at timestamptz,
  ADD COLUMN review_submitted_by text REFERENCES "user"(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by text REFERENCES "user"(id) ON DELETE SET NULL,
  ADD COLUMN review_comment text NOT NULL DEFAULT '';

CREATE INDEX project_task_review_status_idx
  ON project_task(project_id, status, review_requested_at DESC);
