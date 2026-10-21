import { describe, expect, it } from 'vitest';
import { resolveCompose } from './compose.mjs';

type ProbeResult = { ok: boolean; stdout: string };
type Runner = (bin: string, args: string[]) => ProbeResult;

/** Fake runner: maps "bin arg arg" to a probe result; anything else is "not installed". */
function fakeRunner(known: Record<string, ProbeResult>): Runner {
	return (bin, args) => known[[bin, ...args].join(' ')] ?? { ok: false, stdout: '' };
}

describe('resolveCompose', () => {
	it('prefers the docker compose plugin when present', () => {
		const run = fakeRunner({
			'docker compose version': { ok: true, stdout: 'Docker Compose version v2.29.1' },
			'docker-compose version': { ok: true, stdout: 'Docker Compose version v5.5.1' }
		});
		expect(resolveCompose(run)).toEqual({ ok: true, command: 'docker', prefix: ['compose'] });
	});

	it('falls back to the standalone docker-compose binary', () => {
		const run = fakeRunner({
			'docker-compose version': { ok: true, stdout: 'Docker Compose version v5.5.1' }
		});
		expect(resolveCompose(run)).toEqual({ ok: true, command: 'docker-compose', prefix: [] });
	});

	it('refuses a standalone docker-compose v1', () => {
		const run = fakeRunner({
			'docker-compose version': {
				ok: true,
				stdout: 'docker-compose version 1.29.2, build 5becea4c'
			}
		});
		const result = resolveCompose(run);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toBe(
				'docker-compose v1 is not supported; install Compose v2 or later'
			);
		}
	});

	it('explains how to install Compose when neither is available', () => {
		const result = resolveCompose(fakeRunner({}));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toBe(
				'Docker Compose not found. Install either the Compose plugin (`docker compose`, e.g. `apt install docker-compose-plugin`) or the standalone `docker-compose` binary (v2 or later), then run this again.'
			);
		}
	});
});
