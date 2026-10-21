import { randomUUID } from 'node:crypto';
import { Marked, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { MENTION_TOKEN, UUID_PATTERN, unescapeMentionLabel } from '#lib/domain/mentions.js';

/**
 * The one place user markdown becomes HTML (ADR 0030). Every `{@html}` of user
 * content in the app receives the output of `renderMarkdown`, so there is a
 * single sanitisation point and the client never sees unsanitised HTML.
 */

/**
 * Proof, for one `renderMarkdown` call, that a `span.mention` came from a real
 * token and not from raw HTML the author typed. Fresh per call, so it cannot be
 * guessed; parsing is synchronous, so a module-level slot is safe.
 */
let mentionNonce = '';

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

type MentionToken = Tokens.Generic & { label: string; personId: string };

const marked = new Marked({
	gfm: true,
	breaks: true,
	extensions: [
		{
			name: 'mention',
			level: 'inline',
			start: (src: string) => src.indexOf('@['),
			tokenizer(src: string) {
				const match = new RegExp(`^${MENTION_TOKEN.source}`, 'u').exec(src);
				if (!match) return undefined;
				return {
					type: 'mention',
					raw: match[0],
					label: unescapeMentionLabel(match[1]),
					personId: match[2].toLowerCase()
				};
			},
			renderer(token) {
				const { label, personId } = token as MentionToken;
				return `<span class="mention" data-person-id="${personId}" data-mention-nonce="${mentionNonce}">@${escapeHtml(label)}</span>`;
			}
		}
	],
	renderer: {
		// A `person:` link is only ever a mention token, which the extension above
		// consumes first; anything else shaped like one is just its text.
		link({ href, tokens }) {
			if (/^\s*person:/i.test(href)) return this.parser.parseInline(tokens);
			return false;
		},
		// Headings are not allowed formatting: a legacy body that starts with `#`
		// must read as a normal paragraph, not a title.
		heading({ tokens }) {
			return `<p>${this.parser.parseInline(tokens)}</p>\n`;
		}
	}
});

const options: sanitizeHtml.IOptions = {
	allowedTags: [
		'p',
		'br',
		'strong',
		'em',
		'ul',
		'ol',
		'li',
		'a',
		'code',
		'pre',
		'blockquote',
		'span'
	],
	// `rel` and `target` are set by the transform below, which runs before the
	// attribute filter, so they have to be allowed here; the transform overrides
	// whatever the source tried to put in them.
	allowedAttributes: { a: ['href', 'rel', 'target'], span: ['class', 'data-person-id'] },
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false,
	// Tags outside the list are dropped with their text kept; these lose the text too.
	nonTextTags: ['script', 'style', 'iframe', 'textarea', 'noscript'],
	transformTags: {
		a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
		// The only span that survives is the mention chip the renderer made in this
		// very call; a span written by hand keeps its text and loses every attribute.
		span: (tagName, attribs) => {
			const genuine =
				attribs['data-mention-nonce'] === mentionNonce &&
				attribs.class === 'mention' &&
				UUID_PATTERN.test(attribs['data-person-id'] ?? '');
			const kept: sanitizeHtml.Attributes = genuine
				? { class: 'mention', 'data-person-id': attribs['data-person-id'] }
				: {};
			return { tagName, attribs: kept };
		}
	}
};

/** Markdown in, sanitised HTML out. */
export function renderMarkdown(source: string): string {
	if (source.trim() === '') return '';
	mentionNonce = randomUUID();
	try {
		return sanitizeHtml(marked.parse(source, { async: false }), options);
	} finally {
		mentionNonce = '';
	}
}

/** Tags that separate words: dropping them without a space would glue two lines into one word. */
const BLOCK_TAGS = /<\/?(p|br|li|ul|ol|pre|blockquote)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/** One pass, so `&amp;lt;` reads as the `&lt;` the author typed and not as `<`. */
function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name[0] === '#') {
			const code =
				name[1] === 'x' || name[1] === 'X'
					? Number.parseInt(name.slice(2), 16)
					: Number(name.slice(1));
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[name.toLowerCase()] ?? whole;
	});
}

/**
 * A comment's words without its markup, for a mail or a notification (#302):
 * rendered through the same pipeline as the page, so it reads what the reader
 * would read, then flattened to one line and cut at a word boundary with `…`
 * so it is never longer than `max`.
 */
export function plainExcerpt(markdown: string, max: number): string {
	const text = decodeEntities(
		renderMarkdown(markdown)
			.replace(BLOCK_TAGS, ' ')
			.replace(/<[^>]*>/g, '')
	)
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= max) return text;

	const head = text.slice(0, max - 1);
	const endsOnWord = text[max - 1] === ' ';
	const lastSpace = head.lastIndexOf(' ');
	const cut = endsOnWord || lastSpace <= 0 ? head : head.slice(0, lastSpace);
	return `${cut.trimEnd()}…`;
}
