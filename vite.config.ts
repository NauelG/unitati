import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	// Single source of truth for the running version: package.json, baked in at build time.
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	plugins: [
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// Behind a login: the locale is a user preference (cookie), never a URL segment.
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		}),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Same semver as __APP_VERSION__, so /_app/version.json reports the deployed build.
			version: { name: pkg.version }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					// `*.db.spec.ts` needs Postgres; this project is the loop that must
					// stay fast and run with Docker stopped.
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.db.spec.ts']
				}
			},
			{
				extends: './vite.config.ts',
				// Components that need a DOM but no browser: rendered with
				// @testing-library/svelte under jsdom. `resolve.conditions` makes Svelte
				// resolve to its client build, otherwise `mount` is unavailable.
				resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
				test: {
					name: 'component',
					environment: 'jsdom',
					setupFiles: ['./src/lib/testing/component-setup.ts'],
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'db',
					environment: 'node',
					include: ['src/**/*.db.spec.ts'],
					globalSetup: ['./src/lib/server/db/testing/global-setup.ts'],
					setupFiles: ['./src/lib/server/db/testing/setup.ts'],
					// One database, emptied between tests: two files running at once
					// would delete each other's rows. Isolation is the point, so it wins
					// over the wall clock.
					fileParallelism: false,
					// Files share one module graph instead of re-importing the app 58
					// times: the import alone was a third of the run. The harness
					// resets the process state a fresh import used to (ADR 0032).
					isolate: false,
					// Randomised order, so "these tests do not depend on each other" is
					// exercised on every run instead of being asserted once. A failure
					// here is a real order dependency; Vitest prints the seed to replay it.
					sequence: { shuffle: true }
				}
			}
		]
	}
});
