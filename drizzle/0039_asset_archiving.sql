ALTER TYPE "public"."activity_verb" ADD VALUE 'asset.archived' BEFORE 'custody.assigned';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'asset.unarchived' BEFORE 'custody.assigned';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "archived_at" timestamp with time zone;