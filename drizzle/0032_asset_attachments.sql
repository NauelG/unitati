ALTER TYPE "public"."activity_verb" ADD VALUE 'asset.attachment.added' BEFORE 'ticket.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'asset.attachment.removed' BEFORE 'ticket.created';--> statement-breakpoint
CREATE TABLE "asset_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"uploaded_by_person_id" uuid,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_uploaded_by_person_id_people_id_fk" FOREIGN KEY ("uploaded_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_attachments_asset_idx" ON "asset_attachments" USING btree ("asset_id");