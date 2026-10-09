ALTER TYPE "public"."activity_verb" ADD VALUE 'link.asset.added';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'link.asset.removed';--> statement-breakpoint
CREATE TABLE "ticket_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_asset_pair" UNIQUE("ticket_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_asset" ADD CONSTRAINT "ticket_asset_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_asset" ADD CONSTRAINT "ticket_asset_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_asset" ADD CONSTRAINT "ticket_asset_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_asset" ADD CONSTRAINT "ticket_asset_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_asset_asset_idx" ON "ticket_asset" USING btree ("asset_id");