// @ts-check
// Module boundaries for the server graph, enforced over the RESOLVED import
// graph (relative, `#lib/…` and extension-mapped `.js` → `.ts` imports alike).
// The decision, the module classes and the baseline policy live in
// docs/adr/0048-module-boundaries-enforced-by-dependency-cruiser.md.
//
// Every rule is `error` and counts `import type` edges, except where it says
// otherwise (`no-circular`, `routes-no-db`).
//
// KNOWN VIOLATIONS live in `.dependency-cruiser-known-violations.json`
// (`npm run lint:boundaries` passes `--ignore-known`). A baseline entry is
// never added without a justification in the pull request. Groups (6):
//
//   B. `no-circular`, 1 entry: DataTable.svelte <-> DataTableSkeleton.svelte.
//      The skeleton reads `dataTable` (the tv() variants) from the table's
//      module script. Move the variants to a shared file to remove it.
//   C. `public-entry-across-modules`, 3 entries: assets/handover-documents,
//      assets/handover-list and knowledge/authors import `serviceAccountName`
//      from api/service-accounts. Going through api/index closes a runtime
//      cycle (api/index -> dispatch -> endpoints -> assets|knowledge). Removed
//      when api stops being imported by the domains it serves.
//   E. `tables-from-module`, 2 entries: seed/apply.ts and seed/tickets.ts read
//      the `tickets` table (idempotency check by subject, count). No
//      service-desk function answers either question; adding them is a
//      service-desk change of its own.
//
// Module classes (ADR 0048):
//   business:       assets, service-desk, projects, knowledge, links, directory,
//                   activity, notifications, imports, search, api, seed, screens
//   infrastructure: auth, access, db, shared, settings
//   root files of src/lib/server/ (subscriptions.ts, ports.ts) are composition code and
//   follow the rules for code outside a module.

const SERVER = '^src/lib/server';

const BUSINESS = [
	'assets',
	'service-desk',
	'projects',
	'knowledge',
	'links',
	'directory',
	'activity',
	'notifications',
	'imports',
	'search',
	'api',
	'seed',
	'screens'
];
const INFRASTRUCTURE = ['auth', 'access', 'db', 'shared', 'settings'];

/** Business modules that own a `schema.ts` and are not open to everybody. */
const TABLE_OWNERS = [
	'assets',
	'service-desk',
	'projects',
	'knowledge',
	'links',
	'activity',
	'notifications',
	'api'
];

const alt = (/** @type {string[]} */ names) => `(?:${names.join('|')})`;
const BIZ = alt(BUSINESS);
const OWNERS = alt(TABLE_OWNERS);

/** A spec, or a fixture folder: the files rule 6 lets reach into other modules. */
const SPEC_OR_TESTING = '\\.spec\\.ts$|/testing/';

/** `<module>/index.ts` and `<module>/schema.ts`, the two public files of a business module. */
const PUBLIC_FILES = `${SERVER}/${BIZ}/(?:index|schema)\\.ts$`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		// ---------------------------------------------------------------- 1 --
		{
			name: 'public-entry-from-outside',
			comment:
				'ADR 0002, ADR 0048 rule 1: code outside a module imports only its index.ts (and schema.ts, judged by the tables rules). Any root file of an infrastructure module is public; its subfolders are not. Specs and testing/ folders may also use a testing/ folder (rule 6).',
			severity: 'error',
			from: { pathNot: [`${SERVER}/[^/]+/`] },
			to: {
				path: `${SERVER}/(?:${BIZ}/|${alt(INFRASTRUCTURE)}/[^/]+/)`,
				pathNot: [PUBLIC_FILES, '/testing/']
			}
		},
		{
			name: 'public-entry-across-modules',
			comment:
				'ADR 0002, ADR 0048 rule 1: a module reaches another module only through its index.ts (and schema.ts, judged by the tables rules); its own files import each other freely.',
			severity: 'error',
			from: { path: `${SERVER}/([^/]+)/` },
			to: {
				path: `${SERVER}/(?:${BIZ}/|${alt(INFRASTRUCTURE)}/[^/]+/)`,
				pathNot: [PUBLIC_FILES, '/testing/', `${SERVER}/$1/`]
			}
		},

		// ---------------------------------------------------------------- 2 --
		{
			name: 'tables-from-module',
			comment:
				"ADR 0002 rule 3, ADR 0009, ADR 0040, ADR 0048 rule 2: a module's tables are imported from its own module, from another schema.ts (foreign keys), from db/schema.ts, and from activity and notifications (the records they point at). directory/schema.ts and auth/schema.ts are the shared kernel, open to every server module.",
			severity: 'error',
			from: {
				path: `${SERVER}/([^/]+)/`,
				pathNot: ['/schema\\.ts$', `${SERVER}/(?:activity|notifications)/`, SPEC_OR_TESTING]
			},
			to: { path: `${SERVER}/${OWNERS}/schema\\.ts$`, pathNot: `${SERVER}/$1/` }
		},
		{
			name: 'tables-from-outside',
			comment:
				'ADR 0002 rule 3, ADR 0048 rule 2: code outside a module (routes, hooks, subscriptions.ts, src/lib) never imports a module\u2019s tables.',
			severity: 'error',
			from: { pathNot: [`${SERVER}/[^/]+/`, SPEC_OR_TESTING] },
			to: { path: `${SERVER}/${OWNERS}/schema\\.ts$` }
		},

		// ---------------------------------------------------------------- 3 --
		{
			name: 'barrel-carries-no-tables',
			comment:
				"ADR 0002 rule 3, ADR 0048 rule 3: a business module's index.ts does not re-export its tables, enums or sequences as values (`export { t } from './schema'`, `export * from './schema'`). Row types (`export type`) stay. A consumer that needs a table imports <module>/schema and is judged by the tables rules.",
			severity: 'error',
			from: { path: `${SERVER}/${BIZ}/index\\.ts$` },
			to: {
				path: `${SERVER}/${BIZ}/schema\\.ts$`,
				dependencyTypes: ['export'],
				dependencyTypesNot: ['type-only']
			}
		},

		// ---------------------------------------------------------------- 4 --
		{
			name: 'direction-projects',
			comment:
				'ADR 0002, ADR 0024, ADR 0048 rule 4: projects does not know that tickets or links exist. What other domains must hear of, it emits through shared/events.ts.',
			severity: 'error',
			from: { path: `${SERVER}/projects/`, pathNot: SPEC_OR_TESTING },
			to: { path: `${SERVER}/(?:links|service-desk)/` }
		},
		{
			name: 'direction-cross-cutting',
			comment:
				"ADR 0009, ADR 0040, ADR 0048 rule 4: activity and notifications read the records they point at through those modules' schema.ts and call none of their functions.",
			severity: 'error',
			from: { path: `${SERVER}/(?:activity|notifications)/`, pathNot: SPEC_OR_TESTING },
			to: {
				path: `${SERVER}/${BIZ}/`,
				pathNot: ['/schema\\.ts$', `${SERVER}/(?:activity|notifications)/`]
			}
		},
		{
			name: 'direction-siblings',
			comment:
				'ADR 0002, ADR 0048 rule 4: assets, service-desk, projects and knowledge do not import each other; what crosses goes through links or shared/events.ts. A schema.ts keeps its foreign keys (rule 2).',
			severity: 'error',
			from: {
				path: `${SERVER}/(assets|service-desk|projects|knowledge)/`,
				pathNot: [SPEC_OR_TESTING, '/schema\\.ts$']
			},
			to: {
				path: `${SERVER}/(?:assets|service-desk|projects|knowledge)/`,
				pathNot: `${SERVER}/$1/`
			}
		},
		{
			name: 'direction-service-desk',
			comment:
				'ADR 0002, ADR 0049, ADR 0048 rule 4: service-desk does not import links; links sits above every domain. What a ticket needs from a relation it declares as a port in service-desk/ports.ts, implemented by links and registered in server/ports.ts. Specs and testing/ folders are integration fixtures nothing imports back.',
			severity: 'error',
			from: { path: `${SERVER}/service-desk/`, pathNot: SPEC_OR_TESTING },
			to: { path: `${SERVER}/links/` }
		},
		{
			name: 'direction-infrastructure',
			comment:
				'ADR 0002, ADR 0048 rule 4: auth, access, db, shared and settings are infrastructure and import no business module, except directory (its index.ts and schema.ts, which everybody may depend on) and db/schema.ts, which aggregates every module\u2019s schema.ts. Specs and testing/ folders follow rule 6 instead. First-run provisioning, which needs several domains, lives in src/lib/server/provisioning.ts (#354).',
			severity: 'error',
			from: {
				path: `${SERVER}/${alt(INFRASTRUCTURE)}/`,
				pathNot: [SPEC_OR_TESTING, `${SERVER}/db/schema\\.ts$`]
			},
			to: {
				path: `${SERVER}/${BIZ}/`,
				pathNot: `${SERVER}/directory/(?:index|schema)\\.ts$`
			}
		},
		{
			name: 'direction-directory',
			comment:
				'ADR 0002, ADR 0048 rule 4: directory is what every domain depends on, so it depends on no business module but activity (it logs its own changes).',
			severity: 'error',
			from: { path: `${SERVER}/directory/`, pathNot: SPEC_OR_TESTING },
			to: { path: `${SERVER}/${BIZ}/`, pathNot: [`${SERVER}/(?:directory|activity)/`] }
		},

		{
			name: 'screens-are-a-leaf',
			comment:
				'ADR 0050 rule 9: screens/ composes the record reads of the app and only app routes import it. No other server module, the API included, depends on it.',
			severity: 'error',
			from: { path: `${SERVER}/`, pathNot: [`${SERVER}/screens/`] },
			to: { path: `${SERVER}/screens/` }
		},

		// ---------------------------------------------------------------- 5 --
		{
			name: 'routes-no-db',
			comment:
				'ADR 0002 rule 1, ADR 0048 rule 5: routes never query the database. Type-only edges are allowed (`import type { Transaction }` queries nothing).',
			severity: 'error',
			from: { path: '^src/routes/', pathNot: '\\.spec\\.ts$' },
			to: { path: `${SERVER}/db/`, dependencyTypesNot: ['type-only'] }
		},
		{
			name: 'routes-no-schema',
			comment:
				'ADR 0002 rule 1, ADR 0048 rule 5: routes import no schema.ts at all, not even the open ones (directory, auth).',
			severity: 'error',
			from: { path: '^src/routes/', pathNot: '\\.spec\\.ts$' },
			to: { path: `${SERVER}/[^/]+/schema\\.ts$` }
		},

		// ---------------------------------------------------------------- 6 --
		{
			name: 'testing-in-production',
			comment:
				'ADR 0048 rule 6: fixtures stay out of production. Only specs and other testing/ files import a testing/ folder. (A spec reaching another module\u2019s internals is public-entry-across-modules.)',
			severity: 'error',
			from: { pathNot: SPEC_OR_TESTING },
			to: { path: '/testing/' }
		},

		// ---------------------------------------------------------------- 7 --
		{
			name: 'no-circular',
			comment:
				'ADR 0048 rule 7: no runtime import cycles. Type-only edges are erased by TypeScript, so a cycle is reported only when every edge of it is a runtime edge (`viaOnly`). Vendored shadcn-svelte and specs are out.',
			severity: 'error',
			from: { pathNot: ['^src/lib/components/ui/', '\\.spec\\.ts$'] },
			to: {
				circular: true,
				viaOnly: { pathNot: '^src/lib/components/ui/', dependencyTypesNot: ['type-only'] }
			}
		}
	],
	options: {
		// Keep `import type` edges: the rules above count them.
		tsPreCompilationDeps: true,
		includeOnly: '^src/',
		// Generated by paraglide at build time; absent from a clean checkout.
		exclude: { path: '^src/lib/paraglide/' },
		doNotFollow: { path: 'node_modules' },
		enhancedResolveOptions: {
			exportsFields: ['exports'],
			conditionNames: ['import', 'require', 'node', 'default', 'types'],
			mainFields: ['module', 'main', 'types']
		},
		cache: false,
		reporterOptions: { text: { highlightFocused: true } }
	}
};
