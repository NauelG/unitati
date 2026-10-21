CREATE TYPE "public"."request_form_kind" AS ENUM('equipment');--> statement-breakpoint
CREATE TABLE "request_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "request_form_kind" NOT NULL,
	"queue_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_forms_org_name" UNIQUE("organisation_id","name")
);
--> statement-breakpoint
CREATE TABLE "ticket_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_category_pair" UNIQUE("ticket_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "request_form_id" uuid;--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "ticket_category_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "ticket_category_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "ticket_category_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "ticket_category_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_category_category_idx" ON "ticket_category" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_request_form_id_request_forms_id_fk" FOREIGN KEY ("request_form_id") REFERENCES "public"."request_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_request_form_idx" ON "tickets" USING btree ("request_form_id");