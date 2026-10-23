import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { users } from '../auth/schema';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { relatedTo } from '../links';
import { ticketProject, ticketTask } from '../links/schema';
import { tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import { applyEscalations, applyPlan, applyProjects } from './apply';
import { buildEscalationsPlan, buildPlan, buildProjectsPlan, emailFor } from './plan';
import { seedTickets } from './tickets';

/** The seeded escalations, proved against rows: every shape is there, and a second run adds nothing. */

async function seeded() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
	await applyPlan(admin, buildPlan(1));
	await seedTickets(admin);
	await applyProjects(admin, buildProjectsPlan());

	return { organisation, admin };
}

async function links() {
	const db = getDb();
	return {
		tasks: (await db.select().from(ticketTask)).map((link) => `${link.ticketId}>${link.taskId}`),
		projects: (await db.select().from(ticketProject)).map(
			(link) => `${link.ticketId}>${link.projectId}`
		)
	};
}

describe('applyEscalations', () => {
	it('makes every shape the plan promises', async () => {
		const { admin } = await seeded();
		const plan = buildEscalationsPlan();

		const escalated = await applyEscalations(admin, plan);

		const task = await getDb().select().from(tasks);
		const planned = task.find((row) => row.title === 'Revisar el equipamiento de la planta 2');
		const onThatTask = (await getDb().select().from(ticketTask)).filter(
			(link) => link.taskId === planned?.id
		);
		const [resolved] = await getDb()
			.select()
			.from(tickets)
			.where(eq(tickets.subject, 'Necesito Office en el portátil nuevo'));
		const resolvedLinks = (await getDb().select().from(ticketTask)).filter(
			(link) => link.ticketId === resolved.id
		);

		expect({
			escalated,
			ticketsOnTheNewTask: onThatTask.length,
			projectLinks: (await links()).projects.length,
			resolvedTicketStatus: resolved.status,
			resolvedTicketLinked: resolvedLinks.length
		}).toEqual({
			escalated: plan.escalations.length,
			ticketsOnTheNewTask: 3,
			projectLinks: 1,
			resolvedTicketStatus: 'resolved',
			resolvedTicketLinked: 1
		});
	});

	it("shows the employee's own ticket its out-of-scope task as a restricted count", async () => {
		const { organisation, admin } = await seeded();
		await applyEscalations(admin, buildEscalationsPlan());

		const [eva] = await getDb()
			.select()
			.from(people)
			.where(eq(people.email, emailFor('Eva Employee')));
		const userId = crypto.randomUUID();
		await getDb()
			.insert(users)
			.values({ id: userId, name: eva.fullName, email: eva.email!, role: 'employee' });
		await getDb().update(people).set({ userId }).where(eq(people.id, eva.id));
		const viewer: SessionUser = {
			id: userId,
			name: eva.fullName,
			email: eva.email!,
			role: 'employee',
			organisationId: organisation.id,
			personId: eva.id
		};
		const [own] = await getDb().select().from(tickets).where(eq(tickets.requesterPersonId, eva.id));

		const [group] = await relatedTo(viewer, { kind: 'ticket', id: own.id });

		expect(group.relation).toBe('resolved_in');
		expect(group).toMatchObject({ items: [], restricted: 1 });
		expect(JSON.stringify(group)).not.toContain('Inventariar el mobiliario');
	});

	it('creates no duplicate task, link or entry when it runs twice', async () => {
		const { admin } = await seeded();

		await applyEscalations(admin, buildEscalationsPlan());
		const afterFirst = { links: await links(), tasks: (await getDb().select().from(tasks)).length };
		const second = await applyEscalations(admin, buildEscalationsPlan());

		expect(second).toBe(0);
		expect({ links: await links(), tasks: (await getDb().select().from(tasks)).length }).toEqual(
			afterFirst
		);
	});

	it('skips a ticket that is not there instead of failing', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');

		expect(await applyEscalations(admin, buildEscalationsPlan())).toBe(0);
	});
});
