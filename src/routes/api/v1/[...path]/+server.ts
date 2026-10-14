import { handleApiRequest } from '#lib/server/api/index.js';
import type { RequestHandler } from './$types';

/**
 * The whole of `/api/v1` is this one adapter: the endpoint registry decides
 * what exists. It sits outside `(app)` so its layout never redirects to
 * `/login`, and the hook has already authenticated the bearer key.
 */
const handle: RequestHandler = ({ request, locals }) => handleApiRequest({ request, locals });

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
