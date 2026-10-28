CREATE TYPE "public"."provisioning_warning_kind" AS ENUM('email_taken');--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'person.identity.linked' BEFORE 'catalogue.location.created';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'person.identity.unlinked' BEFORE 'catalogue.location.created';--> statement-breakpoint
CREATE TABLE "sso_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	CONSTRAINT "sso_providers_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "authentication_settings" (
	"organisation_id" uuid PRIMARY KEY NOT NULL,
	"button_label" text,
	"jit_provisioning" boolean DEFAULT false NOT NULL,
	"sso_required" boolean DEFAULT false NOT NULL,
	"auto_redirect" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_settings_auto_redirect_needs_required" CHECK (not "authentication_settings"."auto_redirect" or "authentication_settings"."sso_required")
);
--> statement-breakpoint
CREATE TABLE "person_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_identities_org_provider_external" UNIQUE("organisation_id","provider","external_id"),
	CONSTRAINT "person_identities_person_provider" UNIQUE("person_id","provider")
);
--> statement-breakpoint
CREATE TABLE "provisioning_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" "provisioning_warning_kind" NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_method" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_settings" ADD CONSTRAINT "authentication_settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_warnings" ADD CONSTRAINT "provisioning_warnings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_identities_person_idx" ON "person_identities" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provisioning_warnings_open_unique" ON "provisioning_warnings" USING btree ("organisation_id","provider","external_id","kind") WHERE "provisioning_warnings"."dismissed_at" is null;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_auth_method" CHECK ("sessions"."auth_method" in ('password', 'sso'));