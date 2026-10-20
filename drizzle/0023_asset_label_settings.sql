CREATE TABLE "asset_label_settings" (
	"organisation_id" uuid PRIMARY KEY NOT NULL,
	"owner_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_label_settings_owner_text_length" CHECK (char_length(btrim("asset_label_settings"."owner_text")) between 1 and 600)
);
--> statement-breakpoint
ALTER TABLE "asset_label_settings" ADD CONSTRAINT "asset_label_settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;