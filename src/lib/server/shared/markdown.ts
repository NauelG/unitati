import { randomUUID } from 'node:crypto';
import { Marked, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';
import {
	documentHeadingLevel,
	PAGE_LINK,
	type MarkdownProfile
} from '#lib/domain/markdown-profiles.js';
import { MENTION_TOKEN, UUID_PATTERN, unescapeMentionLabel } from '#lib/domain/mentions.js';

/**
 * The one place user markdown becomes HTML (ADR 0030). Every `{@html}` of user
 * content in the app receives the output of `renderMarkdown`, so there is a
 * single sanitisation point and the client never sees unsanitised HTML.
 *
 * One pipeline for every profile (`domain/markdown-profiles.ts`): the same
 * `marked` instance and the same sanitiser, with the renderer's choices and the
 * allow-list picked by the profile of the call.
 */

/**
 * The state of one `renderMarkdown` call. Parsing is synchronous, so a
 * module-level slot is safe.
 *
 * - `nonce` proves that a `span.mention` came from a real token and not from raw
 *   HTML the author typed. Fresh per call, so it cannot be guessed.
 * - `slugs` are the heading ids already given out in this document.
 */
type Pass = { profile: MarkdownProfile; nonce: string; slugs: Set<string> };

let pass: Pass = { profile: 'comment', nonce: '', slugs: new Set() };

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Tags a `document` keeps out of raw HTML: none. Their text stays, as a comment's does. */
const TEXT_ONLY: sanitizeHtml.IOptions = {
	allowedTags: [],
	allowedAttributes: {},
	nonTextTags: ['script', 'style', 'iframe', 'textarea', 'noscript']
};

/** A heading's id: its words without accents or punctuation, unique within the document. */
function headingId(html: string): string {
	const text = decodeEntities(html.replace(/<[^>]*>/g, ''));
	const base =
		text
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'seccion';
	let slug = base;
	for (let n = 2; pass.slugs.has(slug); n++) slug = `${base}-${n}`;
	pass.slugs.add(slug);
	return slug;
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
				// Page bodies carry no mentions (ADR 0031 addendum §2): the name is just text.
				if (pass.profile === 'document') return `@${escapeHtml(label)}`;
				return `<span class="mention" data-person-id="${personId}" data-mention-nonce="${pass.nonce}">@${escapeHtml(label)}</span>`;
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
		heading({ tokens, depth }) {
			const inner = this.parser.parseInline(tokens);
			// In a comment headings are not allowed formatting: a legacy body that
			// starts with `#` must read as a normal paragraph, not a title.
			if (pass.profile === 'comment') return `<p>${inner}</p>\n`;
			const level = documentHeadingLevel(depth);
			return `<h${level} id="${headingId(inner)}">${inner}</h${level}>\n`;
		},
		// A document renders no raw HTML at all, not even the tags its own
		// allow-list has (`<h2 id>`, `<table>`): only the markdown makes those.
		html({ text }) {
			if (pass.profile === 'document') return sanitizeHtml(text, TEXT_ONLY);
			return false;
		}
	}
});

const linkAttributes = { rel: 'noopener noreferrer', target: '_blank' };

/**
 * In both profiles `a` allows `rel` and `target`: the `a` transform sets them,
 * and it runs before the attribute filter. The transform overrides whatever the
 * source tried to put in them.
 */
const shared = {
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false,
	// Tags outside the list are dropped with their text kept; these lose the text too.
	nonTextTags: ['script', 'style', 'iframe', 'textarea', 'noscript']
} satisfies sanitizeHtml.IOptions;

const COMMENT_TAGS = [
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
	'blockquote'
];

const ALIGN = { name: 'align', multiple: false, values: ['left', 'center', 'right'] };

const OPTIONS: Record<MarkdownProfile, sanitizeHtml.IOptions> = {
	comment: {
		...shared,
		allowedTags: [...COMMENT_TAGS, 'span'],
		allowedAttributes: { a: ['href', 'rel', 'target'], span: ['class', 'data-person-id'] },
		transformTags: {
			a: sanitizeHtml.simpleTransform('a', linkAttributes),
			// The only span that survives is the mention chip the renderer made in this
			// very call; a span written by hand keeps its text and loses every attribute.
			span: (tagName, attribs) => {
				const genuine =
					attribs['data-mention-nonce'] === pass.nonce &&
					attribs.class === 'mention' &&
					UUID_PATTERN.test(attribs['data-person-id'] ?? '');
				const kept: sanitizeHtml.Attributes = genuine
					? { class: 'mention', 'data-person-id': attribs['data-person-id'] }
					: {};
				return { tagName, attribs: kept };
			}
		}
	},
	document: {
		...shared,
		allowedTags: [
			...COMMENT_TAGS,
			'h2',
			'h3',
			'h4',
			'hr',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td'
		],
		allowedAttributes: {
			a: ['href', 'rel', 'target'],
			h2: ['id'],
			h3: ['id'],
			h4: ['id'],
			th: [ALIGN],
			td: [ALIGN]
		},
		transformTags: {
			// A link to another page (or to a section of this one) is navigation
			// inside the app, so it stays in the tab; anything else opens a new one.
			a: (tagName, attribs) => {
				const href = attribs.href ?? '';
				const internal = PAGE_LINK.test(href) || /^#[a-z0-9-]*$/i.test(href);
				const kept: sanitizeHtml.Attributes = internal
					? { href }
					: { ...attribs, ...linkAttributes };
				return { tagName, attribs: kept };
			}
		}
	}
};

/** Markdown in, sanitised HTML out, with what `profile` allows (`comment` unless told otherwise). */
export function renderMarkdown(source: string, profile: MarkdownProfile = 'comment'): string {
	if (source.trim() === '') return '';
	pass = { profile, nonce: randomUUID(), slugs: new Set() };
	try {
		return sanitizeHtml(marked.parse(source, { async: false }), OPTIONS[profile]);
	} finally {
		pass = { profile: 'comment', nonce: '', slugs: new Set() };
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
