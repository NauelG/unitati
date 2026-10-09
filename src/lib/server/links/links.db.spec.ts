import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { refusalFrom } from '../db/testing/refusal';
import { assets } from '../assets/schema';
import { tickets } from '../service-desk/schema';
import { listActivity } from '../activity';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { linkAsset, relatedTo, ticketAsset, unlinkAsset } from './index';

/**
 * ADR 0005 stakes the product on this: the database cannot hold a ticket
 * pointing at an asset that does not exist. These specs prove the guarantee
 * and the behaviour built on it, at the module's public surface.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const { modelId } = await createCatalogue(organisation.id);
	const queue = await createQueue(organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);

	return { organisation, modelId, queue, technician, employee, ticket };
}

describe('linkAsset', () => {
	it('links the asset and records it against the ticket, not the asset', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0142',
			name: 'MacBook Pro 14'
		});

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, technician, { ticketId: ticket.id, assetId: asset.id })
		);

		const onTicket = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		const onAsset = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});

		expect({
			outcome,
			ticketVerbs: onTicket.map((entry) => entry.verb),
			payload: onTicket[0]?.payload,
			assetVerbs: onAsset.map((entry) => entry.verb)
		}).toEqual({
			outcome: { ok: true, value: undefined },
			ticketVerbs: ['link.asset.added'],
			payload: { assetId: asset.id, assetTag: 'AST-0142', assetName: 'MacBook Pro 14' },
			assetVerbs: []
		});
	});

	it('refuses a second link between the same ticket and asset, without losing the first', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId, { assetTag: 'AST-0142' });
		const pair = { ticketId: ticket.id, assetId: asset.id };

		await getDb().transaction((tx) => linkAsset(tx, technician, pair));
		const second = await getDb().transaction((tx) => linkAsset(tx, technician, pair));

		const links = await getDb().select().from(ticketAsset);
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});

		expect({ second, links: links.length, entries: history.length }).toEqual({
			second: { ok: false, error: 'already_linked' },
			links: 1,
			entries: 1
		});
	});

	it('attributes the link to the person who made it', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);

		await getDb().transaction((tx) =>
			linkAsset(tx, technician, { ticketId: ticket.id, assetId: asset.id })
		);

		const [link] = await getDb().select().from(ticketAsset);
		expect(link.createdByPersonId).toBe(technician.personId);
	});

	it('attaches several assets to one ticket', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const laptop = await createAsset(organisation.id, modelId, { assetTag: 'AST-0001' });
		const dock = await createAsset(organisation.id, modelId, { assetTag: 'AST-0002' });

		await getDb().transaction(async (tx) => {
			await linkAsset(tx, technician, { ticketId: ticket.id, assetId: laptop.id });
			await linkAsset(tx, technician, { ticketId: ticket.id, assetId: dock.id });
		});

		const links = await getDb().select().from(ticketAsset);
		expect(links.map((link) => link.assetId).sort()).toEqual([laptop.id, dock.id].sort());
	});

	it('does not link an asset that does not exist', async () => {
		const { technician, ticket } = await workspace();

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, technician, { ticketId: ticket.id, assetId: crypto.randomUUID() })
		);

		expect(outcome).toEqual({ ok: false, error: 'asset_not_found' });
	});

	it('does not link a ticket that does not exist', async () => {
		const { organisation, modelId, technician } = await workspace();
		const asset = await createAsset(organisation.id, modelId);

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, technician, { ticketId: crypto.randomUUID(), assetId: asset.id })
		);

		expect(outcome).toEqual({ ok: false, error: 'ticket_not_found' });
	});

	it('does not reach across organisations', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const globexModel = await createCatalogue(globex.id);
		const foreignAsset = await createAsset(globex.id, globexModel.modelId);
		const ownAsset = await createAsset(organisation.id, modelId);
		const foreignTechnician = await createViewer(globex.id, 'technician', 'Gina Globex');

		const foreignAssetOutcome = await getDb().transaction((tx) =>
			linkAsset(tx, technician, { ticketId: ticket.id, assetId: foreignAsset.id })
		);
		const foreignTicketOutcome = await getDb().transaction((tx) =>
			linkAsset(tx, foreignTechnician, { ticketId: ticket.id, assetId: ownAsset.id })
		);

		expect({ foreignAssetOutcome, foreignTicketOutcome }).toEqual({
			foreignAssetOutcome: { ok: false, error: 'asset_not_found' },
			foreignTicketOutcome: { ok: false, error: 'ticket_not_found' }
		});
	});
});

describe('who may attach which asset', () => {
	it('lets an employee attach the asset they hold', async () => {
		const { organisation, modelId, employee, ticket } = await workspace();
		const mine = await createAsset(organisation.id, modelId, {
			custodianPersonId: employee.personId
		});

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, employee, { ticketId: ticket.id, assetId: mine.id })
		);

		expect(outcome.ok).toBe(true);
	});

	it('lets an employee attach a shared asset nobody holds — the floor printer', async () => {
		const { organisation, modelId, employee, ticket } = await workspace();
		const printer = await createAsset(organisation.id, modelId, {
			name: 'Floor printer',
			shared: true
		});

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, employee, { ticketId: ticket.id, assetId: printer.id })
		);

		expect(outcome.ok).toBe(true);
	});

	it('refuses an employee an asset that is neither theirs nor shared, even by id', async () => {
		const { organisation, modelId, employee, ticket } = await workspace();
		const colleague = await createPerson(organisation.id, 'Colin Colleague');
		const theirs = await createAsset(organisation.id, modelId, {
			custodianPersonId: colleague.id
		});
		const stock = await createAsset(organisation.id, modelId, { assetTag: 'AST-0099' });

		const outcomes = await getDb().transaction(async (tx) => [
			await linkAsset(tx, employee, { ticketId: ticket.id, assetId: theirs.id }),
			await linkAsset(tx, employee, { ticketId: ticket.id, assetId: stock.id })
		]);
		const links = await getDb().select().from(ticketAsset);

		expect({ outcomes, links: links.length }).toEqual({
			outcomes: [
				{ ok: false, error: 'asset_not_found' },
				{ ok: false, error: 'asset_not_found' }
			],
			links: 0
		});
	});

	it('refuses an employee a ticket somebody else opened', async () => {
		const { organisation, modelId, queue, ticket } = await workspace();
		const other = await createViewer(organisation.id, 'employee', 'Oscar Other');
		const shared = await createAsset(organisation.id, modelId, { shared: true });

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, other, { ticketId: ticket.id, assetId: shared.id })
		);

		expect(outcome).toEqual({ ok: false, error: 'ticket_not_found' });
		void queue;
	});

	it('lets staff attach any asset of their organisation to any ticket', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const stock = await createAsset(organisation.id, modelId);

		const outcome = await getDb().transaction((tx) =>
			linkAsset(tx, technician, { ticketId: ticket.id, assetId: stock.id })
		);

		expect(outcome.ok).toBe(true);
	});
});

describe('the ticket_asset table', () => {
	/**
	 * The argument for join tables over a polymorphic `Link`, stated as a test:
	 * these insert straight into the table, bypassing the domain function, so
	 * they prove what the *database* refuses and not what the code remembers to.
	 */
	it('refuses a link to an asset that does not exist', async () => {
		const { organisation, ticket } = await workspace();

		const refusal = await refusalFrom(
			getDb().insert(ticketAsset).values({
				organisationId: organisation.id,
				ticketId: ticket.id,
				assetId: crypto.randomUUID()
			})
		);

		expect(refusal).toEqual({ code: '23503', constraint: 'ticket_asset_asset_id_assets_id_fk' });
	});

	it('refuses a link from a ticket that does not exist', async () => {
		const { organisation, modelId } = await workspace();
		const asset = await createAsset(organisation.id, modelId);

		const refusal = await refusalFrom(
			getDb().insert(ticketAsset).values({
				organisationId: organisation.id,
				ticketId: crypto.randomUUID(),
				assetId: asset.id
			})
		);

		expect(refusal).toEqual({ code: '23503', constraint: 'ticket_asset_ticket_id_tickets_id_fk' });
	});

	it('refuses the same pair twice', async () => {
		const { organisation, modelId, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);
		const row = { organisationId: organisation.id, ticketId: ticket.id, assetId: asset.id };

		await getDb().insert(ticketAsset).values(row);
		const refusal = await refusalFrom(getDb().insert(ticketAsset).values(row));

		expect(refusal).toEqual({ code: '23505', constraint: 'ticket_asset_pair' });
	});

	it('removes the links of a deleted asset and leaves the ticket intact', async () => {
		const { organisation, modelId, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);
		await getDb()
			.insert(ticketAsset)
			.values({ organisationId: organisation.id, ticketId: ticket.id, assetId: asset.id });

		await getDb().delete(assets).where(eq(assets.id, asset.id));

		const remainingLinks = await getDb().select().from(ticketAsset);
		const remainingTickets = await getDb().select().from(tickets).where(eq(tickets.id, ticket.id));

		expect({ links: remainingLinks.length, tickets: remainingTickets.length }).toEqual({
			links: 0,
			tickets: 1
		});
	});
});

describe('unlinkAsset', () => {
	async function linked() {
		const scene = await workspace();
		const asset = await createAsset(scene.organisation.id, scene.modelId, {
			assetTag: 'AST-0142',
			name: 'MacBook Pro 14',
			custodianPersonId: scene.employee.personId
		});
		const pair = { ticketId: scene.ticket.id, assetId: asset.id };
		await getDb().transaction((tx) => linkAsset(tx, scene.employee, pair));

		return { ...scene, asset, pair };
	}

	it('removes the link and records it against the ticket with the snapshot', async () => {
		const { organisation, technician, ticket, pair } = await linked();

		const outcome = await unlinkAsset(technician, pair);

		const links = await getDb().select().from(ticketAsset);
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});

		expect({
			outcome,
			links: links.length,
			latest: history[0] && { verb: history[0].verb, payload: history[0].payload }
		}).toEqual({
			outcome: { ok: true, value: undefined },
			links: 0,
			latest: {
				verb: 'link.asset.removed',
				payload: { assetId: pair.assetId, assetTag: 'AST-0142', assetName: 'MacBook Pro 14' }
			}
		});
	});

	it('is refused to an employee, who cannot undo what staff attached', async () => {
		const { employee, pair } = await linked();

		const outcome = await unlinkAsset(employee, pair);
		const links = await getDb().select().from(ticketAsset);

		expect({ outcome, links: links.length }).toEqual({
			outcome: { ok: false, error: 'forbidden' },
			links: 1
		});
	});

	it('says so when the asset is not linked, and writes no history', async () => {
		const { organisation, technician, ticket, pair } = await linked();
		await unlinkAsset(technician, pair);

		const again = await unlinkAsset(technician, pair);
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});

		expect({ again, entries: history.length }).toEqual({
			again: { ok: false, error: 'not_linked' },
			entries: 2
		});
	});

	it('does not unlink across organisations', async () => {
		const { pair } = await linked();
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createViewer(globex.id, 'technician', 'Gina Globex');

		const outcome = await unlinkAsset(foreign, pair);
		const links = await getDb().select().from(ticketAsset);

		expect({ outcome, links: links.length }).toEqual({
			outcome: { ok: false, error: 'not_linked' },
			links: 1
		});
	});
});

describe('relatedTo', () => {
	const at = (iso: string) => new Date(iso);

	/** Inserts the link directly, so the spec controls *when* it was made. */
	async function link(
		organisationId: string,
		ticketId: string,
		assetId: string,
		createdAt = new Date()
	) {
		await getDb().insert(ticketAsset).values({ organisationId, ticketId, assetId, createdAt });
	}

	it('gives a ticket its affected assets, oldest first, as references', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const dock = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0002',
			name: 'Dock',
			state: 'in_repair'
		});
		const laptop = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0001',
			name: 'MacBook Pro 14',
			state: 'in_use'
		});
		await link(organisation.id, ticket.id, laptop.id, at('2026-03-01T10:00:00Z'));
		await link(organisation.id, ticket.id, dock.id, at('2026-04-01T10:00:00Z'));

		const groups = await relatedTo(technician, { kind: 'ticket', id: ticket.id });

		expect(groups).toEqual([
			{
				relation: 'affects',
				icon: 'asset',
				items: [
					{
						ref: {
							kind: 'asset',
							id: laptop.id,
							tag: 'AST-0001',
							title: 'MacBook Pro 14',
							href: '/assets/AST-0001'
						},
						status: 'in_use',
						linkedAt: at('2026-03-01T10:00:00Z')
					},
					{
						ref: {
							kind: 'asset',
							id: dock.id,
							tag: 'AST-0002',
							title: 'Dock',
							href: '/assets/AST-0002'
						},
						status: 'in_repair',
						linkedAt: at('2026-04-01T10:00:00Z')
					}
				]
			}
		]);
	});

	it('gives an asset its tickets, oldest first, with each ticket’s current status', async () => {
		const { organisation, modelId, queue, technician, employee, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);
		const later = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0002',
			subject: 'Screen flickers'
		});
		await link(organisation.id, later.id, asset.id, at('2026-05-01T10:00:00Z'));
		await link(organisation.id, ticket.id, asset.id, at('2026-02-01T10:00:00Z'));

		const [group] = await relatedTo(technician, { kind: 'asset', id: asset.id });

		expect({
			relation: group.relation,
			icon: group.icon,
			tags: group.items.map((item) => item.ref.tag),
			first: group.items[0].ref
		}).toEqual({
			relation: 'affected_by',
			icon: 'ticket',
			tags: [ticket.ticketTag, 'TCK-0002'],
			first: {
				kind: 'ticket',
				id: ticket.id,
				tag: ticket.ticketTag,
				title: 'The printer is jammed',
				href: `/service-desk/${ticket.ticketTag}`
			}
		});
	});

	it('shows the status the ticket has today, with no write to the asset', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);
		await link(organisation.id, ticket.id, asset.id);
		const before = await relatedTo(technician, { kind: 'asset', id: asset.id });

		await getDb().update(tickets).set({ status: 'resolved' }).where(eq(tickets.id, ticket.id));
		const after = await relatedTo(technician, { kind: 'asset', id: asset.id });

		expect({
			before: before[0].items.map((item) => item.status),
			after: after[0].items.map((item) => item.status)
		}).toEqual({ before: ['new'], after: ['resolved'] });
	});

	it('hides a group with nothing in it', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);

		const forTicket = await relatedTo(technician, { kind: 'ticket', id: ticket.id });
		const forAsset = await relatedTo(technician, { kind: 'asset', id: asset.id });

		expect({ forTicket, forAsset }).toEqual({ forTicket: [], forAsset: [] });
	});

	it('shows an employee only the assets they could attach themselves', async () => {
		const { organisation, modelId, employee, technician, ticket } = await workspace();
		const mine = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0001',
			custodianPersonId: employee.personId
		});
		const printer = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0002',
			shared: true
		});
		const colleagues = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0003',
			custodianPersonId: (await createPerson(organisation.id, 'Colin Colleague')).id
		});
		for (const asset of [mine, printer, colleagues]) {
			await getDb().transaction((tx) =>
				linkAsset(tx, technician, { ticketId: ticket.id, assetId: asset.id })
			);
		}

		const [group] = await relatedTo(employee, { kind: 'ticket', id: ticket.id });

		expect(group.items.map((item) => item.ref.tag).sort()).toEqual(['AST-0001', 'AST-0002']);
	});

	it('does not offer an employee the tickets of an asset, which is history', async () => {
		const { organisation, modelId, employee, ticket } = await workspace();
		const mine = await createAsset(organisation.id, modelId, {
			custodianPersonId: employee.personId
		});
		await link(organisation.id, ticket.id, mine.id);

		const groups = await relatedTo(employee, { kind: 'asset', id: mine.id });

		expect(groups).toEqual([]);
	});

	it('does not read across organisations', async () => {
		const { organisation, modelId, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);
		await link(organisation.id, ticket.id, asset.id);
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createViewer(globex.id, 'technician', 'Gina Globex');

		const groups = [
			...(await relatedTo(foreign, { kind: 'ticket', id: ticket.id })),
			...(await relatedTo(foreign, { kind: 'asset', id: asset.id }))
		];

		expect(groups).toEqual([]);
	});

	it('returns groups of one shape for both ends, so a caller never learns the storage', async () => {
		const { organisation, modelId, technician, ticket } = await workspace();
		const asset = await createAsset(organisation.id, modelId);
		await link(organisation.id, ticket.id, asset.id);

		const [fromTicket] = await relatedTo(technician, { kind: 'ticket', id: ticket.id });
		const [fromAsset] = await relatedTo(technician, { kind: 'asset', id: asset.id });

		expect([Object.keys(fromTicket).sort(), Object.keys(fromAsset).sort()]).toEqual([
			['icon', 'items', 'relation'],
			['icon', 'items', 'relation']
		]);
	});
});
