import type { AssetState } from '#lib/domain/status.js';

/**
 * What the development seed will create, as plain data.
 *
 * Pure on purpose: no database, no clock, no `Math.random`. A seed that is
 * deterministic only because it happens to run on a clean database is not
 * deterministic, and "the same asset tags twice in a row" (#7) is only a
 * property of the *plan* — applying it is a separate, idempotent step.
 */

export interface PlannedModel {
	name: string;
	manufacturer: string;
	category: string;
}

export interface PlannedPerson {
	fullName: string;
	email: string;
}

export interface PlannedAsset {
	assetTag: string;
	name: string;
	serial: string | null;
	/** Index into `models`. */
	model: number;
	/** What the asset is registered as, before any event below changes it. */
	state: AssetState;
	shared: boolean;
	location: string | null;
	/**
	 * What happens to it after it is registered, in order, so the timeline has
	 * something to show. Each step is an event the domain would record.
	 */
	events: PlannedEvent[];
}

export type PlannedEvent =
	| { kind: 'assign'; personEmail: string }
	| { kind: 'return' }
	| { kind: 'state'; to: AssetState }
	| { kind: 'move'; location: string | null }
	| { kind: 'note'; text: string };

export interface InventoryPlan {
	manufacturers: string[];
	categories: string[];
	models: PlannedModel[];
	locations: string[];
	people: PlannedPerson[];
	assets: PlannedAsset[];
}

export const DEFAULT_SEED = 20_260_101;
export const DEFAULT_ASSET_COUNT = 200;

/**
 * mulberry32: a few lines, a full 32-bit period, and — the property that
 * matters — the same sequence for the same seed on every machine and Node
 * version, which `Math.random` does not offer at all.
 */
function generator(seed: number) {
	let state = seed >>> 0;

	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};

	return {
		next,
		chance: (probability: number) => next() < probability,
		pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
		weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
			const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
			let remaining = next() * total;
			for (const [value, weight] of entries) {
				remaining -= weight;
				if (remaining < 0) return value;
			}
			return entries[entries.length - 1][0];
		}
	};
}

const MANUFACTURERS = ['Apple', 'Dell', 'Lenovo', 'HP', 'Logitech', 'Samsung'];
const CATEGORIES = ['Laptops', 'Monitors', 'Phones', 'Peripherals', 'Printers'];

/**
 * "MacBook Pró" carries an accent on purpose. The acceptance criterion for
 * search is that an unaccented `macbook pro` finds it, and a seed made only of
 * plain ASCII could never show that working.
 */
const MODELS: PlannedModel[] = [
	{ name: 'MacBook Pró 14', manufacturer: 'Apple', category: 'Laptops' },
	{ name: 'MacBook Air 13', manufacturer: 'Apple', category: 'Laptops' },
	{ name: 'iPhone 15', manufacturer: 'Apple', category: 'Phones' },
	{ name: 'Latitude 7440', manufacturer: 'Dell', category: 'Laptops' },
	{ name: 'UltraSharp U2723QE', manufacturer: 'Dell', category: 'Monitors' },
	{ name: 'ThinkPad T14', manufacturer: 'Lenovo', category: 'Laptops' },
	{ name: 'ThinkVision P27', manufacturer: 'Lenovo', category: 'Monitors' },
	{ name: 'EliteBook 840', manufacturer: 'HP', category: 'Laptops' },
	{ name: 'LaserJet Pro 4002', manufacturer: 'HP', category: 'Printers' },
	{ name: 'MX Master 3S', manufacturer: 'Logitech', category: 'Peripherals' },
	{ name: 'MX Keys', manufacturer: 'Logitech', category: 'Peripherals' },
	{ name: 'Galaxy S24', manufacturer: 'Samsung', category: 'Phones' },
	{ name: 'Odyssey G5', manufacturer: 'Samsung', category: 'Monitors' }
];

const LOCATIONS = ['Barcelona office', 'Girona office', 'Warehouse', 'Remote'];

const NAMES = [
	'Ada Lovelace',
	'Alan Turing',
	'Grace Hopper',
	'Edsger Dijkstra',
	'Barbara Liskov',
	'Donald Knuth',
	'Margaret Hamilton',
	'Dennis Ritchie',
	'Radia Perlman',
	'Linus Torvalds',
	'Frances Allen',
	'Ken Thompson',
	'Joan Clarke',
	'Tim Berners-Lee',
	'Katherine Johnson',
	'Brian Kernighan',
	'Hedy Lamarr',
	'Leslie Lamport',
	'Anita Borg',
	'Guido van Rossum',
	'Sophie Wilson',
	'Bjarne Stroustrup',
	'Mary Allen Wilkes',
	'Niklaus Wirth',
	// The two people who get a credential (see `DEMO_ACCOUNTS`). They are in the
	// ordinary pool so they hold assets like anybody else, which is the whole
	// point of signing in as the employee: seeing equipment that is theirs.
	'Tom Technician',
	'Eva Employee'
];

/** The seeded people who can sign in, besides the administrator. */
export const DEMO_ACCOUNTS = [
	{ fullName: 'Tom Technician', role: 'technician' },
	{ fullName: 'Eva Employee', role: 'employee' }
] as const;

const NOTES = [
	'Annual check done: no faults found.',
	'Battery replaced under warranty.',
	'Screen cleaned and re-imaged.',
	'Charger lost; replacement issued.',
	'Moved with the rest of the team.'
];

/** `Ada Lovelace` → `ada.lovelace@acme.test`: stable, ASCII, unique per name. */
export function emailFor(fullName: string): string {
	return `${fullName
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '.')
		.replace(/^\.|\.$/g, '')}@acme.test`;
}

export function assetTagFor(index: number): string {
	return `AST-${String(index).padStart(4, '0')}`;
}

export function buildPlan(count = DEFAULT_ASSET_COUNT, seed = DEFAULT_SEED): InventoryPlan {
	const random = generator(seed);
	const people = NAMES.map((fullName) => ({ fullName, email: emailFor(fullName) }));
	const usedSerials = new Set<string>();

	const serial = (): string => {
		// Re-drawn on collision, so uniqueness never depends on luck. The partial
		// unique index would otherwise refuse the second holder of a serial.
		for (;;) {
			const candidate = `SN${Math.floor(random.next() * 36 ** 8)
				.toString(36)
				.toUpperCase()
				.padStart(8, '0')}`;
			if (!usedSerials.has(candidate)) {
				usedSerials.add(candidate);
				return candidate;
			}
		}
	};

	const assets: PlannedAsset[] = [];

	for (let index = 1; index <= count; index += 1) {
		// Every draw below happens for every asset, whether or not its result is
		// used. Branching the *draws* (rather than only the use) would make
		// asset 40 depend on what asset 39 happened to roll, and a change to one
		// probability would reshuffle the whole inventory.
		const modelIndex = random.weighted(MODELS.map((_, position) => [position, 1] as const));
		const model = MODELS[modelIndex];
		const finalState = random.weighted<AssetState>([
			['in_use', 55],
			['in_stock', 25],
			['in_repair', 8],
			['retired', 12]
		]);
		const hasSerial = random.chance(0.85);
		const generatedSerial = serial();
		const location = random.chance(0.85) ? random.pick(LOCATIONS) : null;
		const holder = random.pick(people);
		const nextHolder = random.pick(people);
		const handedOver = random.chance(0.15);
		const noted = random.chance(0.1);
		const inDrawer = random.chance(0.05);
		const note = random.pick(NOTES);
		const relocates = random.chance(0.12);
		const newLocation = random.pick(LOCATIONS);
		const stagedViaStock = random.chance(0.6);

		// The floor printers are the shared assets: nobody holds them, everybody
		// needs to name them on a ticket — the case `assets.view.shared` exists for.
		const shared = model.category === 'Printers';

		// An asset can sit `in_stock` in somebody's drawer, and be `in_use` with
		// nobody holding it (the floor printer): the two axes do not constrain
		// each other, and the seed should show both.
		const holdsIt =
			!shared &&
			(finalState === 'in_use' ||
				(finalState === 'in_repair' && handedOver) ||
				(finalState === 'in_stock' && inDrawer));

		const events: PlannedEvent[] = [];

		if (holdsIt && handedOver) {
			// Held by one person, taken back, then handed to someone else: a custody
			// history with a past worth showing.
			events.push({ kind: 'assign', personEmail: holder.email });
			events.push({ kind: 'return' });
			events.push({ kind: 'assign', personEmail: nextHolder.email });
		} else if (holdsIt) {
			events.push({ kind: 'assign', personEmail: holder.email });
		}

		if (finalState !== 'in_stock' && stagedViaStock) {
			events.push({ kind: 'state', to: finalState });
		}

		if (relocates && location !== null) events.push({ kind: 'move', location: newLocation });
		if (noted) events.push({ kind: 'note', text: note });

		assets.push({
			assetTag: assetTagFor(index),
			name: model.name,
			serial: hasSerial && !shared ? generatedSerial : null,
			model: modelIndex,
			// An asset staged through stock is registered `in_stock` and changed
			// afterwards, leaving a `state.changed` entry; the others are registered
			// in their final state, which is not an event.
			state: finalState !== 'in_stock' && stagedViaStock ? 'in_stock' : finalState,
			shared,
			location,
			events
		});
	}

	return {
		manufacturers: MANUFACTURERS,
		categories: CATEGORIES,
		models: MODELS,
		locations: LOCATIONS,
		people,
		assets
	};
}
