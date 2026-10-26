import { describe, expect, it } from 'vitest';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createViewer
} from '../assets/testing/fixtures';
import { createLocation as createDirectoryLocation, setPersonLocation } from '../directory';
import { linkTicketToProject } from '../links';
import { createProjectRow, createWorkspace } from '../projects/testing/fixtures';
import {
	createLabel,
	createRequestForm,
	setLabelActive,
	setTicketLabels,
	submitEquipmentRequest
} from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { ticketScreen } from './ticket';

async function setup() {
	const workspace = await createWorkspace();
	const queue = await createQueue(workspace.organisation.id);
	const ticket = await createTicket(
		workspace.organisation.id,
		queue.id,
		workspace.employee.personId!,
		{ subject: 'Broken laptop' }
	);
	const unrelated = await createViewer(workspace.organisation.id, 'employee', 'Una Unrelated');
	return { ...workspace, queue, ticket, unrelated };
}

async function screenOf(viewer: Parameters<typeof ticketScreen>[0], tag: string) {
	const outcome = await ticketScreen(viewer, tag);
	if (!outcome.ok) throw new Error(`expected a screen, got ${outcome.error}`);
	return outcome.value;
}

const NO_ACTS = {
	editSubject: false,
	assign: false,
	moveToQueue: false,
	setLabels: false,
	setPriority: false,
	changeStatus: false,
	link: false,
	unlink: false,
	citePage: false,
	linkHandover: false,
	deliver: false,
	commentInternal: false,
	escalate: false,
	escalateCreate: false
};

describe('the ticket screen, per role', () => {
	it('lets an administrator do everything and loads the pickers', async () => {
		const { admin, ticket, queue } = await setup();

		const screen = await screenOf(admin, ticket.ticketTag);

		expect(screen.may).toEqual({
			editSubject: true,
			assign: true,
			moveToQueue: true,
			setLabels: true,
			setPriority: true,
			changeStatus: true,
			link: true,
			unlink: true,
			citePage: true,
			linkHandover: true,
			deliver: true,
			commentInternal: true,
			escalate: true,
			escalateCreate: true
		});
		expect(screen.choices.queues.map((entry) => entry.id)).toContain(queue.id);
		expect(screen.choices.people.map((person) => person.id)).toContain(admin.personId);
		expect(screen.nextStatuses.length).toBeGreaterThan(0);
	});

	it('lets a technician do the same', async () => {
		const { technician, ticket } = await setup();

		const screen = await screenOf(technician, ticket.ticketTag);

		expect(screen.may).toMatchObject({ assign: true, deliver: true, escalateCreate: true });
	});

	it('gives a viewer who may only read a screen with no act, no picker and no draft', async () => {
		const { technician, ticket } = await setup();
		const reader = { ...technician, scopes: ['tickets.view' as const] };

		const screen = await screenOf(reader, ticket.ticketTag);

		expect(screen.may).toEqual(NO_ACTS);
		expect(screen.choices).toEqual({
			queues: [],
			labels: [],
			people: [],
			inStockForRequest: []
		});
		expect(screen.escalationDraft).toBeNull();
		expect(screen.ticket.ticketTag).toBe(ticket.ticketTag);
	});

	it('splits the acts tickets.manage gates from the ones with a permission of their own', async () => {
		const { technician, ticket } = await setup();
		const noCheckout = {
			...technician,
			scopes: ['tickets.view', 'tickets.manage', 'tickets.comment.internal'] as const
		};

		const screen = await screenOf(noCheckout, ticket.ticketTag);

		expect(screen.may).toMatchObject({
			assign: true,
			escalate: true,
			commentInternal: true,
			deliver: false,
			escalateCreate: false
		});
		expect(screen.escalationDraft).toMatchObject({ title: 'Broken laptop' });
	});

	it('answers not_found to the requester and to any employee: they use the portal', async () => {
		const { employee, unrelated, ticket } = await setup();

		for (const viewer of [employee, unrelated]) {
			expect(await ticketScreen(viewer, ticket.ticketTag)).toEqual({
				ok: false,
				error: 'not_found'
			});
		}
	});

	it('answers not_found to a ticket that does not exist or lives in another organisation', async () => {
		const { admin, ticket } = await setup();
		const elsewhere = await createOrganisation('Other', 'other');
		const other = await createViewer(elsewhere.id, 'admin', 'Olga Other');

		expect(await ticketScreen(admin, 'TCK-9999')).toEqual({ ok: false, error: 'not_found' });
		expect(await ticketScreen(other, ticket.ticketTag)).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('the ticket screen, labels', () => {
	it('shows a reader the labels on the ticket but offers no catalogue to edit', async () => {
		const { technician, ticket } = await setup();
		const vpn = await createLabel(technician, {
			name: 'vpn',
			color: 'blue',
			description: 'Remote access'
		});
		if (!vpn.ok) throw new Error(vpn.error);
		await setTicketLabels(technician, ticket.ticketTag, [vpn.value.id]);
		const reader = { ...technician, scopes: ['tickets.view' as const] };

		const screen = await screenOf(reader, ticket.ticketTag);

		expect(screen.labels).toEqual([
			{ id: vpn.value.id, name: 'vpn', color: 'blue', description: 'Remote access', active: true }
		]);
		expect(screen.may.setLabels).toBe(false);
		expect(screen.choices.labels).toEqual([]);
	});

	it('offers the active catalogue plus the archived labels already on the ticket', async () => {
		const { technician, ticket } = await setup();
		const make = async (name: string) => {
			const created = await createLabel(technician, { name });
			if (!created.ok) throw new Error(created.error);
			return created.value.id;
		};
		const onTicket = await make('old');
		const archivedElsewhere = await make('retired');
		const active = await make('vpn');
		await setTicketLabels(technician, ticket.ticketTag, [onTicket]);
		await setLabelActive(technician, onTicket, false);
		await setLabelActive(technician, archivedElsewhere, false);

		const screen = await screenOf(technician, ticket.ticketTag);

		expect(screen.choices.labels.map((label) => label.id)).toEqual([onTicket, active]);
	});
});

describe('the ticket screen, requester location', () => {
	const place = {
		name: 'Barcelona office',
		parentId: null,
		code: null,
		address: null,
		notes: null,
		latitude: null,
		longitude: null
	};

	it('gives staff the path of the requester location, or null when there is none', async () => {
		const { admin, technician, employee, ticket } = await setup();

		expect((await screenOf(technician, ticket.ticketTag)).requesterLocation).toBeNull();

		const created = await createDirectoryLocation(admin, place);
		if (!created.ok) throw new Error('fixture failed');
		await setPersonLocation(admin, employee.personId!, created.value.id);

		for (const viewer of [technician, admin]) {
			expect((await screenOf(viewer, ticket.ticketTag)).requesterLocation).toEqual({
				path: 'Barcelona office'
			});
		}
	});

	it('is left out for a viewer without people.view', async () => {
		const { technician, ticket } = await setup();
		const noDirectory = { ...technician, scopes: ['tickets.view' as const] };

		expect(await screenOf(noDirectory, ticket.ticketTag)).not.toHaveProperty('requesterLocation');
	});
});

describe('the ticket screen, an equipment request', () => {
	async function requested(stock: number) {
		const base = await setup();
		const { organisation, technician, employee } = base;
		const hardware = await createQueue(organisation.id, 'Hardware');
		const laptops = await createCatalogue(organisation.id);
		const location = await createLocation(organisation.id, 'Stockroom');
		for (let index = 0; index < stock; index += 1) {
			await createAsset(organisation.id, laptops.modelId, {
				assetTag: `LAP-${index + 1}`,
				name: `Laptop ${index + 1}`,
				locationId: location.id
			});
		}
		const form = await createRequestForm(technician, {
			name: 'Request a laptop',
			kind: 'equipment',
			queueId: hardware.id
		});
		if (!form.ok) throw new Error(form.error);
		const submitted = await submitEquipmentRequest(employee, {
			formId: form.value.id,
			categoryId: laptops.categoryId,
			justification: 'My laptop died.'
		});
		if (!submitted.ok) throw new Error(submitted.error);
		return { ...base, laptops, ticketTag: submitted.value.ticketTag };
	}

	it('names the category asked for and offers at most five assets in stock', async () => {
		const { technician, laptops, ticketTag } = await requested(6);

		const screen = await screenOf(technician, ticketTag);

		expect(screen.requestedCategory).toEqual({ id: laptops.categoryId, name: 'Laptops' });
		expect(screen.choices.inStockForRequest).toHaveLength(5);
	});

	it('offers no stock to a viewer who may not deliver', async () => {
		const { technician, ticketTag } = await requested(2);
		const noCheckout = { ...technician, scopes: ['tickets.view', 'tickets.manage'] as const };

		const screen = await screenOf(noCheckout, ticketTag);

		expect(screen.requestedCategory).not.toBeNull();
		expect(screen.may.deliver).toBe(false);
		expect(screen.choices.inStockForRequest).toEqual([]);
	});
});

describe('the ticket screen related records', () => {
	it('streams what is linked to the ticket', async () => {
		const { technician, organisation, ticket } = await setup();
		const project = await createProjectRow(organisation.id);
		await linkTicketToProject(technician, { ticketId: ticket.id, projectId: project.id });

		const { related } = await screenOf(technician, ticket.ticketTag);
		const groups = await related;

		expect(groups.flatMap((group) => group.items.map((item) => item.ref.id))).toEqual([project.id]);
	});
});
