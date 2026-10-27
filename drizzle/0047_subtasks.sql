-- Hand-edited (ADR 0055): `ON DELETE SET NULL ("parent_task_id")` (PostgreSQL 15+) is what Drizzle
-- cannot express. A plain SET NULL would also null `tasks.project_id`, which is NOT NULL. The
-- unique constraint is moved before the foreign key that targets it.
ALTER TYPE "public"."activity_verb" ADD VALUE 'task.parent.changed' BEFORE 'task.attachment.added';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_task_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_unique" UNIQUE("project_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_same_project_fk" FOREIGN KEY ("project_id","parent_task_id") REFERENCES "public"."tasks"("project_id","id") ON DELETE SET NULL ("parent_task_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_not_self" CHECK ("tasks"."parent_task_id" is null or "tasks"."parent_task_id" <> "tasks"."id");
