ALTER TABLE "follows" DROP CONSTRAINT "follows_exactly_one_target";--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN "page_id" uuid;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_person_page" ON "follows" USING btree ("person_id","page_id") WHERE "follows"."page_id" is not null;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_exactly_one_target" CHECK (num_nonnulls("follows"."ticket_id", "follows"."task_id", "follows"."project_id", "follows"."page_id") = 1);