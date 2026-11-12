CREATE TABLE IF NOT EXISTS "project_experiment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "dataset_id" uuid REFERENCES "project_dataset"("id") ON DELETE SET NULL,
  "title" varchar(180) NOT NULL,
  "objective" text DEFAULT '' NOT NULL,
  "hypothesis" text DEFAULT '' NOT NULL,
  "protocol" text DEFAULT '' NOT NULL,
  "materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "controls" text DEFAULT '' NOT NULL,
  "procedure" text DEFAULT '' NOT NULL,
  "observations" text DEFAULT '' NOT NULL,
  "conclusion" text DEFAULT '' NOT NULL,
  "status" varchar(24) DEFAULT 'planned' NOT NULL CHECK ("status" IN ('planned','in_progress','completed','abandoned')),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_experiment_project_created_idx" ON "project_experiment" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_experiment_dataset_idx" ON "project_experiment" USING btree ("dataset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_experiment_status_idx" ON "project_experiment" USING btree ("project_id","status");
