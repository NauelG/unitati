/**
 * The @mention token (#303): `@[Full Name](person:<uuid>)`, stored inside the
 * markdown of a ticket comment. Shared by the editor (which writes it), the
 * renderer (which turns it into a chip) and the domain (which reads who was named).
 *
 * `]` and `\` in the name are backslash-escaped, so a name cannot end the label
 * early; the id is always a uuid, so nothing else can ride inside the parentheses.
 */

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Group 1: the escaped label. Group 2: the person id. Global: use a fresh copy per scan. */
export const MENTION_TOKEN = new RegExp(
	`@\\[((?:\\\\.|[^\\]\\\\])*)\\]\\(person:(${UUID})\\)`,
	'gu'
);

export const UUID_PATTERN = new RegExp(`^${UUID}$`);

export function escapeMentionLabel(name: string): string {
	return name.replace(/[\\\]]/g, (char) => `\\${char}`);
}

export function unescapeMentionLabel(label: string): string {
	return label.replace(/\\(.)/gu, '$1');
}

export function mentionToken(name: string, personId: string): string {
	return `@[${escapeMentionLabel(name)}](person:${personId})`;
}

/** The people `after` names that `before` did not: who an edit newly mentions. */
export function addedMentions(before: string, after: string): string[] {
	const known = new Set(extractMentions(before));
	return extractMentions(after).filter((id) => !known.has(id));
}

/** The people named in a markdown body: unique ids, in order of first appearance. */
export function extractMentions(markdown: string): string[] {
	const ids: string[] = [];
	for (const match of markdown.matchAll(new RegExp(MENTION_TOKEN.source, 'gu'))) {
		const id = match[2].toLowerCase();
		if (!ids.includes(id)) ids.push(id);
	}
	return ids;
}
