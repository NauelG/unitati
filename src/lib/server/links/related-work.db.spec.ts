import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { createPerson, createViewer } from '../assets/testing/fixtures';
import { projects } from '../projects/schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { linkTicketToProject, linkTicketToTask, relatedTo } from './index';

/**
 * What a record is connected to once tickets can point at work (#149). The
 * relation names are keys; the words are #150's and #151's.
 */

async function scene() {
	const base = await createWorkspace();
	const { organisation, employee } = base;
	const queue = await createQueue(organisation.id);
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001', name: 'Move' });
	const task = await createTaskRow(organisation.id, project.id, states.started.id, {
		taskTag: 'TSK-0001',
		title: 'Book the van'
	});
	const mine = await createTicket(organisation.id, queue.id, employee.personId!, {
		subject: 'Moving my desk'
	});

	return { ...base, queue, states, project, task, mine };
}

describe('relatedTo(ticket)', () => {
	it('lists the task and the project the ticket was escalated to, with today status', async () => {
		const { technician, mine, task, project } = await scene();
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });
		await linkTicketToProject(technician, { ticketId: mine.id, projectId: project.id });

		const groups = await relatedTo(technician, { kind: 'ticket', id: mine.id });

		expect(
			groups.map((group) => ({
				relation: group.relation,
				icon: group.icon,
				items: group.items.map((item) => ({ ...item.ref, status: item.status }))
			}))
		).toEqual([
			{
				relation: 'resolved_in',
				icon: 'task',
				items: [
					{
						kind: 'task',
						id: task.id,
						tag: 'TSK-0001',
						title: 'Book the van',
						href: '/tasks/TSK-0001',
						status: { group: 'started', name: expect.any(String) }
					}
				]
			},
			{
				relation: 'handled_in',
				icon: 'project',
				items: [
					{
						kind: 'project',
						id: project.id,
						tag: 'PRJ-0001',
						title: 'Move',
						href: '/projects/PRJ-0001',
						status: {
							archived: false,
							progress: expect.objectContaining({ total: 1, ratio: 0 })
						}
					}
				]
			}
		]);
	});

	it('shows an archived project as archived', async () => {
		const { technician, mine, project } = await scene();
		await linkTicketToProject(technician, { ticketId: mine.id, projectId: project.id });
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, project.id));

		const [group] = await relatedTo(technician, { kind: 'ticket', id: mine.id });

		expect(group.items[0].status).toMatchObject({ archived: true });
	});

	it('omits the groups that are empty', async () => {
		const { technician, mine } = await scene();

		expect(await relatedTo(technician, { kind: 'ticket', id: mine.id })).toEqual([]);
	});

	it('lets the requester see the out-of-scope task reduced to code, title and state', async () => {
		const { technician, employee, mine, task, project } = await scene();
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });
		await linkTicketToProject(technician, { ticketId: mine.id, projectId: project.id });

		const groups = await relatedTo(employee, { kind: 'ticket', id: mine.id });

		expect(
			groups.map((group) => ({
				relation: group.relation,
				items: group.items.map((item) => ({
					tag: item.ref.tag,
					title: item.ref.title,
					href: item.ref.href,
					restricted: item.restricted === true,
					hasStatus: item.status !== undefined
				}))
			}))
		).toEqual([
			{
				relation: 'resolved_in',
				items: [
					{ tag: 'TSK-0001', title: 'Book the van', href: null, restricted: true, hasStatus: true }
				]
			},
			{
				relation: 'handled_in',
				items: [{ tag: 'PRJ-0001', title: 'Move', href: null, restricted: true, hasStatus: true }]
			}
		]);
	});

	it('never leaks the project, assignees or dates of a restricted task', async () => {
		const { technician, employee, mine, task } = await scene();
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });

		const [group] = await relatedTo(employee, { kind: 'ticket', id: mine.id });
		const serialised = JSON.stringify(group.items);

		expect(serialised).not.toContain('PRJ-0001');
		expect(serialised).not.toContain('Move');
	});

	it('keeps the link when the target is in the requester scope', async () => {
		const { organisation, technician, employee, mine, task } = await scene();
		await assignRow(organisation.id, task.id, employee.personId!);
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });

		const [group] = await relatedTo(employee, { kind: 'ticket', id: mine.id });

		expect(group.items[0]).toMatchObject({ ref: { href: '/tasks/TSK-0001' } });
		expect(group.items[0].restricted).toBeUndefined();
	});

	it("returns nothing on another employee's ticket", async () => {
		const { organisation, technician, mine, task } = await scene();
		const colleague = await createViewer(organisation.id, 'employee', 'Colin Colleague');
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });

		expect(await relatedTo(colleague, { kind: 'ticket', id: mine.id })).toEqual([]);
	});

	it('returns nothing for a viewer from another organisation', async () => {
		const { technician, mine, task } = await scene();
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });
		const foreign = { ...technician, organisationId: crypto.randomUUID() };

		expect(await relatedTo(foreign, { kind: 'ticket', id: mine.id })).toEqual([]);
	});
});

describe('relatedTo(task)', () => {
	it('lists every ticket linked to it under resolves', async () => {
		const { organisation, technician, employee, queue, task } = await scene();
		const tickets = [];
		for (const subject of ['A', 'B', 'C']) {
			const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
				subject,
				ticketTag: `TCK-${subject}`
			});
			await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });
			tickets.push(ticket.id);
		}

		const groups = await relatedTo(technician, { kind: 'task', id: task.id });

		expect(groups.map((g) => g.relation)).toEqual(['resolves']);
		expect(groups[0].icon).toBe('ticket');
		expect(groups[0].items.map((item) => item.ref.id).sort()).toEqual(tickets.sort());
	});

	it('shows an employee only their own tickets', async () => {
		const { organisation, technician, employee, queue, task } = await scene();
		await assignRow(organisation.id, task.id, employee.personId!);
		const other = await createPerson(organisation.id, 'Olga Other');
		const own = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-OWN'
		});
		const foreign = await createTicket(organisation.id, queue.id, other.id, {
			ticketTag: 'TCK-OTHER'
		});
		await linkTicketToTask(technician, { ticketId: own.id, taskId: task.id });
		await linkTicketToTask(technician, { ticketId: foreign.id, taskId: task.id });

		const [group] = await relatedTo(employee, { kind: 'task', id: task.id });

		expect(group.items.map((item) => item.ref.tag)).toEqual(['TCK-OWN']);
	});
});

describe('relatedTo(project)', () => {
	it('separates tickets linked to the project from those reaching it through a task', async () => {
		const { organisation, technician, employee, queue, states, project, task } = await scene();
		const second = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			taskTag: 'TSK-0002',
			title: 'Pack boxes'
		});
		const direct = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-DIRECT'
		});
		const viaOne = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-ONE'
		});
		const viaTwo = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-TWO'
		});
		await linkTicketToProject(technician, { ticketId: direct.id, projectId: project.id });
		await linkTicketToTask(technician, { ticketId: viaOne.id, taskId: task.id });
		await linkTicketToTask(technician, { ticketId: viaTwo.id, taskId: second.id });

		const groups = await relatedTo(technician, { kind: 'project', id: project.id });

		expect(
			groups.map((group) => ({
				relation: group.relation,
				items: group.items.map((item) => ({
					tag: item.ref.tag,
					via: item.via?.tag
				}))
			}))
		).toEqual([
			{ relation: 'handles', items: [{ tag: 'TCK-DIRECT', via: undefined }] },
			{
				relation: 'resolves_via_tasks',
				items: expect.arrayContaining([
					{ tag: 'TCK-ONE', via: 'TSK-0001' },
					{ tag: 'TCK-TWO', via: 'TSK-0002' }
				])
			}
		]);
	});

	it('returns every ticket of three linked to one task, each with its via task', async () => {
		const { organisation, technician, employee, queue, project, task } = await scene();
		for (const suffix of ['1', '2', '3']) {
			const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
				ticketTag: `TCK-${suffix}`
			});
			await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });
		}

		const groups = await relatedTo(technician, { kind: 'project', id: project.id });

		expect(groups).toHaveLength(1);
		expect(groups[0].relation).toBe('resolves_via_tasks');
		expect(groups[0].items.map((item) => item.via?.id)).toEqual([task.id, task.id, task.id]);
	});
});
