// Runs Docker Compose with whichever flavour the host has: the CLI plugin
// (`docker compose`) or the standalone binary (`docker-compose`, v2 or later).
//
//   node scripts/compose.mjs up -d --wait
//
// Compose v1 is refused: it does not understand `--wait`.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const NOT_FOUND =
	'Docker Compose not found. Install either the Compose plugin (`docker compose`, e.g. `apt install docker-compose-plugin`) or the standalone `docker-compose` binary (v2 or later), then run this again.';
const V1 = 'docker-compose v1 is not supported; install Compose v2 or later';

/**
 * @typedef {{ ok: boolean, stdout: string }} ProbeResult
 * @typedef {(bin: string, args: string[]) => ProbeResult} Runner
 */

/** @type {Runner} */
export function probe(bin, args) {
	const result = spawnSync(bin, args, { encoding: 'utf8' });
	return { ok: result.status === 0, stdout: result.stdout ?? '' };
}

/**
 * @param {Runner} run
 * @returns {{ ok: true, command: string, prefix: string[] } | { ok: false, message: string }}
 */
export function resolveCompose(run) {
	if (run('docker', ['compose', 'version']).ok) {
		return { ok: true, command: 'docker', prefix: ['compose'] };
	}
	const standalone = run('docker-compose', ['version']);
	if (standalone.ok) {
		if (/docker-compose version 1\./i.test(standalone.stdout)) return { ok: false, message: V1 };
		return { ok: true, command: 'docker-compose', prefix: [] };
	}
	return { ok: false, message: NOT_FOUND };
}

function main() {
	const resolved = resolveCompose(probe);
	if (!resolved.ok) {
		console.error(resolved.message);
		process.exit(1);
	}
	const result = spawnSync(resolved.command, [...resolved.prefix, ...process.argv.slice(2)], {
		stdio: 'inherit'
	});
	process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
