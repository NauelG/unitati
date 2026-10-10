import type { SubmitFunction } from '$app/forms';

/**
 * The `use:enhance` shape every `ConfirmDialog`'s `action` form shares
 * (#99): mark the record pending before the POST, clear it after, and only
 * tell the dialog to close once the server actually accepted the request —
 * a failure leaves `confirming` as it was, so the dialog stays open with its
 * `error` prop now set from the page's `form`/`result` data. Three call
 * sites (`RelatedRecords`, the shared name-catalogue, the models catalogue)
 * had copied these same five lines before this existed; a fourth consumer
 * reaches for this instead of a fourth copy.
 */
export function confirmSubmit(options: {
	onPending: (pending: boolean) => void;
	onSettled: (succeeded: boolean) => void;
}): SubmitFunction {
	return () => {
		options.onPending(true);
		return async ({ result, update }) => {
			await update();
			options.onPending(false);
			options.onSettled(result.type === 'success');
		};
	};
}
