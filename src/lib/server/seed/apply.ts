import { getDb } from '../db';
import {
	addNote,
	assignCustody,
	changeLocation,
	changeState,
	createAssetModel,
	createCategory,
	createManufacturer,
	listAssetModels,
	listCategories,
	listManufacturers,
	registerAsset,
	returnCustody
} from '../assets';
import type { SessionUser } from '../auth/guards';
import { listLocations, listPeople, locations, people } from '../directory';
import type { InventoryPlan } from './plan';

/**
 * Applies a plan through the domain's own functions rather than by inserting
 * rows, so the history a seeded asset shows is the history the app would have
 * written: `asset.created`, `custody.assigned`, `state.changed` — with the
 * same snapshots and the same transactions. A seed that bypassed them would
 * demo a timeline no real action could produce.
 *
 * **Idempotent by tag.** Every asset is registered with its explicit tag, so a
 * second run is refused by the unique index (`duplicate_asset_tag`) and that
 * asset — events included — is skipped. The catalogue, locations and people use
 * "already exists" the same way. Running it twice leaves what the first run
 * left, which is what "the same asset tags twice in a row" means.
 */

export interface ApplySummary {
	registered: number;
	skipped: number;
	/** Skipped for a reason other than "already seeded": worth reading. */
	refused: string[];
}

export async function applyPlan(actor: SessionUser, plan: InventoryPlan): Promise<ApplySummary> {
	const organisationId = actor.organisationId;

	for (const name of plan.manufacturers) await createManufacturer(actor, { name });
	for (const name of plan.categories) await createCategory(actor, { name });

	const manufacturerIds = new Map(
		(await listManufacturers(organisationId)).map((e) => [e.name, e.id])
	);
	const categoryIds = new Map((await listCategories(organisationId)).map((e) => [e.name, e.id]));

	for (const model of plan.models) {
		await createAssetModel(actor, {
			name: model.name,
			manufacturerId: manufacturerIds.get(model.manufacturer)!,
			categoryId: categoryIds.get(model.category)!
		});
	}

	const modelIds = new Map(
		(await listAssetModels(organisationId)).map((e) => [`${e.manufacturerName}/${e.name}`, e.id])
	);

	await getDb()
		.insert(locations)
		.values(plan.locations.map((name) => ({ organisationId, name })))
		.onConflictDoNothing();
	const locationIds = new Map((await listLocations(organisationId)).map((e) => [e.name, e.id]));

	await getDb()
		.insert(people)
		.values(plan.people.map((person) => ({ organisationId, ...person })))
		.onConflictDoNothing();
	const personIds = new Map((await listPeople(organisationId)).map((e) => [e.email, e.id]));

	const locationId = (name: string | null) =>
		name === null ? null : (locationIds.get(name) ?? null);
	const summary: ApplySummary = { registered: 0, skipped: 0, refused: [] };

	for (const planned of plan.assets) {
		const model = plan.models[planned.model];

		const registered = await registerAsset(actor, {
			assetTag: planned.assetTag,
			name: planned.name,
			serial: planned.serial,
			assetModelId: modelIds.get(`${model.manufacturer}/${model.name}`)!,
			state: planned.state,
			shared: planned.shared,
			locationId: locationId(planned.location)
		});

		if (!registered.ok) {
			summary.skipped += 1;
			// A tag already present is the expected second run. Anything else — a
			// serial that collides with a real asset — deserves a line of output.
			if (registered.error !== 'duplicate_asset_tag') {
				summary.refused.push(`${planned.assetTag}: ${registered.error}`);
			}
			continue;
		}

		summary.registered += 1;
		const { id } = registered.value;

		for (const event of planned.events) {
			switch (event.kind) {
				case 'assign':
					await assignCustody(actor, id, personIds.get(event.personEmail)!);
					break;
				case 'return':
					await returnCustody(actor, id);
					break;
				case 'state':
					await changeState(actor, id, event.to);
					break;
				case 'move':
					await changeLocation(actor, id, locationId(event.location));
					break;
				case 'note':
					await addNote(actor, id, event.text);
					break;
			}
		}
	}

	return summary;
}
