import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

/** Shared by every domain's block: they reach notifications through its index only (ADR 0040). */
const NOTIFICATIONS_TABLES = {
	regex: '(^|/)notifications/(schema|reader|notify)',
	message:
		'Domains call notify() from the notifications index and never read its tables (ADR 0040).'
};

/**
 * The tables, enums and sequences each barrel re-exports. `links` may not import
 * them (ADR 0002): it asks the owner's functions instead. MAINTAINED BY HAND:
 * when one of these barrels re-exports a new table or enum, add its name here.
 */
const BARREL_TABLES = {
	assets: [
		'assets',
		'assetModels',
		'categories',
		'manufacturers',
		'assetState',
		'assetCodeSequence'
	],
	'service-desk': [
		'queues',
		'requestForms',
		'requestFormKind',
		'tickets',
		'ticketComments',
		'attachments',
		'ticketStatus',
		'ticketPriority',
		'ticketChannel',
		'commentVisibility',
		'ticketCodeSequence'
	],
	projects: [
		'states',
		'projects',
		'tasks',
		'taskAssignees',
		'stateGroup',
		'projectAttachments',
		'taskAttachments',
		'projectComments',
		'taskComments',
		'projectCodeSequence',
		'taskCodeSequence',
		'projectVisibility',
		'projectMembers'
	],
	knowledge: [
		'knowledgeSpaces',
		'knowledgeSpaceAudience',
		'pages',
		'pageAttachments',
		'pageCodeSequence',
		'pageComments',
		'pageRevisionsTable'
	]
};

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// Vendored agent skills: installed content, not ours to lint.
	{ ignores: ['.agents/skills/**'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// `projects` does not know that tickets exist (ADR 0002). What other
		// domains must hear of, it emits through `shared/events.ts` (ADR 0024).
		files: ['src/lib/server/projects/**/*.ts'],
		ignores: ['**/*.spec.ts', '**/testing/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							regex: '(^|/)(links|service-desk)(/|$)',
							message: 'projects must not import links or service-desk (ADR 0002, ADR 0024).'
						},
						NOTIFICATIONS_TABLES
					]
				}
			]
		}
	},
	{
		// The notifications tables belong to `notifications` (ADR 0040). A domain
		// writes through `notify(tx, …)` from the module's index and never touches
		// its tables, as with `activity`. (`projects` carries the same pattern in its
		// own block above: a later block for the same files would replace it.)
		files: [
			'src/lib/server/assets/**/*.ts',
			'src/lib/server/directory/**/*.ts',
			'src/lib/server/service-desk/**/*.ts'
		],
		ignores: ['**/*.spec.ts', '**/testing/**'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [NOTIFICATIONS_TABLES] }]
		}
	},
	{
		// `links` owns the join tables and nothing else: every cross-domain read goes
		// through the owner's functions (ADR 0002). Only `schema.ts` keeps the foreign
		// keys. `directory` stays allowed, the one domain everyone depends on. The
		// notifications pattern is repeated here: a later block replaces the rule.
		files: ['src/lib/server/links/**/*.ts'],
		ignores: ['src/lib/server/links/schema.ts', '**/*.spec.ts', '**/testing/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						// One per barrel. The regex covers the relative, `#lib/…` and `$lib/…`
						// forms, with or without `/index` and an extension.
						...Object.entries(BARREL_TABLES).map(([domain, importNames]) => ({
							regex: `(^|/)${domain}(/index(\\.(js|ts))?)?$`,
							importNames,
							message: `links reads ${domain} through its functions, never its tables (ADR 0002).`
						})),
						{
							regex: '(^|/)(assets|service-desk|projects|knowledge)/schema',
							message: 'links must not import other domains\u2019 tables (ADR 0002).'
						},
						NOTIFICATIONS_TABLES
					]
				}
			]
		}
	},
	{
		// `notifications` reads the tables of the records it points at, like `activity`,
		// but calls none of the domains' functions (ADR 0040).
		files: ['src/lib/server/notifications/**/*.ts'],
		ignores: ['**/*.spec.ts', '**/testing/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							regex: '(^|/)(assets|directory|service-desk|projects|links)/(?!schema)',
							message:
								'notifications may import a domain\u2019s tables, never its functions (ADR 0040).'
						},
						{
							regex: '(^|/)(assets|directory|service-desk|projects|links)$',
							message:
								'notifications may import a domain\u2019s tables, never its functions (ADR 0040).'
						}
					]
				}
			]
		}
	},
	{
		// `imports` is orchestration, not a domain, and owns no tables (ADR 0002,
		// ADR 0034): it calls the exported functions of the domains and never reads
		// their tables.
		files: ['src/lib/server/imports/**/*.ts'],
		ignores: ['**/*.spec.ts', '**/testing/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							regex: '(^|/)(assets|directory|service-desk|projects|links|activity)/schema',
							message: "imports must not read another module's tables (ADR 0002, ADR 0034)."
						}
					]
				}
			]
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
