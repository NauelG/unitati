import { setError, type SuperValidated } from 'sveltekit-superforms';
import { m } from '#lib/paraglide/messages.js';
import { assetModelInput, registerAssetInput } from '#lib/server/assets/validation.js';

/**
 * The shapes the asset forms submit, derived from the validators the domain
 * already owns so a column added to the table cannot leave a form behind.
 *
 * `custodianPersonId` is deliberately not here, and neither is the rest of what
 * the register schema carries. Custody is an event, not a field: a form that
 * could set it would write the row without the `custody.assigned` entry that
 * makes the history trustworthy (ADR 0009). It goes through `assignCustody`.
 *
 * What a blank input becomes is Superforms' behaviour, not ours, and it is the
 * behaviour this relies on: an empty `assetTag` is dropped (so the sequence
 * generates one), and an empty `serial` or `locationId` becomes `null`.
 * `forms.spec.ts` pins it, because an upgrade that changed it would silently
 * turn "leave it blank" into a validation error.
 */
export const registerAssetForm = registerAssetInput.pick({
	name: true,
	assetTag: true,
	serial: true,
	assetModelId: true,
	state: true,
	shared: true,
	locationId: true
});

/** Corrections only: state, custody and location are events with their own actions. */
export const editAssetForm = registerAssetInput.pick({
	name: true,
	assetTag: true,
	serial: true,
	assetModelId: true,
	shared: true
});

/** The inline "create the model right here" form on the register screen. */
export const modelForm = assetModelInput;

/**
 * Replaces Zod's English sentences with ours.
 *
 * What a browser can actually submit invalid is narrow — `required` stops an
 * empty box, a `<select>` offers only real options — so what reaches here is a
 * name made of spaces or a request that did not come from the form. Both are
 * worth a sentence in the user's language rather than "Too small: expected
 * string to have >=1 characters", and writing a message per Zod issue code
 * would be a second copy of validation rules the domain already owns.
 */
export function localiseInvalid<T extends Record<string, unknown>>(form: SuperValidated<T>) {
	const specific: Record<string, () => string> = {
		name: m.validation_name_required,
		assetModelId: m.asset_error_model_required,
		// Blank tags are dropped, never invalid, so the one way a tag fails is a reserved word.
		assetTag: m.asset_error_tag_reserved
	};

	for (const field of Object.keys(form.errors)) {
		if (field === '_errors') continue;
		const message = (specific[field] ?? m.validation_field_invalid)();
		// `overwrite`: without it the localised sentence is appended after Zod's.
		setError(form, field as never, message, { overwrite: true });
	}

	return form;
}
