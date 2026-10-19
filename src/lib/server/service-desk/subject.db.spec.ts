import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { InMemoryStorage } from './storage';
import { changeTicketSubject, createTicket } from './index';
import { tickets } from './schema';
import { createQueue } from './testing/fixtures';

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const queue = await createQueue(organisation.id, 'Hardware');
	const opened = await createTicket(
		technician,
		{ subject: 'Impresora rota', body: 'No imprime', queueId: queue.id },
		[],
		{ storage: new InMemoryStorage(), mailer: null }
	);
	if (!opened.ok) throw new Error(opened.error);
	const [ticket] = await getDb()
		.select()
		.from(tickets)
		.where(eq(tickets.ticketTag, opened.value.ticketTag));
	return { organisation, technician, ticket };
}

const subjectActivity = (ticketId: string) =>
	getDb()
		.select()
		.from(activity)
		.where(and(eq(activity.verb, 'ticket.subject.changed'), eq(activity.ticketId, ticketId)));

describe('changing a ticket subject', () => {
	it('updates the subject and records both ends', async () => {
		const w = await workspace();

		const outcome = await changeTicketSubject(
			w.technician,
			w.ticket.id,
			'Impresora de planta 2 rota'
		);

		expect(outcome.ok).toBe(true);
		const [row] = await getDb().select().from(tickets).where(eq(tickets.id, w.ticket.id));
		expect(row.subject).toBe('Impresora de planta 2 rota');
		const rows = await subjectActivity(w.ticket.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].payload).toEqual({ from: 'Impresora rota', to: 'Impresora de planta 2 rota' });
	});

	it('records nothing when the subject is unchanged', async () => {
		const w = await workspace();

		expect((await changeTicketSubject(w.technician, w.ticket.id, 'Impresora rota')).ok).toBe(true);

		expect(await subjectActivity(w.ticket.id)).toHaveLength(0);
	});

	it('finds the ticket by its new subject', async () => {
		const w = await workspace();
		await changeTicketSubject(w.technician, w.ticket.id, 'Monitor parpadea');

		const hits = await getDb()
			.select({ id: tickets.id })
			.from(tickets)
			.where(
				and(
					eq(tickets.id, w.ticket.id),
					sql`${tickets.search} @@ plainto_tsquery('spanish', 'parpadea')`
				)
			);
		expect(hits).toHaveLength(1);
	});

	it('is not found for a ticket of another organisation', async () => {
		const w = await workspace();
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'technician', 'Sam Stranger');

		expect(await changeTicketSubject(stranger, w.ticket.id, 'x')).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});
