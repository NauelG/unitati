import { BETTER_AUTH_URL } from '$app/env/private';
import { notifyTaskCompleted } from './links/notify-task-completed';
import { runtimeMailer } from './shared/runtime';
import { on } from './shared/events';

/**
 * The single registration point of every domain-event handler (ADR 0024).
 * `hooks.server.ts` calls it once at startup; emitters never know who listens,
 * and nothing else calls `on`.
 *
 * To add a reaction: write the handler in the domain that owns the reaction and
 * subscribe it here.
 */

let registered = false;

/** Idempotent, so a dev server that re-evaluates the hooks does not subscribe twice. */
export function registerSubscriptions(): void {
	if (registered) return;
	registered = true;

	on('task.completed', function notifyTechniciansOfCompletedTask(event) {
		return notifyTaskCompleted(event, { mailer: runtimeMailer(), origin: BETTER_AUTH_URL });
	});
}
