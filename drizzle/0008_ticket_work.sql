ALTER TYPE "public"."activity_verb" ADD VALUE 'link.task.added' BEFORE 'project.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'link.task.removed' BEFORE 'project.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'link.project.added' BEFORE 'project.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'link.project.removed' BEFORE 'project.created';--> statement-breakpoint
CREATE TABLE "ticket_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_project_pair" UNIQUE("ticket_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_task_pair" UNIQUE("ticket_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_project" ADD CONSTRAINT "ticket_project_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_project" ADD CONSTRAINT "ticket_project_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_project" ADD CONSTRAINT "ticket_project_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_project" ADD CONSTRAINT "ticket_project_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_task" ADD CONSTRAINT "ticket_task_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_task" ADD CONSTRAINT "ticket_task_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_task" ADD CONSTRAINT "ticket_task_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_task" ADD CONSTRAINT "ticket_task_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_project_project_idx" ON "ticket_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ticket_task_task_idx" ON "ticket_task" USING btree ("task_id");