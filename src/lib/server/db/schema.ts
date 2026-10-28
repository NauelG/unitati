// Aggregates every domain's tables so Drizzle sees a single schema.
// Each domain owns its tables in src/lib/server/<domain>/schema.ts (ADR 0002)
// and is re-exported here. This file never declares a table of its own.
export * from '../auth/schema';
export * from '../auth/authentication-settings-schema';
export * from '../directory/schema';
export * from '../assets/schema';
export * from '../activity/schema';
export * from '../service-desk/schema';
export * from '../projects/schema';
export * from '../links/schema';
export * from '../api/schema';
export * from '../notifications/schema';
export * from '../knowledge/schema';
export * from '../time/schema';
