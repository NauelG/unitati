CREATE TYPE "public"."handover_asset_condition" AS ENUM('good', 'damaged', 'incomplete');--> statement-breakpoint
ALTER TABLE "handover_assets" ADD COLUMN "condition" "handover_asset_condition";--> statement-breakpoint
ALTER TABLE "handover_assets" ADD COLUMN "condition_notes" text;--> statement-breakpoint
ALTER TABLE "handover_assets" ADD CONSTRAINT "handover_assets_notes_need_condition" CHECK ("handover_assets"."condition_notes" is null or "handover_assets"."condition" is not null);