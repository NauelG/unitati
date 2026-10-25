import { eq } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import type { Executor } from '../db';
import { organisations } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { runningTimers, timeEntryTypes } from './schema';

/**
 * The organisation's time tracking switch (ADR 0051). Off by default, and while
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
): Promise<Outcome<boolean, 'forbidden'>> {
	if (!can(actor, 'time.manage')) return failure('forbidden');

	await getDb().transaction(async (tx) => {
		await tx
			.update(organisations)
			.set({ timeTrackingEnabled: enabled, updatedAt: new Date() })
			.where(eq(organisations.id, actor.organisationId));

		if (!enabled) {
			await tx.delete(runningTimers).where(eq(runningTimers.organisationId, actor.organisationId));
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

	return success(enabled);
}
