CREATE TYPE project_task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');
CREATE TYPE project_task_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE project_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  assignee_id text REFERENCES "user"(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  description text NOT NULL DEFAULT '',
  status project_task_status NOT NULL DEFAULT 'todo',
  priority project_task_priority NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_task_project_status_created_idx
  ON project_task(project_id, status, created_at DESC);
CREATE INDEX project_task_assignee_status_idx
  ON project_task(assignee_id, status);
