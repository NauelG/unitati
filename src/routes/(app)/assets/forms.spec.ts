import { describe, expect, it } from 'vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { editAssetForm, localiseInvalid, registerAssetForm } from './forms';

const MODEL_ID = '5ba77c3b-50c4-49ca-8a4b-d1c30d5cd5cc';

function submitted(fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe('registerAssetForm', () => {
	it('lets a blank tag, serial and location through as "use the default" and "none"', async () => {
		const form = await superValidate(
			submitted({
				name: 'Laptop',
				assetTag: '',
				serial: '',
				assetModelId: MODEL_ID,
				state: 'in_stock',
				locationId: ''
			}),
			zod4(registerAssetForm)
		);

		expect(form.valid).toBe(true);
		// Absent, so the database default (the AST-#### sequence) applies.
		expect(form.data.assetTag).toBeUndefined();
		expect(form.data.serial).toBeNull();
		expect(form.data.locationId).toBeNull();
	});

	it('rejects a missing model before it can reach the database', async () => {
		const form = await superValidate(
			submitted({ name: 'Laptop', assetModelId: '', state: 'in_stock' }),
			zod4(registerAssetForm)
		);

		expect(form.valid).toBe(false);
		expect(form.errors.assetModelId).toBeDefined();
	});

	it('rejects a name that is only spaces', async () => {
		const form = await superValidate(
			submitted({ name: '   ', assetModelId: MODEL_ID, state: 'in_stock' }),
			zod4(registerAssetForm)
		);

		expect(form.valid).toBe(false);
		expect(form.errors.name).toBeDefined();
	});

	it('rejects a state outside the four keys', async () => {
		const form = await superValidate(
			submitted({ name: 'Laptop', assetModelId: MODEL_ID, state: 'checked_out' }),
			zod4(registerAssetForm)
		);

		expect(form.valid).toBe(false);
		expect(form.errors.state).toBeDefined();
	});

	it('says so, in Spanish, when the tag is one the router owns', async () => {
		const form = await superValidate(
			submitted({ name: 'Laptop', assetTag: 'models', assetModelId: MODEL_ID, state: 'in_stock' }),
			zod4(registerAssetForm)
		);

		expect(form.valid).toBe(false);
		expect(form.errors.assetTag).toBeDefined();
		expect(localiseInvalid(form).errors.assetTag).toEqual([
			'Esa etiqueta está reservada: elige otra.'
		]);
	});

	it('does not accept a custodian: custody is an event, not a field', async () => {
		const form = await superValidate(
			submitted({
				name: 'Laptop',
				assetModelId: MODEL_ID,
				state: 'in_stock',
				custodianPersonId: MODEL_ID
			}),
			zod4(registerAssetForm)
		);

		expect(form.valid).toBe(true);
		expect(form.data).not.toHaveProperty('custodianPersonId');
	});
});

describe('editAssetForm', () => {
	it('turns a cleared serial into null, which is how a correction removes one', async () => {
		const form = await superValidate(
			submitted({ name: 'Laptop', assetTag: 'AST-0001', serial: '', assetModelId: MODEL_ID }),
			zod4(editAssetForm)
		);

		expect(form.valid).toBe(true);
		expect(form.data.serial).toBeNull();
	});
});
