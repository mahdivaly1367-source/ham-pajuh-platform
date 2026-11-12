CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  type varchar(80) NOT NULL,
  title varchar(180) NOT NULL,
  body text NOT NULL DEFAULT '',
  href varchar(500) NOT NULL DEFAULT '/dashboard',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_recipient_created_idx
  ON notification(recipient_id, created_at DESC);

CREATE INDEX notification_recipient_unread_idx
  ON notification(recipient_id, created_at DESC)
  WHERE read_at IS NULL;
