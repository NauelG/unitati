import { describe, expect, it } from 'vitest';
import { listAssetChoices } from '.';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';

/**
 * `listAssetChoices` feeds the picker on the ticket forms. It exists because
 * `listAssets` deliberately leaves the uuid out of a shared row (ADR 0007, and
 * the note in `redaction.db.spec.ts`), and linking an asset needs one. So this
 * function returns the narrowest thing a picker needs — id, tag, name — and
 * only for rows the viewer's own scope already shows them.
 */

async function inventory() {
	const organisation = await createOrganisation();
	const { modelId } = await createCatalogue(organisation.id, 'ThinkPad X1');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const colleague = await createPerson(organisation.id, 'Colin Colleague');

	const mine = await createAsset(organisation.id, modelId, {
		assetTag: 'AST-0001',
		name: 'Eve laptop',
		custodianPersonId: employee.personId
	});
	const printer = await createAsset(organisation.id, modelId, {
		assetTag: 'AST-0002',
		name: 'Floor printer',
		shared: true
	});
	const theirs = await createAsset(organisation.id, modelId, {
		assetTag: 'AST-0003',
		name: 'Colin laptop',
		custodianPersonId: colleague.id
	});

	return { organisation, modelId, employee, technician, mine, printer, theirs };
}

describe('listAssetChoices', () => {
	it('offers an employee the asset they hold and the shared ones, with the id a link needs', async () => {
		const { employee, mine, printer } = await inventory();

		const choices = await listAssetChoices(employee);

		expect(choices).toEqual([
			{ id: mine.id, assetTag: 'AST-0001', name: 'Eve laptop' },
			{ id: printer.id, assetTag: 'AST-0002', name: 'Floor printer' }
		]);
	});

	it('offers staff the whole inventory of their organisation and no other', async () => {
		const { technician } = await inventory();
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createCatalogue(globex.id);
		await createAsset(globex.id, foreign.modelId, { assetTag: 'AST-0900' });

		const choices = await listAssetChoices(technician);

		expect(choices.map((choice) => choice.assetTag)).toEqual(['AST-0001', 'AST-0002', 'AST-0003']);
	});

	it('narrows by a search term, by tag, name or model', async () => {
		const { technician } = await inventory();

		const byName = await listAssetChoices(technician, { search: 'printer' });
		const byTag = await listAssetChoices(technician, { search: 'AST-0003' });
		const byModel = await listAssetChoices(technician, { search: 'thinkpad' });

		expect({
			byName: byName.map((choice) => choice.assetTag),
			byTag: byTag.map((choice) => choice.assetTag),
			byModel: byModel.length
		}).toEqual({ byName: ['AST-0002'], byTag: ['AST-0003'], byModel: 3 });
	});

	it('matches the part of a word typed so far, because a picker filters as you type', async () => {
		const { technician } = await inventory();

		const byTagPrefix = await listAssetChoices(technician, { search: 'ast-000' });
		const byNameStart = await listAssetChoices(technician, { search: 'floor pri' });
		const byModelStart = await listAssetChoices(technician, { search: 'thinkp' });

		expect({
			byTagPrefix: byTagPrefix.length,
			byNameStart: byNameStart.map((choice) => choice.assetTag),
			byModelStart: byModelStart.length
		}).toEqual({ byTagPrefix: 3, byNameStart: ['AST-0002'], byModelStart: 3 });
	});

	it('treats % and _ as the characters they are, not as wildcards', async () => {
		const { technician } = await inventory();

		const percent = await listAssetChoices(technician, { search: '%' });
		const underscore = await listAssetChoices(technician, { search: 'AST_0001' });

		expect({ percent, underscore }).toEqual({ percent: [], underscore: [] });
	});

	it('does not let a search widen an employee’s scope', async () => {
		const { employee } = await inventory();

		const choices = await listAssetChoices(employee, { search: 'Colin' });

		expect(choices).toEqual([]);
	});

	it('does not let an employee learn a model through the search', async () => {
		const { employee } = await inventory();

		const choices = await listAssetChoices(employee, { search: 'thinkpad' });

		expect(choices).toEqual([]);
	});

	it('is bounded, because the limit comes from a query string', async () => {
		const { organisation, modelId, technician } = await inventory();
		for (let index = 10; index < 70; index += 1) {
			await createAsset(organisation.id, modelId, { assetTag: `AST-00${index}` });
		}

		const defaulted = await listAssetChoices(technician);
		const absurd = await listAssetChoices(technician, { limit: 100_000 });

		expect({ defaulted: defaulted.length, absurd: absurd.length }).toEqual({
			defaulted: 10,
			absurd: 50
		});
	});
});
