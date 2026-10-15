import { ApiError, conflict, notFound } from '../registry';

/**
 * A domain failure as the envelope's refusal (ADR 0022). A record that is not
 * there and an act the caller may not do are one answer, `404` (ADR 0007):
 * `*_not_found`, `forbidden` and `internal_not_allowed` (an internal note the
 * caller may not write is a note they may not know exists). Any other refusal
 * is a conflict with the state of the world, carrying the domain's own name.
 */
export function refusal(failure: string): ApiError {
	// A principal with no person (a service account) has nobody to default to: the
	// fix is a field the caller can send, so it is a `400` on that field.
	if (failure === 'requester_required') {
		return new ApiError(400, 'invalid_input', 'The request is not valid.', [
			{ path: ['requesterPersonId'], message: 'The requester is required.' }
		]);
	}
	if (
		failure.endsWith('_not_found') ||
		failure === 'forbidden' ||
		failure === 'not_linked' ||
		failure === 'internal_not_allowed'
	) {
		return notFound();
	}
	return conflict(
		failure,
		failure.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) + '.'
	);
}
