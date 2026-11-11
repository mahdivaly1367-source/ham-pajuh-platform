CREATE TYPE project_visibility AS ENUM ('public', 'private', 'unlisted');
CREATE TYPE project_status AS ENUM ('idea', 'active', 'paused', 'completed', 'archived');
CREATE TYPE project_member_role AS ENUM ('owner', 'maintainer', 'contributor', 'viewer');
CREATE TYPE collaboration_request_status AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');
CREATE TYPE artifact_type AS ENUM ('source_code', 'document', 'dataset', 'model', 'cad', 'schematic', 'image', 'video', 'simulation', 'other');

CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_user_id_idx ON session(user_id);

CREATE TABLE account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_user_id_idx ON account(user_id);
CREATE UNIQUE INDEX account_provider_account_unique ON account(provider_id, account_id);

CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE profile (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  handle varchar(40) NOT NULL UNIQUE,
  headline varchar(160),
  bio text,
  location varchar(120),
  website text,
  orcid varchar(19),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profile_orcid_unique ON profile(orcid);

CREATE TABLE discipline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  name_fa varchar(120) NOT NULL,
  name_en varchar(120) NOT NULL,
  description text,
  color varchar(24) NOT NULL DEFAULT 'mint',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discipline_active_order_idx ON discipline(is_active, sort_order);

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(140) NOT NULL UNIQUE,
  title varchar(100) NOT NULL,
  summary varchar(280) NOT NULL,
  description text NOT NULL DEFAULT '',
  visibility project_visibility NOT NULL DEFAULT 'private',
  status project_status NOT NULL DEFAULT 'idea',
  discipline_id uuid REFERENCES discipline(id) ON DELETE SET NULL,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_visibility_status_updated_idx ON project(visibility, status, updated_at);
CREATE INDEX project_owner_id_idx ON project(owner_id);
CREATE INDEX project_discipline_id_idx ON project(discipline_id);

CREATE TABLE project_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role project_member_role NOT NULL DEFAULT 'contributor',
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_member_project_user_unique ON project_member(project_id, user_id);
CREATE INDEX project_member_user_id_idx ON project_member(user_id);

CREATE TABLE collaboration_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status collaboration_request_status NOT NULL DEFAULT 'pending',
  reviewed_by text REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collaboration_request_project_status_idx ON collaboration_request(project_id, status);
CREATE INDEX collaboration_request_user_id_idx ON collaboration_request(user_id);

CREATE TABLE tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  label_fa varchar(80) NOT NULL,
  label_en varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_tag (
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX project_tag_project_tag_unique ON project_tag(project_id, tag_id);
CREATE INDEX project_tag_tag_id_idx ON project_tag(tag_id);

CREATE TABLE project_artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  uploaded_by text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  type artifact_type NOT NULL DEFAULT 'other',
  title varchar(180) NOT NULL,
  description text NOT NULL DEFAULT '',
  storage_key text NOT NULL,
  original_filename varchar(255) NOT NULL,
  mime_type varchar(160),
  byte_size text NOT NULL,
  checksum_sha256 varchar(64),
  license_id varchar(80),
  version_label varchar(80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_artifact_project_created_idx ON project_artifact(project_id, created_at);
CREATE INDEX project_artifact_type_idx ON project_artifact(type);

CREATE TABLE activity_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
  event_type varchar(100) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_event_project_time_idx ON activity_event(project_id, occurred_at);
CREATE INDEX activity_event_actor_time_idx ON activity_event(actor_id, occurred_at);

INSERT INTO discipline (slug, name_fa, name_en, color, sort_order) VALUES
('artificial-intelligence', 'هوش مصنوعی', 'Artificial Intelligence', 'violet', 10),
('software', 'نرم‌افزار و علوم رایانه', 'Software & Computer Science', 'blue', 20),
('engineering', 'مهندسی', 'Engineering', 'amber', 30),
('mechanical', 'مکانیک و ساخت', 'Mechanical & Manufacturing', 'amber', 40),
('electronics', 'الکترونیک و برق', 'Electronics & Electrical', 'blue', 50),
('aerospace', 'هوافضا', 'Aerospace', 'violet', 60),
('robotics', 'رباتیک', 'Robotics', 'mint', 70),
('physical-sciences', 'فیزیک و علوم پایه', 'Physical Sciences', 'blue', 80),
('life-sciences', 'زیست‌شناسی و زیست‌فناوری', 'Life Sciences & Biotechnology', 'mint', 90),
('environment', 'محیط زیست و زمین', 'Environment & Earth', 'mint', 100),
('mathematics', 'ریاضیات و آمار', 'Mathematics & Statistics', 'violet', 110),
('humanities', 'علوم انسانی و اجتماعی', 'Humanities & Social Sciences', 'rose', 120),
('education', 'آموزش و یادگیری', 'Education & Learning', 'blue', 130),
('interdisciplinary', 'میان‌رشته‌ای', 'Interdisciplinary', 'mint', 140)
ON CONFLICT (slug) DO NOTHING;
