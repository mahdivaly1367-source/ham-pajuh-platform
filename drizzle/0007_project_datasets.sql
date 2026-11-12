CREATE TABLE IF NOT EXISTS "project_dataset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "title" varchar(180) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "data_format" varchar(60) NOT NULL,
  "license" varchar(80) DEFAULT '' NOT NULL,
  "doi" varchar(120) DEFAULT '' NOT NULL,
  "record_count" integer,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "methodology" text DEFAULT '' NOT NULL,
  "source_reference" varchar(500) DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dataset_project_created_idx" ON "project_dataset" USING btree ("project_id","created_at");
