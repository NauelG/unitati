import { plainExcerpt } from './markdown';

/**
 * The domain-agnostic half of @mentions (#303, #326): what a notification about
 * a comment says. Who may be mentioned is each domain's rule (tickets in
 * `service-desk/mentions.ts`, pages in `knowledge/comments.ts`); the token
 * helpers are pure and live in `#lib/domain/mentions`.
 */

/** The longest excerpt a notification carries (ADR 0040). */
const EXCERPT_LENGTH = 280;

/** What every notification about a comment says: the record, who wrote, and how it starts. */
export function mentionSnapshot(
	record: { code: string; title: string },
	actor: { name: string },
	body: string
) {
	return {
		code: record.code,
		title: record.title,
		actorName: actor.name,
		excerpt: plainExcerpt(body, EXCERPT_LENGTH) || undefined
	};
}

/** What the picker shows at most (#303). */
export const MENTION_PICKER_LIMIT = 8;

/** `%` and `_` in a search are literal characters, not wildcards. */
export function likePattern(query: string): string {
	return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
