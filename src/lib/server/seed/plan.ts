import type { AssetState, StateGroup } from '#lib/domain/status.js';

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

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export interface PlannedTask {
	title: string;
	description: string | null;
	/** `YYYY-MM-DD`. */
	dueDate: string | null;
	/**
	 * The group the task ends up in, never a state's name: the catalogue is the
	 * organisation's to rename. Apply resolves it to the group's first state.
	 */
	group: StateGroup;
	assigneeEmails: string[];
}

export interface PlannedProject {
	name: string;
	description: string | null;
	ownerEmail: string | null;
	dueDate: string | null;
	/** Archived once its tasks exist: an archived project accepts no writes. */
	archived: boolean;
	tasks: PlannedTask[];
}

export interface ProjectsPlan {
	projects: PlannedProject[];
}

/**
 * Three projects with a deliberate spread: every state group holds a task, one
 * task has three assignees, exactly one is the seeded employee's, owners and
 * dates are mixed with nulls, and one project is archived. Static data rather
 * than draws, so there is nothing for a change elsewhere in this file to
 * reshuffle.
 */
export function buildProjectsPlan(): ProjectsPlan {
	const tom = emailFor('Tom Technician');
	const eva = emailFor('Eva Employee');
	const ada = emailFor('Ada Lovelace');
	const alan = emailFor('Alan Turing');
	const grace = emailFor('Grace Hopper');

	return {
		projects: [
			{
				name: 'Mudanza a la nueva oficina',
				description:
					'Trasladar el equipo y los puestos de trabajo a la planta 3 antes de fin de año.',
				ownerEmail: tom,
				dueDate: '2026-12-15',
				archived: false,
				tasks: [
					{
						title: 'Pedir cajas y material de embalaje',
						description: null,
						dueDate: null,
						group: 'backlog',
						assigneeEmails: []
					},
					{
						title: 'Reservar el camión de la mudanza',
						description: 'Mejor un sábado, para no parar la actividad.',
						dueDate: '2026-11-20',
						group: 'unstarted',
						assigneeEmails: [eva]
					},
					{
						title: 'Inventariar el mobiliario',
						description: 'Qué se traslada, qué se dona y qué se tira.',
						dueDate: '2026-11-30',
						group: 'started',
						assigneeEmails: [tom, ada, alan]
					},
					{
						title: 'Avisar al proveedor de internet',
						description: null,
						dueDate: null,
						group: 'completed',
						assigneeEmails: [tom]
					},
					{
						title: 'Alquilar un trastero para el archivo',
						description: 'Descartado: el archivo se digitaliza.',
						dueDate: null,
						group: 'cancelled',
						assigneeEmails: []
					}
				]
			},
			{
				name: 'Renovación de portátiles',
				description: null,
				ownerEmail: null,
				dueDate: null,
				archived: false,
				tasks: [
					{
						title: 'Elegir el modelo',
						description: null,
						dueDate: '2026-10-31',
						group: 'completed',
						assigneeEmails: [grace]
					},
					{
						title: 'Pedir presupuesto a dos proveedores',
						description: null,
						dueDate: null,
						group: 'started',
						assigneeEmails: [grace]
					},
					{
						title: 'Planificar el reparto por departamentos',
						description: null,
						dueDate: null,
						group: 'backlog',
						assigneeEmails: []
					}
				]
			},
			{
				name: 'Auditoría de licencias 2025',
				description: 'Revisión anual de licencias de software, cerrada.',
				ownerEmail: grace,
				dueDate: '2026-03-31',
				archived: true,
				tasks: [
					{
						title: 'Cruzar las licencias con los equipos',
						description: null,
						dueDate: '2026-02-28',
						group: 'completed',
						assigneeEmails: [grace, ada]
					},
					{
						title: 'Dar de baja las licencias sin uso',
						description: null,
						dueDate: null,
						group: 'completed',
						assigneeEmails: [ada]
					}
				]
			}
		]
	};
}

/* -------------------------------------------------------------------------- */
/* Escalations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Where a seeded ticket was escalated to. Tasks and projects are named, never
 * identified: their ids and tags are minted on the day the seed runs.
 */
export type PlannedEscalationTarget =
	/** Creates the task; `key` lets a later entry link to the same one. */
	| {
			kind: 'new_task';
			key: string;
			projectName: string;
			title: string;
			description: string | null;
	  }
	/** The task a `new_task` entry created earlier in this plan. */
	| { kind: 'planned_task'; key: string }
	/** A task the projects plan created. */
	| { kind: 'existing_task'; projectName: string; taskTitle: string }
	| { kind: 'existing_project'; projectName: string };

export interface PlannedEscalation {
	/** The seeded ticket, by subject: its tag comes from a sequence. */
	ticketSubject: string;
	target: PlannedEscalationTarget;
}

export interface EscalationsPlan {
	escalations: PlannedEscalation[];
}

/**
 * One ticket per shape the product has to show: a new task, two more tickets on
 * that same task, an existing project, a `resolved` ticket on a task, and the
 * employee's own ticket on a task **outside their scope** (the requester's
 * restricted view, ADR 0007). Names must match the tickets and projects plans.
 */
export function buildEscalationsPlan(): EscalationsPlan {
	const task = 'Revisar el equipamiento de la planta 2';

	return {
		escalations: [
			{
				ticketSubject: 'El monitor parpadea',
				target: {
					kind: 'new_task',
					key: 'planta-2',
					projectName: 'Renovación de portátiles',
					title: task,
					description: 'Parpadeos, impresora y ratones: todo lo de la planta 2 de una vez.'
				}
			},
			{
				ticketSubject: 'La impresora de la planta 2 no imprime',
				target: { kind: 'planned_task', key: 'planta-2' }
			},
			{ ticketSubject: 'El ratón va a saltos', target: { kind: 'planned_task', key: 'planta-2' } },
			{
				ticketSubject: 'No puedo conectarme a la VPN desde casa',
				target: { kind: 'existing_project', projectName: 'Mudanza a la nueva oficina' }
			},
			{
				ticketSubject: 'Necesito Office en el portátil nuevo',
				target: {
					kind: 'existing_task',
					projectName: 'Renovación de portátiles',
					taskTitle: 'Pedir presupuesto a dos proveedores'
				}
			},
			{
				// Eva is on "Reservar el camión", not on this task, so for her it is out of scope.
				ticketSubject: 'Quiero cambiar mi puesto de sitio',
				target: {
					kind: 'existing_task',
					projectName: 'Mudanza a la nueva oficina',
					taskTitle: 'Inventariar el mobiliario'
				}
			}
		]
	};
}
