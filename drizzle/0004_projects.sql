CREATE TYPE "public"."state_group" AS ENUM('backlog', 'unstarted', 'started', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.archived';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.unarchived';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.owner.changed';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.due.changed';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.state.changed';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.assigned';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.unassigned';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.due.changed';--> statement-breakpoint
CREATE SEQUENCE "public"."project_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."task_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"project_tag" text DEFAULT 'PRJ-' || lpad(nextval('project_code_seq')::text, 4, '0') NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_person_id" uuid,
	"due_date" date,
	"archived_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', immutable_unaccent(coalesce("name", '') || ' ' || coalesce("description", '')))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_tag" UNIQUE("organisation_id","project_tag")
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group" "state_group" NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "states_org_name" UNIQUE("organisation_id","name")
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"organisation_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignees_task_id_person_id_pk" PRIMARY KEY("task_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"task_tag" text DEFAULT 'TSK-' || lpad(nextval('task_code_seq')::text, 4, '0') NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"state_id" uuid NOT NULL,
	"due_date" date,
	"position" numeric NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', immutable_unaccent(coalesce("title", '') || ' ' || coalesce("description", '')))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_org_tag" UNIQUE("organisation_id","task_tag")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_person_id");--> statement-breakpoint
CREATE INDEX "projects_search_gin" ON "projects" USING gin ("search");--> statement-breakpoint
CREATE INDEX "task_assignees_person_idx" ON "task_assignees" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "tasks_column_idx" ON "tasks" USING btree ("project_id","state_id","position");--> statement-breakpoint
CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "tasks_search_gin" ON "tasks" USING gin ("search");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_task_occurred" ON "activity" USING btree ("task_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_project_occurred" ON "activity" USING btree ("project_id","occurred_at");--> statement-breakpoint
-- The five default states, for every organisation that exists today and has none.
-- Deployed instances already hold their organisation row, so the migration is the only
-- place they can get them; new organisations are given theirs by `ensureDefaultStates`.
-- Ordinary rows from here on: renamed, added to and removed freely (#123).
INSERT INTO "states" ("organisation_id", "name", "group", "position")
SELECT "organisations"."id", "defaults"."name", "defaults"."group"::"state_group", 0
FROM "organisations"
CROSS JOIN (VALUES
	('Pendiente', 'backlog'),
	('Por hacer', 'unstarted'),
	('En curso', 'started'),
	('Hecho', 'completed'),
	('Cancelado', 'cancelled')
) AS "defaults" ("name", "group")
WHERE NOT EXISTS (
	SELECT 1 FROM "states" WHERE "states"."organisation_id" = "organisations"."id"
);
