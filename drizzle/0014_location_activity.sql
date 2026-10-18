ALTER TYPE "public"."activity_verb" ADD VALUE 'catalogue.location.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'catalogue.location.updated';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'catalogue.location.deleted';--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_exactly_one_target";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "location_id" uuid;--> statement-breakpoint
CREATE INDEX "activity_location_occurred" ON "activity" USING btree ("location_id","occurred_at");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_exactly_one_target" CHECK (("activity"."asset_id" is not null)::int + ("activity"."ticket_id" is not null)::int + ("activity"."task_id" is not null)::int + ("activity"."project_id" is not null)::int + ("activity"."person_id" is not null)::int + ("activity"."location_id" is not null)::int = 1);