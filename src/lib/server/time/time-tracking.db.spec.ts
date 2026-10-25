import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { refusalFrom } from '../db/testing/refusal';
import { createOrganisation } from '../assets/testing/fixtures';
import { runningTimers, timeEntries, timeEntryTypes } from './schema';
import {
	createType,
	isTimeTrackingEnabled,
	listOfferedTypes,
	listTypes,
	moveType,
	removeType,
	renameType,
	setDefaultType,
	setTimeTracking
} from './index';
import { createTimeScene, defaultTypeOf } from './testing/fixtures';

describe('the switch', () => {
	it('is off by default', async () => {
		const organisation = await createOrganisation();
		expect(await isTimeTrackingEnabled(organisation.id)).toBe(false);
	});

	it('is the admin’s to flip, not the technician’s', async () => {
		const { technician, employee } = await createTimeScene({ enabled: false });

		expect(await setTimeTracking(technician, true)).toEqual({ ok: false, error: 'forbidden' });
		expect(await setTimeTracking(employee, true)).toEqual({ ok: false, error: 'forbidden' });
		expect(await isTimeTrackingEnabled(technician.organisationId)).toBe(false);
	});

	it('seeds General as the default type the first time it is switched on', async () => {
		const { admin } = await createTimeScene({ enabled: false });
		expect(await listTypes(admin.organisationId)).toEqual([]);

		await setTimeTracking(admin, true);

		const types = await listTypes(admin.organisationId);
		expect(types).toHaveLength(1);
		expect(types[0]).toMatchObject({ name: 'General', isDefault: true, archived: false });
	});

	it('seeds nothing again on a later switch-on', async () => {
		const { admin } = await createTimeScene();
		await createType(admin, 'Meetings');

		await setTimeTracking(admin, false);
		await setTimeTracking(admin, true);

		expect((await listTypes(admin.organisationId)).map((type) => type.name)).toEqual([
			'General',
			'Meetings'
		]);
	});

	it('keeps the entries across an off and on cycle and discards the running timers', async () => {
		const { admin, technician, ticket, task } = await createTimeScene();
		const type = await defaultTypeOf(admin.organisationId);
		await getDb().insert(timeEntries).values({
			organisationId: admin.organisationId,
			ticketId: ticket.id,
			personId: technician.personId!,
			typeId: type.id,
			minutes: 30,
			workDate: '2026-10-20'
		});
		await getDb().insert(runningTimers).values({
			organisationId: admin.organisationId,
			personId: technician.personId!,
			taskId: task.id,
			startedAt: new Date()
		});

		await setTimeTracking(admin, false);
		expect(await getDb().select().from(runningTimers)).toHaveLength(0);
		expect(await getDb().select().from(timeEntries)).toHaveLength(1);

		await setTimeTracking(admin, true);
		expect(await getDb().select().from(timeEntries)).toHaveLength(1);
	});
});

describe('the entry-type catalogue', () => {
	it('is the admin’s to edit', async () => {
		const { technician, employee } = await createTimeScene();

		expect(await createType(technician, 'Travel')).toEqual({ ok: false, error: 'forbidden' });
		expect(await createType(employee, 'Travel')).toEqual({ ok: false, error: 'forbidden' });
	});

	it('refuses every write while tracking is off', async () => {
		const { admin } = await createTimeScene();
		const general = await defaultTypeOf(admin.organisationId);
		await setTimeTracking(admin, false);

		const off = { ok: false, error: 'time_tracking_disabled' };
		expect(await createType(admin, 'Travel')).toEqual(off);
		expect(await renameType(admin, general.id, 'Other')).toEqual(off);
		expect(await moveType(admin, general.id, 'down')).toEqual(off);
		expect(await setDefaultType(admin, general.id)).toEqual(off);
		expect(await removeType(admin, general.id)).toEqual(off);
	});

	it('creates, renames and orders types', async () => {
		const { admin } = await createTimeScene();
		const travel = await createType(admin, '  Travel ');
		const meetings = await createType(admin, 'Meetings');
		if (!travel.ok || !meetings.ok) throw new Error('creation failed');
		expect(travel.value.name).toBe('Travel');
		expect(travel.value.isDefault).toBe(false);

		await renameType(admin, travel.value.id, 'On-site travel');
		await moveType(admin, meetings.value.id, 'up');

		expect((await listTypes(admin.organisationId)).map((type) => type.name)).toEqual([
			'General',
			'Meetings',
			'On-site travel'
		]);

		// The ends are no-ops, not errors.
		expect(await moveType(admin, meetings.value.id, 'up')).toMatchObject({ ok: true });
		expect(await moveType(admin, travel.value.id, 'down')).toMatchObject({ ok: true });
	});

	it('refuses an empty name, an over-long name and a name taken (ignoring case)', async () => {
		const { admin } = await createTimeScene();

		expect(await createType(admin, '   ')).toEqual({ ok: false, error: 'name_required' });
		expect(await createType(admin, 'x'.repeat(81))).toEqual({ ok: false, error: 'name_too_long' });
		expect(await createType(admin, 'general')).toEqual({ ok: false, error: 'name_taken' });

		const travel = await createType(admin, 'Travel');
		if (!travel.ok) throw new Error('creation failed');
		expect(await renameType(admin, travel.value.id, 'GENERAL')).toEqual({
			ok: false,
			error: 'name_taken'
		});
		// Changing only the case of its own name is allowed.
		expect(await renameType(admin, travel.value.id, 'TRAVEL')).toMatchObject({ ok: true });
	});

	it('keeps exactly one default, and moves it on request', async () => {
		const { admin } = await createTimeScene();
		const travel = await createType(admin, 'Travel');
		if (!travel.ok) throw new Error('creation failed');

		await setDefaultType(admin, travel.value.id);

		const types = await listTypes(admin.organisationId);
		expect(types.filter((type) => type.isDefault).map((type) => type.name)).toEqual(['Travel']);
	});

	it('refuses a second default at the database', async () => {
		const { admin } = await createTimeScene();

		const refusal = await refusalFrom(
			getDb().insert(timeEntryTypes).values({
				organisationId: admin.organisationId,
				name: 'Another',
				position: 5,
				isDefault: true
			})
		);

		expect(refusal).toEqual({ code: '23505', constraint: 'time_entry_types_org_default' });
	});

	it('refuses to delete or archive the default type until another takes its place', async () => {
		const { admin } = await createTimeScene();
		const general = await defaultTypeOf(admin.organisationId);
		const travel = await createType(admin, 'Travel');
		if (!travel.ok) throw new Error('creation failed');

		expect(await removeType(admin, general.id)).toEqual({ ok: false, error: 'default_type' });

		await setDefaultType(admin, travel.value.id);
		expect(await removeType(admin, general.id)).toEqual({ ok: true, value: 'deleted' });
	});

	it('deletes a type nobody used and archives one in use', async () => {
		const { admin, technician, ticket } = await createTimeScene();
		const unused = await createType(admin, 'Unused');
		const used = await createType(admin, 'Used');
		if (!unused.ok || !used.ok) throw new Error('creation failed');
		await getDb().insert(timeEntries).values({
			organisationId: admin.organisationId,
			ticketId: ticket.id,
			personId: technician.personId!,
			typeId: used.value.id,
			minutes: 15,
			workDate: '2026-10-20'
		});

		expect(await removeType(admin, unused.value.id)).toEqual({ ok: true, value: 'deleted' });
		expect(await removeType(admin, used.value.id)).toEqual({ ok: true, value: 'archived' });

		const types = await listTypes(admin.organisationId);
		expect(types.map((type) => [type.name, type.archived])).toEqual([
			['General', false],
			['Used', true]
		]);
		expect(types.find((type) => type.name === 'Used')?.entryCount).toBe(1);
	});

	it('does not offer an archived type, and lets its name be taken again', async () => {
		const { admin, technician, ticket } = await createTimeScene();
		const used = await createType(admin, 'Used');
		if (!used.ok) throw new Error('creation failed');
		await getDb().insert(timeEntries).values({
			organisationId: admin.organisationId,
			ticketId: ticket.id,
			personId: technician.personId!,
			typeId: used.value.id,
			minutes: 15,
			workDate: '2026-10-20'
		});
		await removeType(admin, used.value.id);

		expect((await listOfferedTypes(admin.organisationId)).map((type) => type.name)).toEqual([
			'General'
		]);
		expect(await createType(admin, 'Used')).toMatchObject({ ok: true });
		expect(await renameType(admin, used.value.id, 'Renamed')).toEqual({
			ok: false,
			error: 'type_archived'
		});
		expect(await setDefaultType(admin, used.value.id)).toEqual({
			ok: false,
			error: 'type_archived'
		});
	});

	it('answers type_not_found for a type of another organisation', async () => {
		const { admin } = await createTimeScene();
		const other = await createOrganisation('Other', 'other');
		const [foreign] = await getDb()
			.insert(timeEntryTypes)
			.values({ organisationId: other.id, name: 'General', position: 0, isDefault: true })
			.returning();

		expect(await removeType(admin, foreign.id)).toEqual({ ok: false, error: 'type_not_found' });
		expect(await renameType(admin, foreign.id, 'Mine')).toEqual({
			ok: false,
			error: 'type_not_found'
		});
		expect(
			await getDb()
				.select()
				.from(timeEntryTypes)
				.where(and(eq(timeEntryTypes.id, foreign.id), eq(timeEntryTypes.name, 'General')))
		).toHaveLength(1);
	});
});
