ALTER TYPE "public"."activity_verb" ADD VALUE 'person.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'person.deactivated';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'person.department.changed';--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(coalesce("full_name", '') || ' ' || coalesce("email", '')))) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "people_search_gin" ON "people" USING gin ("search");