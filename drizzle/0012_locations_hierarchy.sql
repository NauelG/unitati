ALTER TABLE "locations" DROP CONSTRAINT "locations_org_name";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_org_parent_idx" ON "locations" USING btree ("organisation_id","parent_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_parent_name" UNIQUE NULLS NOT DISTINCT("organisation_id","parent_id","name");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_code" UNIQUE("organisation_id","code");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_coordinates" CHECK (("locations"."latitude" IS NULL) = ("locations"."longitude" IS NULL) AND ("locations"."latitude" IS NULL OR "locations"."latitude" BETWEEN -90 AND 90) AND ("locations"."longitude" IS NULL OR "locations"."longitude" BETWEEN -180 AND 180));--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_not_own_parent" CHECK ("locations"."parent_id" IS NULL OR "locations"."parent_id" <> "locations"."id");