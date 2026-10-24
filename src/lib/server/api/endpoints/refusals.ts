import { ApiError } from '../registry';

/** A reference in the body that points at nothing: a field the caller can fix, so a `400` on that field. */
export function invalidField(field: string, message: string): ApiError {
	return new ApiError(400, 'invalid_input', 'The request is not valid.', [
		{ path: [field], message }
	]);
}
