import { describe, expect, it } from 'vitest';
import { actions as newActions } from './+page.server';
import { actions as editActions } from '../[tag]/edit/+page.server';
import type { SessionUser } from '#lib/server/auth/guards.js';

/**
 * Issue #102's repro is a real POST, not a call to `localiseInvalid` in
 * isolation — `forms.spec.ts` already proves that helper translates every
 * field it knows, but not that the action that calls it is the one wired to
 * the browser's "Too small…" / "Invalid UUID" screenshot. These drive the
 * exact actions `use:enhance` (and a plain unenhanced POST, which hits the
 * same action) submit, with the exact blank/forged inputs the issue
 * describes, and assert the response is Spanish end to end.
 *
 * No database fixture is needed: an invalid form returns from the action
 * before any domain function — `registerAsset`, `createAssetModel`,
 * `updateAssetDetails` — is called, let alone touches a connection.
 */

const technician: SessionUser = {
	id: 'u1',
	name: 'Grace Technician',
	email: 'grace@acme.test',
	role: 'technician',
	organisationId: 'org-1',
	personId: null
};

function posted(fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return new Request('http://localhost/assets/new', { method: 'POST', body: data });
}

function event(fields: Record<string, string>) {
	return { request: posted(fields), locals: { user: technician } } as never;
}

describe('submitting the register form blank, the way the browser actually can', () => {
	it('answers in Spanish for a blank Name and a blank Model', async () => {
		const result = (await newActions.register(
			event({ name: '', state: 'in_stock' })
		)) as unknown as {
			status: number;
			data: { form: { errors: Record<string, string[]> } };
		};

		expect(result.status).toBe(400);
		expect(result.data.form.errors.name).toEqual(['Escribe un nombre.']);
		expect(result.data.form.errors.assetModelId).toEqual(['Elige un modelo.']);
		const wire = JSON.stringify(result);
		expect(wire).not.toContain('Too small');
		expect(wire).not.toContain('Invalid UUID');
	});

	it('still rejects a forged, syntactically invalid Model id without reaching the database', async () => {
		const result = (await newActions.register(
			event({ name: 'Laptop', assetModelId: 'not-a-uuid', state: 'in_stock' })
		)) as unknown as {
			status: number;
			data: { form: { errors: Record<string, string[]> } };
		};

		expect(result.status).toBe(400);
		expect(result.data.form.errors.assetModelId).toEqual(['Elige un modelo.']);
		expect(JSON.stringify(result)).not.toContain('Invalid UUID');
	});
});

describe('submitting the inline "create a model" form blank', () => {
	it('answers in Spanish, not the raw Zod sentence, for every blank field', async () => {
		const result = (await newActions.createModel(event({ name: '' }))) as unknown as {
			status: number;
			data: { form: { errors: Record<string, string[]> } };
		};

		expect(result.status).toBe(400);
		expect(result.data.form.errors.name).toEqual(['Escribe un nombre.']);
		// `manufacturerId`/`categoryId` have no field-specific sentence in
		// `localiseInvalid`, so they fall back to the generic Spanish one —
		// still Spanish, never the raw Zod text.
		expect(result.data.form.errors.manufacturerId).toEqual(['Revisa este campo.']);
		expect(result.data.form.errors.categoryId).toEqual(['Revisa este campo.']);
		const wire = JSON.stringify(result);
		expect(wire).not.toContain('Too small');
		expect(wire).not.toContain('Required');
	});
});

describe('the edit route offers the same createModel action (#220)', () => {
	it('answers a blank model form in Spanish', async () => {
		const result = (await editActions.createModel(event({ name: '' }))) as unknown as {
			status: number;
			data: { form: { errors: Record<string, string[]> } };
		};

		expect(result.status).toBe(400);
		expect(result.data.form.errors.name).toEqual(['Escribe un nombre.']);
	});

	it('refuses a user without assets.manage', async () => {
		const requester = { ...technician, role: 'employee' } as SessionUser;
		const refused = event({ name: 'X' }) as unknown as { locals: { user: SessionUser } };
		refused.locals.user = requester;

		await expect(
			Promise.resolve().then(() => editActions.createModel(refused as never))
		).rejects.toMatchObject({ status: 404 });
	});
});
