import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { organisations } from '../directory/schema';
import { runningTimers, timeEntryTypes } from './schema';
import { createType, setDefaultType, setTimeTracking, startTimer } from './index';
import { createTimeScene } from './testing/fixtures';

/**
 * Concurrent writes on the time module end in a typed outcome, never a thrown
 * error (ADR 0046). The organisation row is the lock (ADR 0052).
 */

const typesOf = (organisationId: string) =>
	getDb().select().from(timeEntryTypes).where(eq(timeEntryTypes.organisationId, organisationId));

/** Tracking switched on without the seeded type: the state before the first enable. */
async function sceneWithoutTypes() {
	const scene = await createTimeScene({ enabled: false });
	await getDb()
		.update(organisations)
		.set({ timeTrackingEnabled: true })
		.where(eq(organisations.id, scene.organisation.id));
	return scene;
}

describe('the type catalogue under concurrency', () => {
	it('two concurrent setDefaultType leave exactly one default and throw nothing', async () => {
		const scene = await createTimeScene();
		const a = await createType(scene.admin, 'Support');
		const b = await createType(scene.admin, 'Travel');
		if (!a.ok || !b.ok) throw new Error('expected the types');

		const outcomes = await Promise.all([
			setDefaultType(scene.admin, a.value.id),
			setDefaultType(scene.admin, b.value.id)
		]);

		expect(outcomes.every((outcome) => typeof outcome.ok === 'boolean')).toBe(true);
		const defaults = (await typesOf(scene.organisation.id)).filter((type) => type.isDefault);
		expect(defaults).toHaveLength(1);
		expect([a.value.id, b.value.id]).toContain(defaults[0].id);
	});

	it('two concurrent first createType leave exactly one default and throw nothing', async () => {
		const scene = await sceneWithoutTypes();

		const outcomes = await Promise.all([
			createType(scene.admin, 'Support'),
			createType(scene.admin, 'Travel')
		]);

		expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
		const types = await typesOf(scene.organisation.id);
		expect(types).toHaveLength(2);
		expect(types.filter((type) => type.isDefault)).toHaveLength(1);
	});

	it('two concurrent first createType of the same name: one wins, one is name_taken', async () => {
		const scene = await sceneWithoutTypes();

		const outcomes = await Promise.all([
			createType(scene.admin, 'Support'),
			createType(scene.admin, 'support')
		]);

		expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
		expect(outcomes.find((outcome) => !outcome.ok)).toEqual({ ok: false, error: 'name_taken' });
		expect(await typesOf(scene.organisation.id)).toHaveLength(1);
	});

	it('two concurrent first enables seed one default type and throw nothing', async () => {
		const scene = await createTimeScene({ enabled: false });

		const outcomes = await Promise.all([
			setTimeTracking(scene.admin, true),
			setTimeTracking(scene.admin, true)
		]);

		expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
		const types = await typesOf(scene.organisation.id);
		expect(types).toHaveLength(1);
		expect(types[0]).toMatchObject({ name: 'General', isDefault: true });
	});
});

describe('the timer against the switch', () => {
	it('a start racing a switch-off leaves no timer behind', async () => {
		const scene = await createTimeScene();

		// The switch-off holds the organisation row while it discards the timers;
		// the start has already passed its own gate when the off commits.
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		const off = getDb().transaction(async (tx) => {
			await tx.execute(
				sql`select 1 from ${organisations} where ${organisations.id} = ${scene.organisation.id} for update`
			);
			await tx
				.update(organisations)
				.set({ timeTrackingEnabled: false })
				.where(eq(organisations.id, scene.organisation.id));
			await tx.delete(runningTimers).where(eq(runningTimers.organisationId, scene.organisation.id));
			await held;
		});

		const start = startTimer(scene.technician, { ticketId: scene.ticket.id });
		await new Promise((resolve) => setTimeout(resolve, 200));
		release();
		const [, started] = await Promise.all([off, start]);

		expect(started).toEqual({ ok: false, error: 'time_tracking_disabled' });
		expect(
			await getDb()
				.select()
				.from(runningTimers)
				.where(eq(runningTimers.organisationId, scene.organisation.id))
		).toHaveLength(0);
	});

	it('concurrent start and setTimeTracking(false) end with no timer', async () => {
		const scene = await createTimeScene();

		const [, started] = await Promise.all([
			setTimeTracking(scene.admin, false),
			startTimer(scene.technician, { ticketId: scene.ticket.id })
		]);

		expect(typeof started.ok).toBe('boolean');
		expect(
			await getDb()
				.select()
				.from(runningTimers)
				.where(eq(runningTimers.organisationId, scene.organisation.id))
		).toHaveLength(0);
	});
});
