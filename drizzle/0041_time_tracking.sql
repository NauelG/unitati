CREATE TABLE "running_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"ticket_id" uuid,
	"task_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "running_timers_person_id_unique" UNIQUE("person_id"),
	CONSTRAINT "running_timers_exactly_one_target" CHECK (num_nonnulls("running_timers"."ticket_id", "running_timers"."task_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ticket_id" uuid,
	"task_id" uuid,
	"person_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"work_date" date NOT NULL,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_minutes_positive" CHECK ("time_entries"."minutes" > 0),
	CONSTRAINT "time_entries_exactly_one_target" CHECK (num_nonnulls("time_entries"."ticket_id", "time_entries"."task_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "time_entry_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entry_types_name_not_empty" CHECK (length(trim("time_entry_types"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "time_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "running_timers" ADD CONSTRAINT "running_timers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timers" ADD CONSTRAINT "running_timers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timers" ADD CONSTRAINT "running_timers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timers" ADD CONSTRAINT "running_timers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_type_id_time_entry_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."time_entry_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_types" ADD CONSTRAINT "time_entry_types_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_org_work_date" ON "time_entries" USING btree ("organisation_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_ticket" ON "time_entries" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "time_entries_task" ON "time_entries" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "time_entries_person_work_date" ON "time_entries" USING btree ("person_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_types_org_name" ON "time_entry_types" USING btree ("organisation_id",lower("name")) WHERE "time_entry_types"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_types_org_default" ON "time_entry_types" USING btree ("organisation_id") WHERE "time_entry_types"."is_default" and "time_entry_types"."archived_at" is null;