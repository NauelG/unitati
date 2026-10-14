/**
 * The `api` module's public surface (ADR 0002, ADR 0022): API keys and the
 * `/api/v1` endpoint registry. Routes and the hook import from here.
 */

export { apiKeys } from './schema';
export type { ApiKey } from './schema';

export { createApiKey, listApiKeys, revokeApiKey, authenticateApiKey } from './keys';
export type {
	ApiKeyView,
	ApiPrincipal,
	AuthenticateFailure,
	CreateApiKeyFailure,
	CreateApiKeyInput
} from './keys';

export { EXPIRY_DAYS, DEFAULT_EXPIRY_DAYS, MAX_NAME_LENGTH } from './validation';

export { authenticateRequest, isApiPath } from './authenticate-request';
export type { ApiAuthFailure, ApiAuthState } from './authenticate-request';

export { handleApiRequest } from './dispatch';
export type { ApiEvent } from './dispatch';

export { ENDPOINTS } from './endpoints';
export { defineEndpoint, ApiError, notFound, conflict } from './registry';
export type { Endpoint, HttpMethod } from './registry';
