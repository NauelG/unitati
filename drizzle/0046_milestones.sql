-- Hand-edited: `ON DELETE SET NULL ("milestone_id")` (PostgreSQL 15+) is what Drizzle cannot
-- express. A plain SET NULL would also null `tasks.project_id`, which is NOT NULL.
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.milestone.created' BEFORE 'task.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.milestone.changed' BEFORE 'task.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.milestone.deleted' BEFORE 'task.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.milestone.changed' BEFORE 'task.attachment.added';--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"target_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_project_id_id" UNIQUE("project_id","id"),
	CONSTRAINT "milestones_dates_ordered" CHECK ("milestones"."start_date" <= "milestones"."target_date")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_project_order_idx" ON "milestones" USING btree ("project_id","start_date","target_date");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_same_project_fk" FOREIGN KEY ("project_id","milestone_id") REFERENCES "public"."milestones"("project_id","id") ON DELETE SET NULL ("milestone_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_milestone_idx" ON "tasks" USING btree ("milestone_id");