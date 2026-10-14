import { enhance } from '$app/forms';
import { toast } from 'svelte-sonner';
import { m } from '#lib/paraglide/messages.js';

/**
 * Perceived speed (#89): the one optimistic-mutation pattern, applied to
 * every form it fits instead of hand-rolled per call site. A Svelte action —
 * `use:optimisticEnhance={apply}` — rather than a bare wrapper around
 * `enhance()`, so it attaches the same way `use:enhance` already does on
 * every one of these forms and nothing about the markup has to change beyond
 * the directive name.
 *
 * `apply` runs the instant the form submits: it reads the value the visitor
 * just picked from `formData` (the server hasn't seen it yet), writes it to
 * the page's own `$state` mirror so the UI moves with no round-trip, and
 * returns a rollback closure holding the snapshot from *before* that write.
 * On `failure`/`error` the rollback runs and a `toast.error` explains why —
 * the server's own `{ message }` shape (`rejected()`, every plain action in
 * this codebase) when there is one, a generic line otherwise. On success,
 * `update()` lets `invalidate`/`load` reconcile silently: the optimistic
 * value already matches what the server now holds, so there is nothing left
 * to announce.
 *
 * Deliberately not used for a form whose success *navigates* (create asset,
 * create ticket, sign-in): there is no local value to flip in the first
 * place. Those forms get `Button`'s `busy` prop instead.
 */
export function optimisticEnhance(
	formElement: HTMLFormElement,
	apply: (formData: FormData) => () => void
) {
	return enhance(formElement, ({ formData }) => {
		const rollback = apply(formData);
		return async ({ result, update }) => {
			if (result.type === 'failure' || result.type === 'error') {
				rollback();
				toast.error(failureMessage(result.type === 'failure' ? result.data : undefined));
			}
			// `reset: false`: an optimistic form already shows the submitted
			// value, so resetting it to whatever it held before submission would
			// itself be a visible flicker backwards.
			await update({ reset: false });
		};
	});
}

/** Every plain (non-Superforms) action in this codebase fails through `rejected()` (`#lib/.../form-data.ts`), whose shape is `{ action, message, id }`. */
function failureMessage(data: unknown): string {
	if (
		typeof data === 'object' &&
		data !== null &&
		'message' in data &&
		typeof (data as { message?: unknown }).message === 'string'
	) {
		return (data as { message: string }).message;
	}
	return m.toast_rollback_generic();
}
