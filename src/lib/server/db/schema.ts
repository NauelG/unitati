// Aggregates every domain's tables so Drizzle sees a single schema.
// Each domain owns its tables in src/lib/server/<domain>/schema.ts (ADR 0002)
// and is re-exported here. This file never declares a table of its own.
export * from '../auth/schema';
export * from '../directory/schema';
