CREATE TYPE "public"."handover_status" AS ENUM('pending', 'accepted', 'rejected', 'waived');--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'handover.issued' BEFORE 'state.changed';--> statement-breakpoint
CREATE SEQUENCE "public"."handover_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "handover_assets" (
	"handover_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"asset_tag_snapshot" text NOT NULL,
	"asset_name_snapshot" text NOT NULL,
	"serial_snapshot" text,
	"model_snapshot" text NOT NULL,
	CONSTRAINT "handover_assets_handover_id_asset_id_pk" PRIMARY KEY("handover_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" text DEFAULT 'HND-' || lpad(nextval('handover_code_seq')::text, 4, '0') NOT NULL,
	"direction" "handover_direction" NOT NULL,
	"status" "handover_status" NOT NULL,
	"person_id" uuid NOT NULL,
	"person_name_snapshot" text NOT NULL,
	"recipient_email_snapshot" text NOT NULL,
	"template_version_id" uuid,
	"body_snapshot" text,
	"body_sha256" text,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"issued_by_person_id" uuid,
	"issued_by_service_account_id" uuid,
	"issued_at" timestamp with time zone NOT NULL,
	"waive_reason" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"signature_storage_key" text,
	"signer_ip" "inet",
	"signer_user_agent" text,
	"document_storage_key" text,
	"document_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handovers_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "handovers_org_code" UNIQUE("organisation_id","code"),
	CONSTRAINT "handovers_at_most_one_issuer" CHECK (num_nonnulls("handovers"."issued_by_person_id", "handovers"."issued_by_service_account_id") <= 1),
	CONSTRAINT "handovers_pending_has_link_and_text" CHECK ("handovers"."status" <> 'pending' or (
				"handovers"."token_hash" is not null
				and "handovers"."expires_at" is not null
				and "handovers"."body_snapshot" is not null
				and "handovers"."body_sha256" is not null
				and "handovers"."template_version_id" is not null
			))
);
--> statement-breakpoint
ALTER TABLE "handover_assets" ADD CONSTRAINT "handover_assets_handover_id_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_assets" ADD CONSTRAINT "handover_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_template_version_id_handover_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."handover_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_issued_by_person_id_people_id_fk" FOREIGN KEY ("issued_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_issued_by_service_account_id_service_accounts_id_fk" FOREIGN KEY ("issued_by_service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handovers_person_idx" ON "handovers" USING btree ("person_id");