import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { refusalFrom } from '../db/testing/refusal';
import { createOrganisation, createPerson } from '../assets/testing/fixtures';
import { tickets } from './schema';
import { createComment, createQueue, createTicket } from './testing/fixtures';

async function scenario() {
	const organisation = await createOrganisation();
	const person = await createPerson(organisation.id, 'Ada Lovelace');
	const queue = await createQueue(organisation.id);
	return { organisation, person, queue };
}

describe('the tickets table', () => {
	it('generates TCK-#### tags from its own sequence', async () => {
		const { organisation, person, queue } = await scenario();

		const first = await createTicket(organisation.id, queue.id, person.id);
		const second = await createTicket(organisation.id, queue.id, person.id);

		// The sequence is global and the harness does not rewind it, so the numbers
		// are asserted relative to each other, not absolutely.
		const number = (tag: string) => Number(tag.replace('TCK-', ''));
		expect(first.ticketTag).toMatch(/^TCK-\d{4,}$/);
		expect(number(second.ticketTag)).toBe(number(first.ticketTag) + 1);
	});

	it('refuses a duplicate tag inside one organisation', async () => {
		const { organisation, person, queue } = await scenario();
		await createTicket(organisation.id, queue.id, person.id, { ticketTag: 'TCK-9000' });

		const refusal = await refusalFrom(
			createTicket(organisation.id, queue.id, person.id, { ticketTag: 'TCK-9000' })
		);

		expect(refusal).toEqual({ code: '23505', constraint: 'tickets_org_tag' });
	});

	it('refuses a ticket with no queue', async () => {
		const { organisation, person } = await scenario();

		const refusal = await refusalFrom(
			getDb()
				.insert(tickets)
				.values({
					organisationId: organisation.id,
					subject: 'No queue',
					requesterPersonId: person.id,
					channel: 'portal'
				} as typeof tickets.$inferInsert)
		);

		expect(refusal?.code).toBe('23502');
	});

	it('defaults to new and normal', async () => {
		const { organisation, person, queue } = await scenario();

		const ticket = await createTicket(organisation.id, queue.id, person.id);

		expect(ticket.status).toBe('new');
		expect(ticket.priority).toBe('normal');
	});

	it('does not let a queue with tickets be deleted', async () => {
		const { organisation, person, queue } = await scenario();
		await createTicket(organisation.id, queue.id, person.id);

		const refusal = await refusalFrom(
			getDb().execute(sql`delete from queues where id = ${queue.id}`)
		);

		expect(refusal?.code).toBe('23503');
	});
});

describe('Spanish search', () => {
	async function matches(term: string, from: 'tickets' | 'ticket_comments') {
		const rows = await getDb().execute(
			sql.raw(
				`select 1 from ${from} where search @@ plainto_tsquery('spanish', immutable_unaccent('${term}'))`
			)
		);
		return rows.length;
	}

	it('stems: "impresoras" finds a subject containing "impresora"', async () => {
		const { organisation, person, queue } = await scenario();
		await createTicket(organisation.id, queue.id, person.id, {
			subject: 'La impresora no responde'
		});

		expect(await matches('impresoras', 'tickets')).toBe(1);
	});

	it('ignores accents in comment bodies', async () => {
		const { organisation, person, queue } = await scenario();
		const ticket = await createTicket(organisation.id, queue.id, person.id);
		await createComment(organisation.id, ticket.id, person.id, 'Reinstalé el conductor');

		expect(await matches('reinstale', 'ticket_comments')).toBe(1);
	});
});
