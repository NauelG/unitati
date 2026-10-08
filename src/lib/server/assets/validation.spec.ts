import { describe, expect, it } from 'vitest';
import {
	assetModelInput,
	manufacturerInput,
	registerAssetInput,
	updateAssetDetailsInput
} from './validation';

/**
 * The acceptance criterion "creating an asset without a model is rejected
 * before it reaches the database", plus the refinements the generator does not
 * make on its own.
 *
 * These schemas are generated *from* the Drizzle tables, so most of what is
 * asserted here is really an assertion about `schema.ts`: that
 * `asset_model_id` is still `not null` with no default, and that `state` is
 * still the four-key enum. Change either and this file goes red, which is the
 * point of generating rather than hand-writing them.
 */

const model = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';

describe('registerAssetInput', () => {
	it('rejects an asset with no model', () => {
		const result = registerAssetInput.safeParse({ name: 'A laptop' });

		expect(result.success).toBe(false);
	});

	it('names the missing field, so a form can mark it', () => {
		const result = registerAssetInput.safeParse({ name: 'A laptop' });

		expect(result.success ? [] : result.error.issues.map((issue) => issue.path)).toEqual([
			['assetModelId']
		]);
	});

	it('accepts an asset with a name and a model', () => {
		expect(registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model }).success).toBe(
			true
		);
	});

	/**
	 * `text not null` becomes `z.string()`, which `''` satisfies. The database
	 * would take a nameless asset happily and every screen that lists one would
	 * show a blank line, so the refinement is not cosmetic.
	 */
	it('rejects a blank name', () => {
		expect(registerAssetInput.safeParse({ name: '', assetModelId: model }).success).toBe(false);
	});

	it('rejects a name that is only whitespace', () => {
		expect(registerAssetInput.safeParse({ name: '   ', assetModelId: model }).success).toBe(false);
	});

	it('trims the name it accepts', () => {
		const result = registerAssetInput.safeParse({ name: '  A laptop  ', assetModelId: model });

		expect(result.success && result.data.name).toBe('A laptop');
	});

	/** The organisation comes from the session, never from the payload (ADR 0004). */
	it('ignores an organisation named in the payload', () => {
		const result = registerAssetInput.safeParse({
			name: 'A laptop',
			assetModelId: model,
			organisationId: '00000000-0000-4000-8000-000000000000'
		});

		expect(result.success && 'organisationId' in result.data).toBe(false);
	});

	it('rejects a state outside the four keys', () => {
		const result = registerAssetInput.safeParse({
			name: 'A laptop',
			assetModelId: model,
			state: 'checked_out'
		});

		expect(result.success).toBe(false);
	});

	it('accepts each of the four states', () => {
		const states = ['in_use', 'in_repair', 'in_stock', 'retired'];

		const accepted = states.filter(
			(state) =>
				registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model, state }).success
		);

		expect(accepted).toEqual(states);
	});

	/**
	 * The tag has a database default, so a caller must be able to leave it out —
	 * and `RegisterAssetInput` must say so, not merely tolerate it. Refining a
	 * column through `drizzle-zod` keeps the runtime wrapper but loses it from
	 * the inferred type, which made this field required in TypeScript while
	 * still optional when parsed.
	 */
	it('accepts an asset with no tag, because the database generates one', () => {
		const result = registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model });

		expect(result.success && result.data.assetTag).toBeUndefined();
	});

	it('accepts an asset with no serial at all', () => {
		const result = registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model });

		expect(result.success && result.data.serial).toBeUndefined();
	});

	it('still rejects a blank tag when one is given', () => {
		expect(
			registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model, assetTag: '  ' })
				.success
		).toBe(false);
	});

	/** Plenty of equipment has no serial; that is why the column is nullable. */
	it('accepts a null serial', () => {
		expect(
			registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model, serial: null }).success
		).toBe(true);
	});

	/**
	 * A blank serial must not pass as a serial: the partial unique index treats
	 * `''` as a real value, so two untouched form fields would collide with each
	 * other and the second save would fail for no reason the user can see.
	 */
	it('rejects a blank serial rather than storing one', () => {
		expect(
			registerAssetInput.safeParse({ name: 'A laptop', assetModelId: model, serial: '' }).success
		).toBe(false);
	});

	it('rejects a model id that is not a uuid', () => {
		expect(
			registerAssetInput.safeParse({ name: 'A laptop', assetModelId: 'the-macbook-one' }).success
		).toBe(false);
	});

	/** `search` is `GENERATED ALWAYS`; nothing may offer a value for it. */
	it('does not accept a value for the generated search column', () => {
		const result = registerAssetInput.safeParse({
			name: 'A laptop',
			assetModelId: model,
			search: "'macbook':1"
		});

		expect(result.success && 'search' in result.data).toBe(false);
	});
});

describe('reserved tags', () => {
	// The tag is the URL segment (ADR 0010), and the app's own sections live
	// beside it: a tag called `models` would be unreachable, because the static
	// route wins over `[tag]`.
	it.each(['new', 'models', 'categories', 'manufacturers', 'Models', ' NEW '])(
		'refuses %j as a tag',
		(assetTag) => {
			expect(
				registerAssetInput.safeParse({ name: 'A', assetModelId: model, assetTag }).success
			).toBe(false);
			expect(updateAssetDetailsInput.safeParse({ assetTag }).success).toBe(false);
		}
	);

	it('still accepts an ordinary tag, including one that merely contains a reserved word', () => {
		expect(
			registerAssetInput.safeParse({ name: 'A', assetModelId: model, assetTag: 'MODELS-01' })
				.success
		).toBe(true);
	});
});

describe('updateAssetDetailsInput', () => {
	it('accepts an edit of one field alone', () => {
		expect(updateAssetDetailsInput.safeParse({ name: 'Renamed' }).success).toBe(true);
	});

	/**
	 * State, custody and location are events, not corrections: they go through
	 * the functions that write their verb into the activity log, so an edit form
	 * cannot change them silently.
	 */
	it('does not accept state, custody or location', () => {
		const result = updateAssetDetailsInput.safeParse({
			name: 'Renamed',
			state: 'retired',
			custodianPersonId: model,
			locationId: model
		});

		expect(
			result.success &&
				!('state' in result.data) &&
				!('custodianPersonId' in result.data) &&
				!('locationId' in result.data)
		).toBe(true);
	});
});

describe('catalogue inputs', () => {
	it('rejects a manufacturer with a blank name', () => {
		expect(manufacturerInput.safeParse({ name: '' }).success).toBe(false);
	});

	it('requires a model to carry both a manufacturer and a category', () => {
		const result = assetModelInput.safeParse({ name: 'MacBook Pro 14' });

		expect(result.success ? [] : result.error.issues.map((issue) => issue.path).sort()).toEqual([
			['categoryId'],
			['manufacturerId']
		]);
	});
});
