/**
 * What a piece of rich text may contain (ADR 0030, ADR 0031 §10), shared by the
 * editor in the browser and the renderer on the server so the two cannot drift.
 *
 * - `comment`: ticket replies, notes, descriptions and (later) page comments.
 *   Bold, italic, lists, links, inline code, code blocks, quotes and @mentions.
 * - `document`: knowledge base pages. `comment` **minus** mentions, **plus**
 *   headings h2–h4 (an `#` h1 reads as h2), GFM tables, the horizontal rule and
 *   links to other pages. No images, no raw HTML, no task lists.
 */
export type MarkdownProfile = 'comment' | 'document';

/** The heading levels a `document` renders; a deeper or shallower heading is clamped into it. */
export const DOCUMENT_HEADING_LEVELS = [2, 3, 4] as const;

export type DocumentHeadingLevel = (typeof DOCUMENT_HEADING_LEVELS)[number];

/** `##` is h2 and `###` h3; `#` reads as h2 and `#####` or deeper as h4: a page's title is its only h1. */
export function documentHeadingLevel(depth: number): DocumentHeadingLevel {
	return Math.min(Math.max(depth, 2), 4) as DocumentHeadingLevel;
}

/**
 * A link to a knowledge page, optionally to one of its sections: the canonical
 * `/knowledge/DOC-0012` (ADR 0031 addendum §7), which is what the page picker
 * inserts.
 */
export const PAGE_LINK = /^\/knowledge\/DOC-\d{4,}(#[a-z0-9-]*)?$/i;

/** The canonical link of a page, from its tag. */
export function pageLink(tag: string): string {
	return `/knowledge/${tag.toUpperCase()}`;
}
