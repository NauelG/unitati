import { eq, sql } from 'drizzle-orm';
import type { StateGroup } from '#lib/domain/status.js';
import type { Database, Transaction } from '../db';
import { states } from './schema';

/**
 * The five states every organisation starts with, one per group, all at
 * `position` 0 — the same rows the migration inserts for organisations that
 * already exist.
 *
 * **They are ordinary rows after this.** Every instance renames, adds and
 * removes them freely (#123). Nothing in the application may look a state up by
 * one of these names; the group is the only thing code depends on. This file and
 * the migration are the only places the words appear in code.
 */
export const DEFAULT_STATES: readonly { name: string; group: StateGroup }[] = [
	{ name: 'Pendiente', group: 'backlog' },
	{ name: 'Por hacer', group: 'unstarted' },
	{ name: 'En curso', group: 'started' },
	{ name: 'Hecho', group: 'completed' },
	{ name: 'Cancelado', group: 'cancelled' }
];

/**
 * Gives an organisation its default states, unless it already has any states at
 * all. Idempotent: a second call, or a call for an organisation whose admin
 * already renamed everything, inserts nothing.
 *
 * Takes the connection, not the viewer, because it runs where an organisation is
 * born — inside the setup transaction, before anybody can sign in.
 */
export async function ensureDefaultStates(
	db: Database | Transaction,
	organisationId: string
): Promise<void> {
	const [existing] = await db
		.select({ one: sql`1` })
		.from(states)
		.where(eq(states.organisationId, organisationId))
		.limit(1);
	if (existing) return;

	await db
		.insert(states)
		.values(DEFAULT_STATES.map((state) => ({ ...state, organisationId, position: 0 })))
		.onConflictDoNothing();
}
