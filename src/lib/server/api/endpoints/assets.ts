import { z } from 'zod';
import { ASSET_STATES } from '#lib/domain/status.js';
import {
	addNote,
	assetTimeline,
	deliver,
	changeLocation,
	changeState,
	getAssetByTag,
	listAssets,
	registerAsset,
	registerAssetInput,
	returnCustody,
	updateAssetDetails,
	updateAssetDetailsInput,
	type AssetView,
	type FullAssetView
} from '../../assets';
import type { ApiPrincipal } from '../keys';
import {
	type ApiError,
	created,
	defineEndpoint,
	notFound,
	Reply,
	type Endpoint
} from '../registry';
import { named, paginationMetaSchema } from '../shared-schemas';
import { invalidField, refusal } from './refusals';
import { entryToWire, timelineEntrySchema } from './timeline-wire';

/**
 * The asset use cases (ADR 0022). Assets are addressed by tag (ADR 0010): the
 * UUID is not on the wire, and every handler resolves the tag with
 * `getAssetByTag`, which applies the read scope. The write permissions below
 * are the gate the UI routes apply with `requirePermission`, copied exactly;
 * `assets.spec.ts` pins that they cannot drift apart.
 */

const VIEW = ['assets.view', 'assets.view.own', 'assets.view.shared'] as const;
const MANAGE = ['assets.manage'] as const;
const CHECKOUT = ['assets.checkout'] as const;

const personRef = z.object({ id: z.string(), name: z.string() });

/** Everything about an asset, for a key that may see the whole row (`assets.view`, or the asset is in the owner's custody). */
const fullAssetSchema = named(
	'FullAsset',
	z.object({
		visibility: z.literal('full'),
		tag: z.string(),
		name: z.string(),
		serial: z.string().nullable(),
		state: z.enum(ASSET_STATES),
		shared: z.boolean(),
		assetModelId: z.string(),
		modelName: z.string(),
		manufacturerName: z.string(),
		categoryName: z.string(),
		custodian: personRef.nullable(),
		locationId: z.string().nullable(),
		locationPath: z.string().nullable()
	})
);

/** What `assets.view.shared` grants and nothing more (ADR 0007): no serial, cost, purchase data or custody. */
const sharedAssetSchema = named(
	'SharedAsset',
	z.object({
		visibility: z.literal('shared'),
		tag: z.string(),
		name: z.string(),
		locationPath: z.string().nullable()
	})
);

const assetSchema = named(
	'Asset',
	z.discriminatedUnion('visibility', [fullAssetSchema, sharedAssetSchema])
);

/** The output schema is the allow-list: a field it does not name never leaves. */
function toWire(view: AssetView): z.input<typeof assetSchema> {
	if (view.visibility === 'shared') {
		return {
			visibility: 'shared',
			tag: view.assetTag,
			name: view.name,
			locationPath: view.locationPath
		};
	}
	return {
		visibility: 'full',
		tag: view.assetTag,
		name: view.name,
		serial: view.serial,
		state: view.state,
		shared: view.shared,
		assetModelId: view.assetModelId,
		modelName: view.modelName,
		manufacturerName: view.manufacturerName,
		categoryName: view.categoryName,
		custodian:
			view.custodianPersonId === null
				? null
				: { id: view.custodianPersonId, name: view.custodianName ?? '' },
		locationId: view.locationId,
		locationPath: view.locationPath
	};
}

const assetResponse = z.object({ data: assetSchema });

/**
 * Writing needs the internal id and a read-back, and a key scoped to
 * `assets.manage` alone may hold no read permission. The asset-read scopes are
 * added for that call; `can()` still intersects with the owner's role, so this
 * never reaches an asset the owner could not see (same device as the ticket
 * endpoints use to name assets).
 */
function withReads(principal: ApiPrincipal): ApiPrincipal {
	return { ...principal, scopes: [...new Set([...principal.scopes, ...VIEW])] };
}

/**
 * The asset a write targets. Only the whole row carries an id, so a reduced
 * (shared) view is answered like a missing page: nobody who may write is
 * limited to it.
 */
async function targetOf(actor: ApiPrincipal, tag: string): Promise<FullAssetView> {
	const found = await getAssetByTag(actor, tag);
	if (!found.ok || found.value.visibility !== 'full') throw notFound('Asset not found.');
	return found.value;
}

/** The asset after a write, in the wire shape. The write has succeeded, so a miss is a bug, not a 404. */
async function written(actor: ApiPrincipal, tag: string) {
	const found = await getAssetByTag(actor, tag);
	if (!found.ok) throw new Error(`Asset ${tag} vanished after a write.`);
	return { data: toWire(found.value) };
}

/** Domain failures that name a value in the body, mapped to the field that carried it. */
const FIELD_FAILURES: Record<string, readonly [string, string]> = {
	model_not_found: ['assetModelId', 'Asset model not found.'],
	location_not_found: ['locationId', 'Location not found.'],
	person_not_found: ['personId', 'Person not found.'],
	empty_note: ['text', 'The note cannot be empty.']
};

function assetRefusal(failure: string): ApiError {
	const field = FIELD_FAILURES[failure];
	return field ? invalidField(field[0], field[1]) : refusal(failure);
}

const tag = z.string().min(1);

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export const listAssetsEndpoint = defineEndpoint({
	id: 'assets.list',
	method: 'GET',
	path: '/assets',
	summary: 'List the assets the key can see, ordered by tag.',
	description:
		'Returns one page of the assets the key can see, ordered by tag. Each item carries `visibility`: `full` for a key that may see the whole row, `shared` (name and location only) for one limited to shared assets. Filter with `search`; page with `page` and `perPage` (out-of-range values are clamped). The response carries `meta` with the totals.',
	example: { search: 'macbook', page: 1, perPage: 25 },
	permissions: VIEW,
	input: z.object({
		search: z.string().optional(),
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({ data: z.array(assetSchema), meta: paginationMetaSchema }),
	handler: async ({ principal, input }) => {
		const result = await listAssets(principal, input);
		return {
			data: result.rows.map(toWire),
			meta: {
				page: result.page,
				perPage: result.perPage,
				total: result.total,
				pageCount: result.pageCount
			}
		};
	}
});

export const getAssetEndpoint = defineEndpoint({
	id: 'assets.get',
	method: 'GET',
	path: '/assets/{tag}',
	summary: 'Get one asset by its tag.',
	description:
		'Returns one asset, addressed by its tag (for example `AST-0042`). `visibility` tells which view the key received: `full`, or `shared` (name and location only). An asset the key cannot see is answered with `404`, the same as one that does not exist.',
	permissions: VIEW,
	input: z.object({ tag }),
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const found = await getAssetByTag(principal, input.tag);
		if (!found.ok) throw notFound('Asset not found.');
		return { data: toWire(found.value) };
	}
});

export const assetTimelineEndpoint = defineEndpoint({
	id: 'assets.timeline',
	method: 'GET',
	path: '/assets/{tag}/timeline',
	summary: "Read an asset's history, newest first.",
	description:
		"Returns the events recorded on the asset, newest first: registration, custody, state and location changes, and notes. An asset's history is not part of the shared view, so a key limited to shared assets (or to assets it does not hold) gets `404`.",
	permissions: VIEW,
	input: z.object({ tag }),
	output: z.object({ data: z.array(timelineEntrySchema) }),
	handler: async ({ principal, input }) => {
		const history = await assetTimeline(principal, input.tag);
		// History hidden from a viewer is an answer they may not have: as a missing page (ADR 0007).
		if (!history.ok) throw notFound('Asset not found.');
		return { data: history.value.map(entryToWire) };
	}
});

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The fields the register screen submits. `custodianPersonId` is left out on
 * purpose: custody is an event with its own endpoint, and a field that could set
 * it would write the row without the `custody.assigned` entry (ADR 0009).
 */
const registerBody = registerAssetInput.pick({
	name: true,
	assetTag: true,
	serial: true,
	assetModelId: true,
	state: true,
	shared: true,
	locationId: true
});

export const registerAssetEndpoint = defineEndpoint({
	id: 'assets.register',
	method: 'POST',
	path: '/assets',
	summary: 'Register an asset.',
	description:
		'Registers an asset and opens its history. `assetTag` is optional: when omitted the next `AST-####` is generated, and an explicit one is accepted (ADR 0010). `serial` is optional. Answers `201` with the asset and a `Location` header. A tag or serial already in use is `409` (`duplicate_asset_tag`, `duplicate_serial`); an unknown `assetModelId` or `locationId` is a `400` on that field. Models and locations are managed in the application; take their ids from there.',
	example: {
		name: 'MacBook Pro 14"',
		assetTag: 'AST-0142',
		serial: 'C02XK0ABJGH5',
		assetModelId: '00000000-0000-4000-8000-000000000000',
		state: 'in_stock'
	},
	status: 201,
	permissions: MANAGE,
	input: registerBody,
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const outcome = await registerAsset(actor, input);
		if (!outcome.ok) throw assetRefusal(outcome.error);

		return created(
			await written(actor, outcome.value.assetTag),
			`/assets/${outcome.value.assetTag}`
		);
	}
});

export const updateAssetEndpoint = defineEndpoint({
	id: 'assets.update',
	method: 'PATCH',
	path: '/assets/{tag}',
	summary: "Correct an asset's details.",
	description:
		'Edits `name`, `assetTag`, `serial`, `assetModelId` and `shared`; every field is optional. This is a correction, not an event: nothing is added to the history. State, custody and location have their own endpoints. If `assetTag` changes, the response carries the new tag and a `Location` header with the new URL; the old URL is `404` from then on, with no redirect. A tag or serial already in use is `409`.',
	example: { name: 'MacBook Pro 14" (spare)', serial: 'C02XK0ABJGH5' },
	permissions: MANAGE,
	input: updateAssetDetailsInput.extend({ tag }),
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const { tag: currentTag, ...changes } = input;
		const target = await targetOf(actor, currentTag);

		const outcome = await updateAssetDetails(actor, target.id, changes);
		if (!outcome.ok) throw assetRefusal(outcome.error);

		const newTag = changes.assetTag ?? currentTag;
		const body = await written(actor, newTag);
		return newTag === currentTag
			? body
			: new Reply(200, body, { location: `/api/v1/assets/${newTag}` });
	}
});

export const assignCustodyEndpoint = defineEndpoint({
	id: 'assets.custody.assign',
	method: 'POST',
	path: '/assets/{tag}/custody',
	summary: 'Hand an asset to a person.',
	description:
		"Records that the asset is now in the custody of `personId`. An asset already in someone's custody is not reassigned silently: return it first. An unknown `personId` is a `400` on that field. If the asset's category requires a handover, a pending delivery handover is issued and its code is returned as `handoverCode` (otherwise `null`); the signing link is mailed to the person when mail is on, and is never part of the response. With no delivery template configured the request is refused with `409` `no_delivery_template` and nothing is written.",
	example: { personId: '00000000-0000-4000-8000-000000000000' },
	permissions: CHECKOUT,
	input: z.object({ tag, personId: z.uuid() }),
	output: z.object({ data: assetSchema, handoverCode: z.string().nullable() }),
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await targetOf(actor, input.tag);
		// The one door to custody for a person's action, so a required handover cannot be skipped.
		// No waive option here: a service account never waives a handover (#277).
		const outcome = await deliver(actor, { personId: input.personId, assetIds: [target.id] });
		if (!outcome.ok) throw assetRefusal(outcome.error);
		return {
			...(await written(actor, input.tag)),
			handoverCode: outcome.value.handover?.code ?? null
		};
	}
});

export const returnCustodyEndpoint = defineEndpoint({
	id: 'assets.custody.return',
	method: 'DELETE',
	path: '/assets/{tag}/custody',
	summary: 'Take an asset back from whoever holds it.',
	description:
		'Ends the current custody and answers `200` with the updated asset. An asset nobody holds is `409` with `code: "not_in_custody"`.',
	permissions: CHECKOUT,
	input: z.object({ tag }),
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await targetOf(actor, input.tag);
		const outcome = await returnCustody(actor, target.id);
		if (!outcome.ok) throw assetRefusal(outcome.error);
		return written(actor, input.tag);
	}
});

export const changeStateEndpoint = defineEndpoint({
	id: 'assets.state',
	method: 'POST',
	path: '/assets/{tag}/state',
	summary: 'Change the lifecycle state of an asset.',
	description:
		'Moves the asset to `in_use`, `in_repair`, `in_stock` or `retired` and records the change. State is independent of custody. Setting the state the asset already has changes nothing and writes no event.',
	example: { state: 'in_repair' },
	permissions: MANAGE,
	input: z.object({ tag, state: z.enum(ASSET_STATES) }),
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await targetOf(actor, input.tag);
		const outcome = await changeState(actor, target.id, input.state);
		if (!outcome.ok) throw assetRefusal(outcome.error);
		return written(actor, input.tag);
	}
});

export const changeLocationEndpoint = defineEndpoint({
	id: 'assets.location',
	method: 'POST',
	path: '/assets/{tag}/location',
	summary: 'Move an asset to another location, or clear it.',
	description:
		"Sets the asset's own location (not its custodian's) and records the move. Send `locationId: null` to clear it. An unknown `locationId` is a `400` on that field.",
	example: { locationId: '00000000-0000-4000-8000-000000000000' },
	permissions: MANAGE,
	input: z.object({ tag, locationId: z.uuid().nullable() }),
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await targetOf(actor, input.tag);
		const outcome = await changeLocation(actor, target.id, input.locationId);
		if (!outcome.ok) throw assetRefusal(outcome.error);
		return written(actor, input.tag);
	}
});

export const addNoteEndpoint = defineEndpoint({
	id: 'assets.note',
	method: 'POST',
	path: '/assets/{tag}/notes',
	summary: "Add a note to an asset's timeline.",
	description:
		"Adds a free-text entry to the asset's history and answers `201` with the asset. An empty `text` is a `400` on that field.",
	example: { text: 'Keyboard replaced under warranty.' },
	status: 201,
	permissions: MANAGE,
	input: z.object({ tag, text: z.string() }),
	output: assetResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await targetOf(actor, input.tag);
		const outcome = await addNote(actor, target.id, input.text);
		if (!outcome.ok) throw assetRefusal(outcome.error);
		return created(await written(actor, input.tag), `/assets/${input.tag}/timeline`);
	}
});

export const ASSET_ENDPOINTS: readonly Endpoint[] = [
	listAssetsEndpoint,
	getAssetEndpoint,
	assetTimelineEndpoint,
	registerAssetEndpoint,
	updateAssetEndpoint,
	assignCustodyEndpoint,
	returnCustodyEndpoint,
	changeStateEndpoint,
	changeLocationEndpoint,
	addNoteEndpoint
];
