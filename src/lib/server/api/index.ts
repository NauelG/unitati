/**
 * The `api` module's public surface (ADR 0002, ADR 0022): API keys and the
 * `/api/v1` endpoint registry. Routes and the hook import from here.
 */

export type { ApiKey } from './schema';

export { createApiKey, listApiKeys, revokeApiKey, authenticateApiKey } from './keys';
export type {
	ApiKeyView,
	ApiPrincipal,
	AuthenticateFailure,
	CreateApiKeyFailure,
	CreateApiKeyInput
} from './keys';

export {
	createServiceAccount,
	listServiceAccounts,
	setServiceAccountDisabled,
	createServiceAccountKey
} from './service-accounts';
export type {
	CreateServiceAccountFailure,
	CreateServiceAccountKeyFailure,
	ServiceAccountView
} from './service-accounts';
export type { ServiceAccount } from './schema';

export {
	EXPIRY_DAYS,
	DEFAULT_EXPIRY_DAYS,
	MAX_NAME_LENGTH,
	SERVICE_ACCOUNT_ROLES
} from './validation';

export { authenticateRequest, isApiPath } from './authenticate-request';
export type { ApiAuthFailure, ApiAuthState } from './authenticate-request';

export { handleApiRequest } from './dispatch';
export type { ApiEvent } from './dispatch';

export { ENDPOINTS } from './endpoints';
export {
	defineEndpoint,
	ApiError,
	Reply,
	notFound,
	conflict,
	created,
	noContent
} from './registry';
export type { Endpoint, HttpMethod } from './registry';

export { buildOpenApiDocument, tagOf } from './openapi';
export type { JsonSchema, OpenApiDocument, OpenApiOperation, OpenApiParameter } from './openapi';
