// Runs the development seed (src/lib/server/seed) through Vite's module runner.
//
// A plain `node` import cannot load that code: it reaches for `$app/env/private`
// and the `#lib/*` aliases through the SvelteKit plugin, which only exists
// inside Vite. Standing up a Vite server in middleware mode — no port, no HMR —
// gives the seed the same module graph the app and the database tests run on,
// so there is one way to resolve an import, not two.
import { createServer, createServerModuleRunner } from 'vite';

const server = await createServer({
	configFile: './vite.config.ts',
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true, hmr: false, ws: false }
});

let exitCode = 0;
const runner = createServerModuleRunner(server.environments.ssr);

try {
	const { run } = await runner.import('/src/lib/server/seed/index.ts');
	await run();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	exitCode = 1;
} finally {
	await runner.close();
	await server.close();
	// The Postgres client keeps its pool open; there is no seam to close it
	// from here, and a script that ends should end.
	process.exit(exitCode);
}
