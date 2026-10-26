import { eq } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import type { Executor } from '../db';
import { organisations } from '../directory/schema';
import { uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { runningTimers, timeEntryTypes } from './schema';

/**
 * The organisation's time tracking switch (ADR 0052). Off by default, and while
 * off nothing about time is shown or written. The column lives on
 * `organisations` (the directory owns that table, as it does for
 * `technicians_edit_directory`), but the switch has consequences only this
 * domain knows, so it is set from here.
 */

/** The type seeded the first time tracking is switched on. */
export const SEEDED_TYPE_NAME = 'General';

export async function isTimeTrackingEnabled(
	organisationId: string,
	executor: Executor = getDb()
): Promise<boolean> {
	const [row] = await executor
		.select({ enabled: organisations.timeTrackingEnabled })
		.from(organisations)
		.where(eq(organisations.id, organisationId))
		.limit(1);
	return row?.enabled ?? false;
}

/**
 * Takes the organisation's row as the lock of its time configuration: the
 * catalogue, the switch and the timers all serialise on it (ADR 0052), which is
 * what turns "two first writers" into one after the other instead of a unique
 * violation. `update` for the writers of the catalogue and the switch, `share`
 * for the writers that only need the switch to hold (timers). Returns the
 * switch as read **under the lock**, the only reading that can be trusted.
 */
export async function lockOrganisation(
	tx: Executor,
	organisationId: string,
	mode: 'update' | 'share'
): Promise<boolean> {
	const query = tx
		.select({ enabled: organisations.timeTrackingEnabled })
		.from(organisations)
		.where(eq(organisations.id, organisationId));
	const [row] = await (mode === 'update' ? query.for('update') : query.for('share'));
	return row?.enabled ?? false;
}

/**
 * Admin only (`time.manage`).
 *
 * **On** seeds one default type, `General`, when the organisation has none, so
 * the first entry never meets an empty catalogue. **Off** discards every running
 * timer of the organisation: a timer that cannot be saved is worse than none.
 * The entries are kept and reappear when it is switched back on.
 */
export async function setTimeTracking(
	actor: SessionUser,
	enabled: boolean
): Promise<Outcome<boolean, 'forbidden' | 'conflict'>> {
	if (!can(actor, 'time.manage')) return failure('forbidden');

	try {
		await getDb().transaction(async (tx) => {
			// First, so a switch-off discards the timers of every start that got in
			// before it, and a switch-on seeds once.
			await lockOrganisation(tx, actor.organisationId, 'update');
			await tx
				.update(organisations)
				.set({ timeTrackingEnabled: enabled, updatedAt: new Date() })
				.where(eq(organisations.id, actor.organisationId));

			if (!enabled) {
				await tx
					.delete(runningTimers)
					.where(eq(runningTimers.organisationId, actor.organisationId));
				return;
			}

			const [existing] = await tx
				.select({ id: timeEntryTypes.id })
				.from(timeEntryTypes)
				.where(eq(timeEntryTypes.organisationId, actor.organisationId))
				.limit(1);
			if (!existing) {
				await tx.insert(timeEntryTypes).values({
					organisationId: actor.organisationId,
					name: SEEDED_TYPE_NAME,
					position: 0,
					isDefault: true
				});
			}
		});
	} catch (error) {
		// The lock should leave nothing to collide with; a lost race is still a
		// refusal to retry, not a 500.
		if (uniqueConstraintName(error) !== null) return failure('conflict');
		throw error;
	}

	return success(enabled);
}
