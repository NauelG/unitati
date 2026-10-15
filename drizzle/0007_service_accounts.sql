CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_by_user_id" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_accounts_not_admin" CHECK ("service_accounts"."role" <> 'admin')
);
--> statement-breakpoint
DROP INDEX "api_keys_owner_active_name";--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "actor_service_account_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "service_account_id" uuid;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_accounts_org_name" ON "service_accounts" USING btree ("organisation_id",lower("name"));--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_service_account_id_service_accounts_id_fk" FOREIGN KEY ("actor_service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_service_account" ON "api_keys" USING btree ("service_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_owner_active_name" ON "api_keys" USING btree (coalesce("owner_user_id", "service_account_id"::text),lower("name")) WHERE "api_keys"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_at_most_one_actor" CHECK (num_nonnulls("activity"."actor_person_id", "activity"."actor_service_account_id") <= 1);--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_exactly_one_principal" CHECK (num_nonnulls("api_keys"."owner_user_id", "api_keys"."service_account_id") = 1);