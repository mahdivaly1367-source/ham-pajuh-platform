CREATE TYPE project_discussion_kind AS ENUM ('general', 'question', 'decision', 'review');
CREATE TYPE project_discussion_status AS ENUM ('open', 'resolved');

CREATE TABLE project_discussion_topic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  task_id uuid REFERENCES project_task(id) ON DELETE SET NULL,
  author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  kind project_discussion_kind NOT NULL DEFAULT 'general',
  title varchar(180) NOT NULL,
  body text NOT NULL,
  status project_discussion_status NOT NULL DEFAULT 'open',
  resolved_by text REFERENCES "user"(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_discussion_topic_project_updated_idx ON project_discussion_topic(project_id, updated_at DESC);
CREATE INDEX project_discussion_topic_task_idx ON project_discussion_topic(task_id);
CREATE INDEX project_discussion_topic_author_idx ON project_discussion_topic(author_id);

CREATE TABLE project_discussion_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES project_discussion_topic(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  body text NOT NULL,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_discussion_post_topic_created_idx ON project_discussion_post(topic_id, created_at);
CREATE INDEX project_discussion_post_author_idx ON project_discussion_post(author_id);
