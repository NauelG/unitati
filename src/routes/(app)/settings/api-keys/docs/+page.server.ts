import { permissionsOf } from '#lib/server/access/permissions.js';
import { buildOpenApiDocument, ENDPOINTS } from '#lib/server/api/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { APP_VERSION } from '#lib/version.js';
import type { PageServerLoad } from './$types';

/** The documentation lives with the keys it is for: the same section, the same permission. */
const SECTION = '/settings/api-keys';

export const load = (({ locals, url }) => {
	const user = requireSettingsSection(locals.user, SECTION);

	return {
		// The document for the whole API, as `GET /api/v1/openapi.json` serves it.
		document: buildOpenApiDocument(ENDPOINTS, { version: APP_VERSION, serverUrl: url.origin }),
		/** What the viewer's *role* holds, to mark each required permission as theirs or not. */
		held: [...permissionsOf(user)] as string[]
	};
}) satisfies PageServerLoad;
