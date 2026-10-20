ALTER TYPE "public"."activity_verb" ADD VALUE 'handover.waived' BEFORE 'state.changed';--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_waived_has_reason_and_no_link" CHECK ("handovers"."status" <> 'waived' or (
				"handovers"."waive_reason" is not null
				and "handovers"."token_hash" is null
				and "handovers"."body_snapshot" is null
				and "handovers"."template_version_id" is null
			));