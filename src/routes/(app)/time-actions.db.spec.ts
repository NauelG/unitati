import { describe, expect, it } from 'vitest';
import { m } from '#lib/paraglide/messages.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { editEntry, listEntriesFor, logTime } from '#lib/server/time/index.js';
import { createTimeScene, defaultTypeOf } from '#lib/server/time/testing/fixtures.js';
import { timeActions } from './time-actions';

const clock = { now: new Date('2026-10-25T12:00:00Z') };

async function setup() {
	const scene = await createTimeScene();
	const type = await defaultTypeOf(scene.organisation.id);
	const input = { minutes: 30, workDate: '2026-10-25', typeId: type.id, note: 'Original' };
	const logged = await logTime(scene.technician, { ticketId: scene.ticket.id }, input, clock);
	if (!logged.ok) throw new Error('expected the entry');

	const actions = timeActions(
		(user) => user as never,
		async () => ({ ticketId: scene.ticket.id })
	);
	return { ...scene, type, input, id: logged.value.id, actions };
}

const form = (id: string, typeId: string, extra: Record<string, string> = {}) => ({
	id,
	duration: '45m',
	workDate: '2026-10-24',
	typeId,
	note: 'Corrected',
	...extra
});

describe('?/editTime', () => {
	it('answers with the stale message and the entry untouched when the revision is old', async () => {
		const { admin, technician, ticket, id, type, input, actions } = await setup();
		// An admin edits first: the technician’s form still carries revision 1.
		await editEntry(admin, id, { ...input, minutes: 90 }, clock);

		const { returned } = await outcomeOf(() =>
			actions.editTime(actionEvent(technician, form(id, type.id, { baseRevision: '1' })) as never)
		);

		expect(returned).toMatchObject({
			status: 400,
			data: { action: 'editTime', message: m.time_error_stale() }
		});
		const [entry] = (await listEntriesFor(technician, { ticketId: ticket.id })).entries;
		expect(entry).toMatchObject({ minutes: 90, note: 'Original', revision: 2 });
	});

	it('saves when the revision is the current one', async () => {
		const { technician, ticket, id, type, actions } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.editTime(actionEvent(technician, form(id, type.id, { baseRevision: '1' })) as never)
		);

		expect(returned).toEqual({ action: 'editTime' });
		const [entry] = (await listEntriesFor(technician, { ticketId: ticket.id })).entries;
		expect(entry).toMatchObject({ minutes: 45, note: 'Corrected', revision: 2 });
	});

	it('refuses an edit that carries no revision rather than overwriting', async () => {
		const { technician, ticket, id, type, actions } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.editTime(actionEvent(technician, form(id, type.id)) as never)
		);

		expect(returned).toMatchObject({ status: 400, data: { message: m.time_error_stale() } });
		const [entry] = (await listEntriesFor(technician, { ticketId: ticket.id })).entries;
		expect(entry).toMatchObject({ minutes: 30, revision: 1 });
	});
});
