CREATE TABLE profile_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profile(user_id) ON DELETE CASCADE,
  label varchar(80) NOT NULL,
  normalized_label varchar(80) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profile_skill_user_normalized_unique
  ON profile_skill(user_id, normalized_label);
CREATE INDEX profile_skill_normalized_label_idx
  ON profile_skill(normalized_label);
CREATE INDEX profile_skill_user_order_idx
  ON profile_skill(user_id, sort_order);
