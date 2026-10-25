import { describe, expect, it } from 'vitest';
import { archiveAsset } from '../assets';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createViewer
} from '../assets/testing/fixtures';
import { createWorkspace } from '../projects/testing/fixtures';
import { createRequestForm, submitEquipmentRequest } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { linkTicketAssets } from '../links';
import { assetScreen } from './asset';

async function setup() {
	const workspace = await createWorkspace();
	const catalogue = await createCatalogue(workspace.organisation.id);
	const asset = await createAsset(workspace.organisation.id, catalogue.modelId);
	const unrelated = await createViewer(workspace.organisation.id, 'employee', 'Una Unrelated');
	return { ...workspace, catalogue, asset, unrelated };
}

async function screenOf(
	viewer: Parameters<typeof assetScreen>[0],
	tag: string,
	context?: Parameters<typeof assetScreen>[2]
) {
	const outcome = await assetScreen(viewer, tag, context);
	if (!outcome.ok) throw new Error(`expected a screen, got ${outcome.error}`);
	return outcome.value;
}

const NO_ACTS = {
	printLabel: false,
	edit: false,
	changeLocation: false,
	changeState: false,
	archive: false,
	unarchive: false,
	comment: false,
	attach: false,
	deliver: false,
	takeBack: false,
	waiveHandover: false,
	linkTickets: false
};

describe('the asset screen, per role', () => {
	it('lets an administrator do everything on an asset nobody holds', async () => {
		const { admin, asset } = await setup();

		const screen = await screenOf(admin, asset.assetTag);

		expect(screen.may).toEqual({
			printLabel: true,
			edit: true,
			changeLocation: true,
			changeState: true,
			archive: true,
			unarchive: false,
			comment: true,
			attach: true,
			deliver: true,
			takeBack: false,
			waiveHandover: true,
			linkTickets: true
		});
		expect(screen.choices.people.map((person) => person.id)).toContain(admin.personId);
		expect(screen.choices.deliverable.map((entry) => entry.assetTag)).toContain(asset.assetTag);
		expect(screen.choices.heldAssets).toEqual([]);
		expect(screen.choices.catalogues.categories.length).toBeGreaterThan(0);
		expect(screen.choices.models.length).toBeGreaterThan(0);
		expect(screen.handovers).not.toBeNull();
		expect(screen.attachments).not.toBeNull();
		expect(screen.comments).not.toBeNull();
	});

	it('offers the take-back, not the delivery, while somebody holds the asset', async () => {
		const { technician, employee, organisation, catalogue } = await setup();
		const held = await createAsset(organisation.id, catalogue.modelId, {
			custodianPersonId: employee.personId
		});
		const other = await createAsset(organisation.id, catalogue.modelId, {
			custodianPersonId: employee.personId
		});

		const screen = await screenOf(technician, held.assetTag);

		expect(screen.may).toMatchObject({ deliver: false, takeBack: true });
		expect(screen.choices.deliverable).toEqual([]);
		expect(screen.choices.heldAssets.map((entry) => entry.assetTag)).toContain(other.assetTag);
	});

	it('lets a technician manage and deliver', async () => {
		const { technician, asset } = await setup();

		const screen = await screenOf(technician, asset.assetTag);

		expect(screen.may).toMatchObject({ edit: true, deliver: true, linkTickets: true });
	});

	it('gives the employee holding the asset a read-only screen with no staff section', async () => {
		const { employee, organisation, catalogue } = await setup();
		const mine = await createAsset(organisation.id, catalogue.modelId, {
			custodianPersonId: employee.personId
		});

		const screen = await screenOf(employee, mine.assetTag);

		expect(screen.asset.visibility).toBe('full');
		expect(screen.may).toEqual(NO_ACTS);
		expect(screen.choices).toEqual({
			people: [],
			locations: [],
			deliverable: [],
			heldAssets: [],
			models: [],
			catalogues: { manufacturers: [], categories: [] }
		});
		expect(screen.handovers).toBeNull();
		expect(screen.custody).toBeNull();
		expect(screen.attachments).toBeNull();
	});

	it('answers not_found to an employee for an asset that is neither theirs nor shared', async () => {
		const { unrelated, asset } = await setup();

		expect(await assetScreen(unrelated, asset.assetTag)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('answers not_found to an asset that does not exist or lives in another organisation', async () => {
		const { admin, asset } = await setup();
		const elsewhere = await createOrganisation('Other', 'other');
		const other = await createViewer(elsewhere.id, 'admin', 'Olga Other');

		expect(await assetScreen(admin, 'AST-9999')).toEqual({ ok: false, error: 'not_found' });
		expect(await assetScreen(other, asset.assetTag)).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('the asset screen, a shared asset', () => {
	it('gives an employee the name and place only: no act, no staff section, no history', async () => {
		const { unrelated, organisation, catalogue } = await setup();
		const shared = await createAsset(organisation.id, catalogue.modelId, { shared: true });

		const screen = await screenOf(unrelated, shared.assetTag);

		expect(screen.asset.visibility).toBe('shared');
		expect(screen.may).toEqual(NO_ACTS);
		expect(screen.choices.people).toEqual([]);
		expect(screen.handovers).toBeNull();
		expect(screen.attachments).toBeNull();
		expect(screen.comments).toBeNull();
		expect((await screen.rail).timeline).toBeNull();
	});
});

describe('the asset screen, an archived asset', () => {
	it('lets a manager unarchive it and nothing else on its row', async () => {
		const { admin, asset } = await setup();
		await archiveAsset(admin, asset.id);

		const screen = await screenOf(admin, asset.assetTag);

		expect(screen.may).toMatchObject({
			archive: false,
			unarchive: true,
			changeState: false,
			edit: true
		});
	});
});

describe('the asset screen, coming from a ticket', () => {
	async function requested() {
		const base = await setup();
		const { organisation, technician, employee, catalogue } = base;
		const monitors = await createCatalogue(organisation.id, 'Studio', 'Dell', 'Monitors');
		const monitor = await createAsset(organisation.id, monitors.modelId, { name: 'A monitor' });
		const hardware = await createQueue(organisation.id, 'Hardware');
		const form = await createRequestForm(technician, {
			name: 'Request a laptop',
			kind: 'equipment',
			queueId: hardware.id
		});
		if (!form.ok) throw new Error(form.error);
		const submitted = await submitEquipmentRequest(employee, {
			formId: form.value.id,
			categoryId: catalogue.categoryId,
			justification: 'My laptop died.'
		});
		if (!submitted.ok) throw new Error(submitted.error);
		return {
			...base,
			monitor,
			ticketTag: submitted.value.ticketTag,
			requesterId: employee.personId
		};
	}

	it('hands the ticket and its requester to the dialogs, and narrows the delivery to its category', async () => {
		const { technician, asset, monitor, ticketTag, requesterId } = await requested();

		const screen = await screenOf(technician, asset.assetTag, {
			fromTicket: ` ${ticketTag.toLowerCase()} `
		});

		expect(screen.context.fromTicket).toEqual({ tag: ticketTag, requesterPersonId: requesterId });
		const offered = screen.choices.deliverable.map((entry) => entry.assetTag);
		expect(offered).toContain(asset.assetTag);
		expect(offered).not.toContain(monitor.assetTag);
	});

	it('ignores the ticket for a viewer who may not link tickets', async () => {
		const { technician, asset, monitor, ticketTag } = await requested();
		const noLinks = { ...technician, scopes: ['assets.view', 'assets.checkout'] as const };

		const screen = await screenOf(noLinks, asset.assetTag, { fromTicket: ticketTag });

		expect(screen.context.fromTicket).toBeNull();
		expect(screen.choices.deliverable.map((entry) => entry.assetTag)).toContain(monitor.assetTag);
	});

	it('shows no context for a ticket that does not exist', async () => {
		const { technician, asset } = await requested();

		const screen = await screenOf(technician, asset.assetTag, { fromTicket: 'TCK-9999' });

		expect(screen.context.fromTicket).toBeNull();
	});
});

describe('the asset screen rail', () => {
	it('merges the tickets raised on the asset into the history', async () => {
		const { technician, employee, organisation, asset } = await setup();
		const queue = await createQueue(organisation.id);
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
			subject: 'Screen flickers'
		});
		await linkTicketAssets(technician, [{ ticketId: ticket.id, assetId: asset.id }]);

		const { rail } = await screenOf(technician, asset.assetTag);
		const resolved = await rail;

		expect(resolved.timeline).not.toBeNull();
		expect(resolved.related.flatMap((group) => group.items.map((item) => item.ref.id))).toEqual([
			ticket.id
		]);
		expect(resolved.recentTickets).toBe(1);
	});
});
