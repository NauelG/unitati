ALTER TYPE "public"."activity_verb" ADD VALUE 'ticket.subject.changed' BEFORE 'link.asset.added';--> statement-breakpoint
ALTER TYPE "public"."activity_verb" ADD VALUE 'comment.edited' BEFORE 'link.asset.added';--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD COLUMN "edited_at" timestamp with time zone;