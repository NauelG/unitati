import { fail } from '@sveltejs/kit';
import {
	decideHandover,
	openHandover,
	type DecideFailure,
	type HandoverDecision
} from '#lib/server/assets/index.js';
import { getBrand } from '#lib/server/directory/index.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The public signing page of a handover (ADR 0035, #275). Outside `(app)` and
 * `(portal)` on purpose: there is no session and none is read. The token in the
 * path is the only credential, so this page never caches, never sends it on as
 * a referrer (the agreement may contain links), and is never indexed.
 */

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' });

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'no-referrer',
		'X-Robots-Tag': 'noindex, nofollow'
	});

	const view = await openHandover(params.token);
	// An unknown link names no organisation: the root layout's brand stays.
	if (view.state === 'unknown') return { signing: { state: view.state } };

	// Otherwise the handover's own brand (ADR 0026), whoever is signed in on this browser,
	// and still after the decision, so the confirmation reads like the page it came from.
	const brand = await getBrand(view.organisationId);
	if (view.state !== 'pending') return { brand, signing: { state: view.state } };

	return {
		brand,
		signing: {
			state: view.state,
			code: view.code,
			direction: view.direction,
			bodyHtml: renderMarkdown(view.body),
			expiresOn: dateFormat.format(view.expiresAt),
			assets: view.assets
		}
	};
};

/** Each refusal: the link's own state, which replaces the form, or a message beside it. */
const REFUSALS: Record<
	DecideFailure,
	{ state: 'unknown' | 'expired' | 'decided' } | { message: () => string }
> = {
	unknown: { state: 'unknown' },
	expired: { state: 'expired' },
	already_decided: { state: 'decided' },
	invalid_reason: { message: m.signing_error_reason },
	signature_missing: { message: m.signing_error_signature_missing },
	signature_blank: { message: m.signing_error_signature_missing },
	signature_too_large: { message: m.signing_error_signature_too_large },
	signature_not_png: { message: m.signing_error_signature_unreadable }
};

function refused(action: HandoverDecision, error: DecideFailure) {
	const refusal = REFUSALS[error];
	return 'state' in refusal
		? fail(409, { action, state: refusal.state })
		: fail(400, { action, message: refusal.message() });
}

function evidenceOf(event: RequestEvent) {
	return {
		ip: event.getClientAddress(),
		userAgent: event.request.headers.get('user-agent')
	};
}

/** The canvas arrives as a `data:image/png;base64,` URL in a hidden field; anything else is no signature. */
function signatureBytes(value: FormDataEntryValue | null): Uint8Array | null {
	const prefix = 'data:image/png;base64,';
	if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
	return new Uint8Array(Buffer.from(value.slice(prefix.length), 'base64'));
}

export const actions: Actions = {
	accept: async (event) => {
		const data = await event.request.formData();
		if (data.get('confirm') !== 'on') {
			return fail(400, { action: 'accept' as const, message: m.signing_error_confirm() });
		}

		const outcome = await decideHandover(event.params.token, 'accept', {
			...evidenceOf(event),
			signature: signatureBytes(data.get('signature'))
		});
		if (!outcome.ok) return refused('accept', outcome.error);
		return { action: 'accept' as const, decided: outcome.value.status };
	},

	reject: async (event) => {
		const data = await event.request.formData();
		const reason = data.get('reason');

		const outcome = await decideHandover(event.params.token, 'reject', {
			...evidenceOf(event),
			reason: typeof reason === 'string' ? reason : null
		});
		if (!outcome.ok) return refused('reject', outcome.error);
		return { action: 'reject' as const, decided: outcome.value.status };
	}
};
