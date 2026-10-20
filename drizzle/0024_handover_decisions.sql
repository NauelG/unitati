ALTER TYPE "public"."activity_verb" ADD VALUE 'handover.accepted' BEFORE 'state.changed';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'handover.rejected' BEFORE 'state.changed';--> statement-breakpoint
ALTER TABLE "handovers" ADD COLUMN "consumed_token_hash" text;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_consumed_token_hash_unique" UNIQUE("consumed_token_hash");--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_accepted_has_evidence" CHECK ("handovers"."status" <> 'accepted' or (
				"handovers"."signature_storage_key" is not null
				and "handovers"."decided_at" is not null
				and "handovers"."signer_ip" is not null
			));--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_rejected_has_reason" CHECK ("handovers"."status" <> 'rejected' or (
				"handovers"."decision_reason" is not null
				and "handovers"."decided_at" is not null
			));