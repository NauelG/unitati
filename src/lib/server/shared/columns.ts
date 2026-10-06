import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Every table carries the same two audit columns, spelled once.
 * `updatedAt` is stamped by the application, not by a trigger, so the value is
 * visible to the code that wrote it.
 */
export const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};
