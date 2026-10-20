CREATE TYPE "public"."handover_direction" AS ENUM('delivery', 'return');--> statement-breakpoint
CREATE TABLE "handover_settings" (
	"organisation_id" uuid PRIMARY KEY NOT NULL,
	"link_valid_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_settings_link_valid_days" CHECK ("handover_settings"."link_valid_days" between 1 and 90)
);
--> statement-breakpoint
CREATE TABLE "handover_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_template_versions_template_version" UNIQUE("template_id","version")
);
--> statement-breakpoint
CREATE TABLE "handover_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"direction" "handover_direction" NOT NULL,
	"category_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_templates_org_direction_category" UNIQUE NULLS NOT DISTINCT("organisation_id","direction","category_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "requires_handover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "handover_settings" ADD CONSTRAINT "handover_settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_template_versions" ADD CONSTRAINT "handover_template_versions_template_id_handover_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."handover_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_template_versions" ADD CONSTRAINT "handover_template_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_templates" ADD CONSTRAINT "handover_templates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_templates" ADD CONSTRAINT "handover_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;