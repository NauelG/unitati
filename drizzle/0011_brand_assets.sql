CREATE TYPE "public"."brand_asset_slot" AS ENUM('lockup', 'lockup_dark', 'mark', 'favicon', 'apple_touch');--> statement-breakpoint
CREATE TABLE "organisation_brand_assets" (
	"organisation_id" uuid NOT NULL,
	"slot" "brand_asset_slot" NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_brand_assets_organisation_id_slot_pk" PRIMARY KEY("organisation_id","slot"),
	CONSTRAINT "organisation_brand_assets_content_type" CHECK ("organisation_brand_assets"."content_type" in ('image/svg+xml', 'image/webp', 'image/png')),
	CONSTRAINT "organisation_brand_assets_data_size" CHECK (octet_length("organisation_brand_assets"."data") <= 262144),
	CONSTRAINT "organisation_brand_assets_sha256" CHECK ("organisation_brand_assets"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "organisation_brand_assets" ADD CONSTRAINT "organisation_brand_assets_branding_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation_branding"("organisation_id") ON DELETE cascade ON UPDATE no action;