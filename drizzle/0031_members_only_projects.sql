CREATE TYPE "public"."project_visibility" AS ENUM('organisation', 'members');--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.visibility.changed' BEFORE 'project.attachment.added';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.member.added' BEFORE 'project.attachment.added';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'project.member.removed' BEFORE 'project.attachment.added';--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_person_id_pk" PRIMARY KEY("project_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "visibility" "project_visibility" DEFAULT 'organisation' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_members_person_idx" ON "project_members" USING btree ("person_id");