-- Hand-written preamble. drizzle-kit diffs tables, not extensions or functions,
-- so these statements are not regenerated and must not be removed: the
-- generated `search` columns below call immutable_unaccent() and the tables
-- cannot be created without it.
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
-- `unaccent(text)` is STABLE, not IMMUTABLE, because the dictionary it reads
-- could be reloaded within a session. Postgres refuses a non-immutable
-- expression in a generated column -- `ERROR: generation expression is not
-- immutable` -- so the dictionary is pinned by name here and the result
-- declared immutable, which is true as long as nobody edits unaccent.rules.
-- STRICT so a NULL input short-circuits; PARALLEL SAFE so a search over the
-- GIN index can still be parallelised.
CREATE OR REPLACE FUNCTION "public"."immutable_unaccent"(text)
	RETURNS text
	LANGUAGE sql
	IMMUTABLE
	PARALLEL SAFE
	STRICT
AS $$ SELECT "public"."unaccent"('"public"."unaccent"'::regdictionary, $1) $$;--> statement-breakpoint
CREATE TYPE "public"."asset_state" AS ENUM('in_use', 'in_repair', 'in_stock', 'retired');--> statement-breakpoint
CREATE TYPE "public"."activity_verb" AS ENUM('asset.created', 'custody.assigned', 'custody.returned', 'state.changed', 'location.changed', 'note.added');--> statement-breakpoint
CREATE SEQUENCE "public"."asset_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "asset_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(coalesce("name", '')))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_models_org_manufacturer_name" UNIQUE("organisation_id","manufacturer_id","name")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"asset_tag" text DEFAULT 'AST-' || lpad(nextval('asset_code_seq')::text, 4, '0') NOT NULL,
	"name" text NOT NULL,
	"serial" text,
	"asset_model_id" uuid NOT NULL,
	"state" "asset_state" DEFAULT 'in_stock' NOT NULL,
	"custodian_person_id" uuid,
	"shared" boolean DEFAULT false NOT NULL,
	"location_id" uuid,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(coalesce("name", '') || ' ' || coalesce("asset_tag", '') || ' ' || coalesce("serial", '')))) STORED NOT NULL,
	"search_shared" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(coalesce("name", '') || ' ' || coalesce("asset_tag", '')))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_org_tag" UNIQUE("organisation_id","asset_tag")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_org_name" UNIQUE("organisation_id","name")
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manufacturers_org_name" UNIQUE("organisation_id","name")
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"actor_person_id" uuid,
	"verb" "activity_verb" NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" uuid,
	"ticket_id" uuid,
	"task_id" uuid,
	"project_id" uuid,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_exactly_one_target" CHECK (("activity"."asset_id" is not null)::int + ("activity"."ticket_id" is not null)::int + ("activity"."task_id" is not null)::int + ("activity"."project_id" is not null)::int + ("activity"."person_id" is not null)::int = 1)
);
--> statement-breakpoint
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "public"."asset_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_custodian_person_id_people_id_fk" FOREIGN KEY ("custodian_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_models_search_gin" ON "asset_models" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_org_serial" ON "assets" USING btree ("organisation_id","serial") WHERE "serial" is not null;--> statement-breakpoint
CREATE INDEX "assets_org_idx" ON "assets" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "assets_custodian_idx" ON "assets" USING btree ("custodian_person_id");--> statement-breakpoint
CREATE INDEX "assets_model_idx" ON "assets" USING btree ("asset_model_id");--> statement-breakpoint
CREATE INDEX "assets_search_gin" ON "assets" USING gin ("search");--> statement-breakpoint
CREATE INDEX "assets_search_shared_gin" ON "assets" USING gin ("search_shared");--> statement-breakpoint
CREATE INDEX "activity_asset_occurred" ON "activity" USING btree ("asset_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_person_occurred" ON "activity" USING btree ("person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_org_occurred" ON "activity" USING btree ("organisation_id","occurred_at");