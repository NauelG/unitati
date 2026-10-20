import { describe, expect, it } from 'vitest';
import { LABEL_OWNER_TEXT_MAX } from '#lib/domain/label-formats.js';
import { getLabelSettings, setLabelOwnerText } from '.';
import { createOrganisation, createViewer } from './testing/fixtures';

/**
 * The owner line printed on asset labels (ADR 0038): the organisation's own
 * text, or `null` for the default "Propiedad de {product name}".
 */

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Technician');
	const employee = await createViewer(organisation.id, 'employee', 'Eva Employee');
	return { organisation, technician, employee };
}

describe('the label owner line', () => {
	it('is the default when nothing was saved', async () => {
		const { organisation } = await workspace();
		expect(await getLabelSettings(organisation.id)).toEqual({ ownerText: null });
	});

	it('stores the whole line trimmed, wording included', async () => {
		const { organisation, technician } = await workspace();

		const saved = await setLabelOwnerText(technician, '  Pertenece a Acme IT · ext. 2100  ');

		expect(saved).toEqual({ ok: true, value: { ownerText: 'Pertenece a Acme IT · ext. 2100' } });
		expect(await getLabelSettings(organisation.id)).toEqual({
			ownerText: 'Pertenece a Acme IT · ext. 2100'
		});
	});

	it('goes back to the default when saved blank', async () => {
		const { organisation, technician } = await workspace();
		await setLabelOwnerText(technician, 'Acme IT');

		expect(await setLabelOwnerText(technician, '   ')).toEqual({
			ok: true,
			value: { ownerText: null }
		});
		expect(await getLabelSettings(organisation.id)).toEqual({ ownerText: null });
	});

	it('counts graphemes, not code units, against the limit', async () => {
		const { technician } = await workspace();
		const flags = '🇪🇸'.repeat(LABEL_OWNER_TEXT_MAX);

		expect((await setLabelOwnerText(technician, flags)).ok).toBe(true);
		expect(await setLabelOwnerText(technician, `${flags}x`)).toEqual({
			ok: false,
			error: 'invalid_owner_text'
		});
	});

	it('refuses a line break', async () => {
		const { technician } = await workspace();
		expect(await setLabelOwnerText(technician, 'Acme\nIT')).toEqual({
			ok: false,
			error: 'invalid_owner_text'
		});
	});

	it('is only for whoever manages assets, and stays inside the organisation', async () => {
		const { organisation, technician, employee } = await workspace();
		const other = await createOrganisation('Globex', 'globex');

		expect(await setLabelOwnerText(employee, 'Mine')).toEqual({ ok: false, error: 'forbidden' });
		await setLabelOwnerText(technician, 'Acme IT');

		expect(await getLabelSettings(organisation.id)).toEqual({ ownerText: 'Acme IT' });
		expect(await getLabelSettings(other.id)).toEqual({ ownerText: null });
	});
});
