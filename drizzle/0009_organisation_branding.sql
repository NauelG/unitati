CREATE TABLE "organisation_branding" (
	"organisation_id" uuid PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_branding_product_name_length" CHECK (char_length(btrim("organisation_branding"."product_name")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "organisation_branding" ADD CONSTRAINT "organisation_branding_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;