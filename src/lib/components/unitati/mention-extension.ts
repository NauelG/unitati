import Mention from '@tiptap/extension-mention';
import { MENTION_TOKEN, mentionToken, unescapeMentionLabel } from '#lib/domain/mentions.js';
import { suggestionPopup, type SuggestionLabels } from './suggestion-popup.js';

/**
 * @mentions in the rich text editor (#303). The node stores the `@[Name](person:id)`
 * token as markdown, so what the editor emits is what the server reads and what
 * `renderMarkdown` turns into a chip.
 */

export type MentionOption = { id: string; label: string; hint?: string };
export type MentionSource = (query: string) => Promise<MentionOption[]>;

/** At most this many people are listed. The server caps at the same number. */
export const MENTION_LIST_MAX = 8;

const TOKEN_AT_START = new RegExp(`^${MENTION_TOKEN.source}`, 'u');

let instance = 0;

/** The Tiptap extension, wired to a source of people and the strings of the list. */
export function mentionExtension(source: MentionSource, labels: SuggestionLabels) {
	return Mention.extend({
		markdownTokenName: 'mention',
		markdownTokenizer: {
			name: 'mention',
			level: 'inline',
			start: (src: string) => src.indexOf('@['),
			tokenize: (src: string) => {
				const match = TOKEN_AT_START.exec(src);
				if (!match) return undefined;
				return {
					type: 'mention',
					raw: match[0],
					id: match[2].toLowerCase(),
					label: unescapeMentionLabel(match[1])
				};
			}
		},
		parseMarkdown: (token, helpers) =>
			helpers.createNode('mention', { id: token.id, label: token.label }),
		renderMarkdown: (node) => mentionToken(String(node.attrs?.label ?? ''), String(node.attrs?.id))
	}).configure({
		HTMLAttributes: { class: 'mention' },
		renderText: ({ node }) => `@${node.attrs.label}`,
		renderHTML: ({ options, node }) => [
			'span',
			options.HTMLAttributes,
			`@${node.attrs.label ?? node.attrs.id}`
		],
		suggestion: {
			char: '@',
			// A name has spaces; the list narrows as the whole phrase is typed.
			allowSpaces: false,
			items: async ({ query }: { query: string }) =>
				(await source(query)).slice(0, MENTION_LIST_MAX),
			render: () =>
				suggestionPopup(labels, `mention-list-${++instance}`, (item: MentionOption) => ({
					id: item.id,
					label: item.label
				}))
		}
	});
}
