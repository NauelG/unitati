import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { refusalFrom } from '../db/testing/refusal';
import { assets } from '../assets/schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson
} from '../assets/testing/fixtures';
import { activity } from './schema';
import { recordActivity } from './writer';
import { listActivity } from './reader';
import { ACTIVITY_TARGETS, ACTIVITY_VERBS } from './verbs';

/**
 * The integrity ADR 0009 calls non-negotiable, proved rather than asserted.
 *
 * The harness truncates instead of rolling back precisely so these tests mean
 * something: a `CHECK` is evaluated on write and a rolled-back transaction
 * would exercise it, but a deferred constraint or a cascade would not, and a
 * harness that hides what a spec exists to prove is a harness that lies.
 */

async function scenario() {
	const organisation = await createOrganisation();
	const { modelId } = await createCatalogue(organisation.id);
	const asset = await createAsset(organisation.id, modelId, { assetTag: 'AST-0001' });
	const person = await createPerson(organisation.id, 'Ada Lovelace');

	return { organisation, asset, person };
}

describe('the exactly-one-target CHECK', () => {
	it('accepts a row with exactly one target', async () => {
		const { organisation, asset } = await scenario();

		const refusal = await refusalFrom(
			getDb()
				.insert(activity)
				.values({
					organisationId: organisation.id,
					verb: 'asset.created',
					payload: { assetTag: 'AST-0001', name: 'A laptop' },
					assetId: asset.id
				})
		);

		expect(refusal).toBeNull();
	});

	it('refuses a row with no target at all', async () => {
		const { organisation } = await scenario();

		const refusal = await refusalFrom(
			getDb()
				.insert(activity)
				.values({
					organisationId: organisation.id,
					verb: 'note.added',
					payload: { text: 'An orphan entry' }
				})
		);

		expect(refusal).toEqual({ code: '23514', constraint: 'activity_exactly_one_target' });
	});

	it('refuses a row with two targets', async () => {
		const { organisation, asset, person } = await scenario();

		const refusal = await refusalFrom(
			getDb()
				.insert(activity)
				.values({
					organisationId: organisation.id,
					verb: 'note.added',
					payload: { text: 'Pointing at two things' },
					assetId: asset.id,
					personId: person.id
				})
		);

		expect(refusal).toEqual({ code: '23514', constraint: 'activity_exactly_one_target' });
	});

	/**
	 * The columns #8 and #10 will attach their tables to still count towards the
	 * constraint today, so an entry about a ticket is already well-formed before
	 * the ticket table exists.
	 */
	it('counts a target that has no foreign key yet', async () => {
		const { organisation } = await scenario();

		const refusal = await refusalFrom(
			getDb()
				.insert(activity)
				.values({
					organisationId: organisation.id,
					verb: 'note.added',
					payload: { text: 'About a ticket' },
					ticketId: crypto.randomUUID()
				})
		);

		expect(refusal).toBeNull();
	});

	/** Every target column named in `verbs.ts` must satisfy the constraint alone. */
	it('accepts each of the five targets on its own', async () => {
		const { organisation, asset, person } = await scenario();
		const ids: Record<string, string> = {
			assetId: asset.id,
			personId: person.id,
			ticketId: crypto.randomUUID(),
			taskId: crypto.randomUUID(),
			projectId: crypto.randomUUID()
		};

		const refusals = await Promise.all(
			ACTIVITY_TARGETS.map((column) =>
				refusalFrom(
					getDb()
						.insert(activity)
						.values({
							organisationId: organisation.id,
							verb: 'note.added',
							payload: { text: `About ${column}` },
							[column]: ids[column]
						})
				)
			)
		);

		expect(refusals).toEqual(ACTIVITY_TARGETS.map(() => null));
	});
});

describe('referential integrity', () => {
	it('refuses history attached to an asset that does not exist', async () => {
		const { organisation } = await scenario();

		const refusal = await refusalFrom(
			getDb()
				.insert(activity)
				.values({
					organisationId: organisation.id,
					verb: 'note.added',
					payload: { text: 'About nothing' },
					assetId: crypto.randomUUID()
				})
		);

		expect(refusal?.code).toBe('23503');
	});

	/** The foreign key is why this table waited for #7 rather than shipping with
	 * the contract in PR 1: added later, it would have left a window in which an
	 * orphan entry was storable. */
	it('removes an asset’s history with the asset', async () => {
		const { organisation, asset } = await scenario();
		await getDb()
			.insert(activity)
			.values({
				organisationId: organisation.id,
				verb: 'note.added',
				payload: { text: 'Keyboard replaced under warranty' },
				assetId: asset.id
			});

		await getDb().delete(assets).where(eq(assets.id, asset.id));

		const left = await getDb()
			.select({ id: activity.id })
			.from(activity)
			.where(eq(activity.organisationId, organisation.id));

		expect(left).toEqual([]);
	});
});

describe('recordActivity', () => {
	it('writes an entry a domain asked for', async () => {
		const { organisation, asset, person } = await scenario();

		await getDb().transaction((tx) =>
			recordActivity(tx, {
				organisationId: organisation.id,
				actorPersonId: person.id,
				target: { assetId: asset.id },
				verb: 'custody.assigned',
				payload: { toPersonId: person.id, toPersonName: 'Ada Lovelace' }
			})
		);

		const entries = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});

		expect(entries).toEqual([
			expect.objectContaining({
				verb: 'custody.assigned',
				payload: { toPersonId: person.id, toPersonName: 'Ada Lovelace' },
				actorName: 'Ada Lovelace'
			})
		]);
	});

	/**
	 * `payload` is `jsonb` and would take any shape. The Zod gate in
	 * `recordActivity` is the only thing that makes the TypeScript union a
	 * guarantee about what is in the column rather than about what the code
	 * believes is in it.
	 */
	it('refuses a payload that does not match its verb', async () => {
		const { organisation, asset } = await scenario();

		const write = getDb().transaction((tx) =>
			recordActivity(tx, {
				organisationId: organisation.id,
				target: { assetId: asset.id },
				verb: 'state.changed',
				// `to` is missing, and `from` is not one of the four states.
				payload: { from: 'on_fire' } as never
			})
		);

		await expect(write).rejects.toThrow();
	});

	it('stores nothing when the payload is refused', async () => {
		const { organisation, asset } = await scenario();

		await getDb()
			.transaction((tx) =>
				recordActivity(tx, {
					organisationId: organisation.id,
					target: { assetId: asset.id },
					verb: 'note.added',
					payload: { text: '' } as never
				})
			)
			.catch(() => undefined);

		const entries = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});

		expect(entries).toEqual([]);
	});

	/**
	 * ADR 0009's central claim: an action and its history commit together. If the
	 * action fails after the entry is written, the entry must go with it —
	 * otherwise the log records something that did not happen.
	 */
	it('rolls the entry back with the transaction that wrote it', async () => {
		const { organisation, asset } = await scenario();

		await getDb()
			.transaction(async (tx) => {
				await recordActivity(tx, {
					organisationId: organisation.id,
					target: { assetId: asset.id },
					verb: 'state.changed',
					payload: { from: 'in_stock', to: 'in_repair' }
				});

				throw new Error('the action failed after its history was written');
			})
			.catch(() => undefined);

		const entries = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});

		expect(entries).toEqual([]);
	});

	it('writes no actor when the system acted', async () => {
		const { organisation, asset } = await scenario();

		await getDb().transaction((tx) =>
			recordActivity(tx, {
				organisationId: organisation.id,
				actorPersonId: null,
				target: { assetId: asset.id },
				verb: 'note.added',
				payload: { text: 'Retired automatically after 5 years' }
			})
		);

		const [entry] = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});

		expect({ actorPersonId: entry.actorPersonId, actorName: entry.actorName }).toEqual({
			actorPersonId: null,
			actorName: null
		});
	});
});

describe('the verb enum', () => {
	/**
	 * The Postgres enum is built *from* `ACTIVITY_VERBS`, so this is really a
	 * test that the two cannot drift: a verb added to the list and not to the
	 * database would fail here, and one added to the database and not to the list
	 * cannot happen, because the migration is generated from the list.
	 */
	it('holds exactly the verbs the vocabulary declares', async () => {
		const stored = await getDb().execute<{ value: string }>(
			sql`select unnest(enum_range(null::activity_verb))::text as value`
		);

		const values = [...stored].map((row) => row.value).sort();

		expect(values).toEqual([...ACTIVITY_VERBS].sort());
	});
});

describe('listActivity', () => {
	it('returns newest first', async () => {
		const { organisation, asset } = await scenario();
		const at = (iso: string) => new Date(iso);

		await getDb().transaction(async (tx) => {
			await recordActivity(tx, {
				organisationId: organisation.id,
				target: { assetId: asset.id },
				verb: 'note.added',
				payload: { text: 'first' },
				occurredAt: at('2026-01-01T10:00:00Z')
			});
			await recordActivity(tx, {
				organisationId: organisation.id,
				target: { assetId: asset.id },
				verb: 'note.added',
				payload: { text: 'second' },
				occurredAt: at('2026-01-02T10:00:00Z')
			});
		});

		const entries = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});

		expect(entries.map((entry) => (entry.verb === 'note.added' ? entry.payload.text : ''))).toEqual(
			['second', 'first']
		);
	});

	it('does not return another organisation’s entries', async () => {
		const { organisation, asset } = await scenario();
		const globex = await createOrganisation('Globex', 'globex');

		await getDb()
			.insert(activity)
			.values({
				organisationId: organisation.id,
				verb: 'note.added',
				payload: { text: 'Acme’s note' },
				assetId: asset.id
			});

		const entries = await listActivity({
			organisationId: globex.id,
			target: { assetId: asset.id }
		});

		expect(entries).toEqual([]);
	});
});
