import { z } from 'zod';
import { countAssetsByLocation } from '../../assets';
import {
	countLocationChildren,
	createLocation,
	deleteLocation,
	listLocations,
	locationInput,
	updateLocation,
	type LocationEntry,
	type LocationInput
} from '../../directory';
import {
	ApiError,
	conflict,
	created,
	defineEndpoint,
	noContent,
	notFound,
	type Endpoint
} from '../registry';
import { named } from '../shared-schemas';
import { refusal } from './refusals';

/**
 * The locations catalogue (ADR 0022, ADR 0027). Reading is `assets.view`, held
 * by admin and technician only: an employee's `assets.view.shared` grants a
 * location's path beside an asset, never its address, coordinates or notes
 * (ADR 0007), so no employee key reaches these endpoints. Writing is
 * `assets.manage`, the gate the Settings page applies.
 */

const VIEW = ['assets.view'] as const;
const MANAGE = ['assets.manage'] as const;

/** Named `LocationResource`: `Location` is already the response header of every `201`. */
const locationSchema = named(
	'LocationResource',
	z.object({
		id: z.string(),
		name: z.string(),
		parentId: z.string().nullable(),
		path: z.string(),
		code: z.string().nullable(),
		address: z.string().nullable(),
		notes: z.string().nullable(),
		latitude: z.number().nullable(),
		longitude: z.number().nullable()
	})
);

const locationResponse = z.object({ data: locationSchema });

function toWire(entry: LocationEntry): z.input<typeof locationSchema> {
	return {
		id: entry.id,
		name: entry.name,
		parentId: entry.parentId,
		path: entry.path,
		code: entry.code,
		address: entry.address,
		notes: entry.notes,
		latitude: entry.latitude,
		longitude: entry.longitude
	};
}

/** The writable fields. Coordinates are numbers on the wire: there is no decimal comma to parse. */
const fields = {
	name: z.string(),
	parentId: z.string().nullable(),
	code: z.string().nullable(),
	address: z.string().nullable(),
	notes: z.string().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable()
};

const id = z.string().min(1);

async function find(organisationId: string, locationId: string): Promise<LocationEntry> {
	const entry = (await listLocations(organisationId)).find((item) => item.id === locationId);
	if (!entry) throw notFound('Location not found.');
	return entry;
}

const COORDINATES_PAIR = 'Latitude and longitude must be given together.';

/** The shared rules (`locationInput`) applied to what the caller sent; their issues are the `400`. */
function validated(values: Record<string, unknown>): LocationInput {
	const parsed = locationInput.safeParse(values);
	if (parsed.success) return parsed.data;
	throw new ApiError(
		400,
		'invalid_input',
		'The request is not valid.',
		parsed.error.issues.map((issue) => ({
			path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
			message: issue.message === 'coordinates_pair' ? COORDINATES_PAIR : issue.message
		}))
	);
}

/**
 * A domain failure as the envelope's refusal. `parent_not_found` and `cycle`
 * name a value in the body, so they are a `400` on `parentId`; they are mapped
 * before `refusal()`, which would turn any `*_not_found` into a `404`.
 */
function locationRefusal(failure: string): ApiError {
	if (failure === 'parent_not_found') {
		return new ApiError(400, 'invalid_input', 'The request is not valid.', [
			{ path: ['parentId'], message: 'Parent location not found.' }
		]);
	}
	if (failure === 'cycle') {
		return new ApiError(400, 'invalid_input', 'The request is not valid.', [
			{ path: ['parentId'], message: 'A location cannot sit below itself.' }
		]);
	}
	if (failure === 'not_found') return notFound('Location not found.');
	if (failure === 'duplicate_name') {
		return conflict(failure, 'A sibling location already has this name.');
	}
	if (failure === 'duplicate_code') {
		return conflict(failure, 'Another location already has this code.');
	}
	return refusal(failure);
}

export const listLocationsEndpoint = defineEndpoint({
	id: 'locations.list',
	method: 'GET',
	path: '/locations',
	summary: 'List every location, ordered by path.',
	description:
		'Returns the whole locations catalogue: sites, buildings and rooms, tree-ordered (a location is followed by its sub-locations, siblings alphabetically). Each item carries its `path`, such as `Barcelona office › Floor 1`. The list is not paginated: it is a catalogue, not a record list.',
	permissions: VIEW,
	input: z.object({}),
	output: z.object({ data: z.array(locationSchema) }),
	handler: async ({ principal }) => ({
		data: (await listLocations(principal.organisationId)).map(toWire)
	})
});

export const getLocationEndpoint = defineEndpoint({
	id: 'locations.get',
	method: 'GET',
	path: '/locations/{id}',
	summary: 'Get one location by its id.',
	description:
		'Returns one location with its `path`. An id from another organisation is answered with `404`, the same as one that does not exist.',
	permissions: VIEW,
	input: z.object({ id }),
	output: locationResponse,
	handler: async ({ principal, input }) => ({
		data: toWire(await find(principal.organisationId, input.id))
	})
});

export const createLocationEndpoint = defineEndpoint({
	id: 'locations.create',
	method: 'POST',
	path: '/locations',
	summary: 'Create a location.',
	description:
		'Creates a site, building or room. Give `parentId` to place it below another location; leave it out for a root. `latitude` and `longitude` are numbers and are given together or not at all. Sibling names are unique, and so are codes. Answers `201` with the new location and its address in `Location`.',
	example: {
		name: 'Floor 1',
		parentId: '0b7f6e4c-5a1d-4c53-9d0e-6d2f4b1a8e90',
		code: 'BCN-1',
		address: null,
		notes: 'Open space and meeting rooms',
		latitude: 41.3874,
		longitude: 2.1686
	},
	status: 201,
	permissions: MANAGE,
	input: z.object({
		name: fields.name,
		parentId: fields.parentId.optional(),
		code: fields.code.optional(),
		address: fields.address.optional(),
		notes: fields.notes.optional(),
		latitude: fields.latitude.optional(),
		longitude: fields.longitude.optional()
	}),
	output: locationResponse,
	handler: async ({ principal, input }) => {
		const outcome = await createLocation(principal, validated(input));
		if (!outcome.ok) throw locationRefusal(outcome.error);

		const entry = await find(principal.organisationId, outcome.value.id);
		return created({ data: toWire(entry) }, `/locations/${entry.id}`);
	}
});

export const updateLocationEndpoint = defineEndpoint({
	id: 'locations.update',
	method: 'PATCH',
	path: '/locations/{id}',
	summary: 'Change a location.',
	description:
		'Changes only the fields the body names: an absent field is left as it is, and `null` clears an optional one (`code`, `address`, `notes`, and the coordinates, which clear together). `parentId: null` moves the location to the root. `name` cannot be `null`. A location cannot be moved below itself or below one of its own sub-locations.',
	example: { code: 'BCN-1', address: null },
	permissions: MANAGE,
	input: z.object({
		id,
		name: fields.name.optional(),
		parentId: fields.parentId.optional(),
		code: fields.code.optional(),
		address: fields.address.optional(),
		notes: fields.notes.optional(),
		latitude: fields.latitude.optional(),
		longitude: fields.longitude.optional()
	}),
	output: locationResponse,
	handler: async ({ principal, input }) => {
		const { id: locationId, ...patch } = input;
		const current = await find(principal.organisationId, locationId);

		const sent = Object.fromEntries(
			Object.entries(patch).filter(([, value]) => value !== undefined)
		);
		const merged = validated({
			name: current.name,
			parentId: current.parentId,
			code: current.code,
			address: current.address,
			notes: current.notes,
			latitude: current.latitude,
			longitude: current.longitude,
			...sent
		});

		const outcome = await updateLocation(principal, locationId, merged);
		if (!outcome.ok) throw locationRefusal(outcome.error);

		return { data: toWire(await find(principal.organisationId, locationId)) };
	}
});

export const deleteLocationEndpoint = defineEndpoint({
	id: 'locations.delete',
	method: 'DELETE',
	path: '/locations/{id}',
	summary: 'Delete a location.',
	description:
		'Deletes a location that nothing points at. A location with sub-locations or assets is not deleted: the answer is `409 in_use`, and `error.details` carries the `children` and `assets` that block it. People placed there are not blockers; they lose the location.',
	permissions: MANAGE,
	input: z.object({ id }),
	output: z.null(),
	handler: async ({ principal, input }) => {
		const outcome = await deleteLocation(principal, input.id);
		if (outcome.ok) return noContent();
		if (outcome.error !== 'in_use') throw locationRefusal(outcome.error);

		// Two domains, composed here: neither imports the other's tables.
		const [children, assets] = await Promise.all([
			countLocationChildren(principal.organisationId, input.id),
			countAssetsByLocation(principal.organisationId).then((counts) => counts.get(input.id) ?? 0)
		]);
		throw new ApiError(
			409,
			'in_use',
			'The location still has sub-locations or assets.',
			undefined,
			{ children, assets }
		);
	}
});

export const LOCATION_ENDPOINTS: readonly Endpoint[] = [
	listLocationsEndpoint,
	getLocationEndpoint,
	createLocationEndpoint,
	updateLocationEndpoint,
	deleteLocationEndpoint
];
