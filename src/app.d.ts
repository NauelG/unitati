// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { ApiAuthState } from '#lib/server/api/index.js';
import type { BrandView } from '#lib/domain/brand.js';
import type { SessionUser } from '#lib/server/auth/guards.js';

declare global {
	/** package.json version, injected by Vite at build time. */
	const __APP_VERSION__: string;
	/** Browsable package.json `repository` URL, injected by Vite at build time (ADR 0041). */
	const __APP_SOURCE_URL__: string;

	namespace App {
		// interface Error {}
		interface Locals {
			/** Resolved once per request in hooks.server.ts; null when anonymous. */
			user: SessionUser | null;
			/**
			 * Set only on `/api/v1` requests: which key authenticated them, or why none
			 * did. `user` is then the key's principal, never a session (ADR 0022).
			 */
			api?: ApiAuthState;
		}
		interface PageData {
			/** The organisation's brand, loaded for every page by the root layout (ADR 0026). */
			brand: BrandView;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
