import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { ticketAsset } from '../links';
import { ensureDefaultStates } from '../projects/defaults';
import { createProjectRow, createTaskRow, statesByGroup } from '../projects/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { search, type SearchGroup, type SearchResult } from '.';

/**
 * Global search (#12), tested at its public seam: `search(viewer, term)`.
 *
 * The assertions that matter most are about **permissions inside the query**: an
 * employee's groups *and totals* must be computed over what they may see. A search
 * that filtered after counting would report "47 results" of which 3 render, and
 * that number is itself a leak. So the totals are asserted, not just the rows.
 */

const group = (result: SearchResult, key: SearchGroup['key']) =>
	result.groups.find((candidate) => candidate.key === key);

const codes = (found: SearchGroup | undefined) => found?.hits.map((hit) => hit.code) ?? [];

describe('search, as a technician', () => {
	const scenario = async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id, 'MacBook Pró');
		const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
		const requester = await createPerson(organisation.id, 'Ada Lovelace');
		const queue = await createQueue(organisation.id);
		return { organisation, modelId, technician, requester, queue };
	};

	it('finds the asset, the ticket, the project, the task and the person, in the design system’s order', async () => {
		const { organisation, modelId, technician, requester, queue } = await scenario();
		await ensureDefaultStates(getDb(), organisation.id);
		const { unstarted } = await statesByGroup(organisation.id);
		await createAsset(organisation.id, modelId, { assetTag: 'AST-0001', name: 'Reparto cluster' });
		await createTicket(organisation.id, queue.id, requester.id, {
			ticketTag: 'TCK-0001',
			subject: 'Reparto roto'
		});
		const project = await createProjectRow(organisation.id, {
			projectTag: 'PRJ-0001',
			name: 'Reparto de equipos'
		});
		await createTaskRow(organisation.id, project.id, unstarted.id, {
			taskTag: 'TSK-0001',
			title: 'Reparto por plantas'
		});
		await createPerson(organisation.id, 'Reparto Rivera');

		const result = await search(technician, 'reparto');

		expect(result.groups.map((found) => found.key)).toEqual([
			'assets',
			'tickets',
			'projects',
			'people'
		]);
		expect(codes(group(result, 'projects'))).toEqual(
			expect.arrayContaining(['PRJ-0001', 'TSK-0001'])
		);
	});

	it('returns at most five per group but reports the real total', async () => {
		const { organisation, modelId, technician } = await scenario();
		for (let n = 1; n <= 8; n++) {
			await createAsset(organisation.id, modelId, {
				assetTag: `AST-10${n}`,
				name: `Portátil de planta ${n}`
			});
		}

		const result = await search(technician, 'portátil');

		expect(group(result, 'assets')?.hits).toHaveLength(5);
		expect(group(result, 'assets')?.total).toBe(8);
	});

	it('matches an asset model written with an accent when the query has none', async () => {
		const { organisation, modelId, technician } = await scenario();
		await createAsset(organisation.id, modelId, { assetTag: 'AST-0142', name: 'Equipo de Ada' });

		const result = await search(technician, 'macbook');

		expect(codes(group(result, 'assets'))).toEqual(['AST-0142']);
	});

	it('matches a ticket subject through the Spanish dictionary: "impresoras" finds "impresora"', async () => {
		const { organisation, technician, requester, queue } = await scenario();
		await createTicket(organisation.id, queue.id, requester.id, {
			ticketTag: 'TCK-0007',
			subject: 'La impresora no imprime'
		});

		const result = await search(technician, 'impresoras');

		expect(codes(group(result, 'tickets'))).toEqual(['TCK-0007']);
	});

	it('matches while the word is still being typed', async () => {
		const { organisation, technician, requester, queue } = await scenario();
		await createTicket(organisation.id, queue.id, requester.id, {
			ticketTag: 'TCK-0008',
			subject: 'Migración del correo'
		});

		const result = await search(technician, 'migrac');

		expect(codes(group(result, 'tickets'))).toEqual(['TCK-0008']);
	});

	it('puts an exact code first, on its own, and not again in its type group', async () => {
		const { organisation, modelId, technician } = await scenario();
		await createAsset(organisation.id, modelId, { assetTag: 'AST-0142', name: 'Portátil' });

		const result = await search(technician, 'ast-0142');

		expect(result.groups.map((found) => found.key)).toEqual(['code']);
		expect(codes(group(result, 'code'))).toEqual(['AST-0142']);
		expect(group(result, 'code')?.hits[0]).toMatchObject({
			kind: 'asset',
			href: '/assets/AST-0142'
		});
	});

	it('shows the top asset’s tickets as the next group', async () => {
		const { organisation, modelId, technician, requester, queue } = await scenario();
		const asset = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0200',
			name: 'Plotter de planta baja'
		});
		const ticket = await createTicket(organisation.id, queue.id, requester.id, {
			ticketTag: 'TCK-0200',
			subject: 'Atasco de papel'
		});
		await getDb()
			.insert(ticketAsset)
			.values({ organisationId: organisation.id, ticketId: ticket.id, assetId: asset.id });

		const result = await search(technician, 'plotter');

		expect(result.groups.map((found) => found.key)).toEqual(['assets', 'asset_tickets']);
		expect(codes(group(result, 'asset_tickets'))).toEqual(['TCK-0200']);
	});

	it('leaves out retired assets and archived projects', async () => {
		const { organisation, modelId, technician } = await scenario();
		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0300',
			name: 'Torre jubilada',
			state: 'retired'
		});
		await createProjectRow(organisation.id, {
			projectTag: 'PRJ-0300',
			name: 'Torre antigua',
			archivedAt: new Date()
		});

		const result = await search(technician, 'torre');

		expect(result.groups).toEqual([]);
	});

	it('finds nothing for an empty or punctuation-only term', async () => {
		const { technician } = await scenario();

		expect((await search(technician, '   ')).groups).toEqual([]);
		expect((await search(technician, '&|!:')).groups).toEqual([]);
	});

	it('does not see another organisation’s records', async () => {
		const { technician } = await scenario();
		const other = await createOrganisation('Other', 'other');
		const { modelId } = await createCatalogue(other.id);
		await createAsset(other.id, modelId, { assetTag: 'AST-9999', name: 'Secret server' });

		expect((await search(technician, 'secret')).groups).toEqual([]);
		expect((await search(technician, 'AST-9999')).groups).toEqual([]);
	});
});

describe('search, as an employee', () => {
	const scenario = async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id, 'ThinkPad X1');
		const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
		const colleague = await createPerson(organisation.id, 'Alan Turing');
		const queue = await createQueue(organisation.id);

		const own = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-OWN',
			name: 'Portátil de Ada',
			serial: 'SERIAL-ADA',
			custodianPersonId: employee.personId
		});
		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-OTHER',
			name: 'Portátil de Alan',
			serial: 'SERIAL-ALAN',
			custodianPersonId: colleague.id
		});
		const shared = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-SHARED',
			name: 'Portátil de la sala',
			serial: 'SERIAL-SALA',
			shared: true
		});

		const ownTicket = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-OWN',
			subject: 'Portátil lento'
		});
		await createTicket(organisation.id, queue.id, colleague.id, {
			ticketTag: 'TCK-OTHER',
			subject: 'Portátil sin batería'
		});

		return { organisation, employee, colleague, own, shared, ownTicket };
	};

	it('finds only their own assets, the shared ones, and their own tickets', async () => {
		const { employee } = await scenario();

		const result = await search(employee, 'portátil');

		expect(codes(group(result, 'assets')).sort()).toEqual(['AST-OWN', 'AST-SHARED']);
		expect(codes(group(result, 'tickets'))).toEqual(['TCK-OWN']);
	});

	it('counts only what they may see: the total never reveals the rest of the inventory', async () => {
		const { employee } = await scenario();

		const result = await search(employee, 'portátil');

		expect(group(result, 'assets')?.total).toBe(2);
		expect(group(result, 'tickets')?.total).toBe(1);
	});

	it('has no people or project groups at all', async () => {
		const { employee } = await scenario();

		const result = await search(employee, 'alan');

		expect(result.groups).toEqual([]);
	});

	it('finds nothing — not a refusal — for the exact code of a ticket that is not theirs', async () => {
		const { employee } = await scenario();

		expect((await search(employee, 'TCK-OTHER')).groups).toEqual([]);
		expect((await search(employee, 'AST-OTHER')).groups).toEqual([]);
	});

	it('does not let a shared asset be found by its serial', async () => {
		const { employee } = await scenario();

		expect((await search(employee, 'SERIAL-SALA')).groups).toEqual([]);
	});

	it('does not let a shared asset be found by its model, which a shared view does not show', async () => {
		const { employee, own } = await scenario();
		void own;

		const result = await search(employee, 'thinkpad');

		expect(codes(group(result, 'assets'))).toEqual(['AST-OWN']);
	});

	it('returns a shared asset with its name and nothing from the redacted fields', async () => {
		const { employee } = await scenario();

		const result = await search(employee, 'AST-SHARED');

		expect(group(result, 'code')?.hits[0]).toEqual({
			kind: 'asset',
			code: 'AST-SHARED',
			title: 'Portátil de la sala',
			subtitle: null,
			href: '/assets/AST-SHARED'
		});
	});
});
