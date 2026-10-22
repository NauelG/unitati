CREATE TYPE "public"."knowledge_space_audience" AS ENUM('staff', 'portal');--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'space.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'space.audience.changed';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'space.archived';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.published';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.moved';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.archived';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.unarchived';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.revision.restored';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.attachment.added';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'page.attachment.removed';--> statement-breakpoint
CREATE SEQUENCE "public"."page_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "knowledge_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text NOT NULL,
	"colour" text NOT NULL,
	"audience" "knowledge_space_audience" NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_spaces_org_name" UNIQUE("organisation_id","name")
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_revisions_page_number" UNIQUE("page_id","number")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_id" uuid,
	"page_tag" text DEFAULT 'DOC-' || lpad(nextval('page_code_seq')::text, 4, '0') NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"position" numeric NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by_person_id" uuid,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', immutable_unaccent(coalesce("title", '') || ' ' || coalesce("body", ''))) || to_tsvector('simple', immutable_unaccent(coalesce("page_tag", '')))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_org_tag" UNIQUE("organisation_id","page_tag"),
	CONSTRAINT "pages_not_own_parent" CHECK ("pages"."parent_id" <> "pages"."id")
);
--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_exactly_one_target";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "page_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_spaces" ADD CONSTRAINT "knowledge_spaces_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_knowledge_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."knowledge_spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pages_space_parent_position" ON "pages" USING btree ("space_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "pages_search_gin" ON "pages" USING gin ("search");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_space_id_knowledge_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."knowledge_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_space_occurred" ON "activity" USING btree ("space_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_page_occurred" ON "activity" USING btree ("page_id","occurred_at");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_exactly_one_target" CHECK (("activity"."asset_id" is not null)::int + ("activity"."ticket_id" is not null)::int + ("activity"."task_id" is not null)::int + ("activity"."project_id" is not null)::int + ("activity"."person_id" is not null)::int + ("activity"."location_id" is not null)::int + ("activity"."space_id" is not null)::int + ("activity"."page_id" is not null)::int = 1);