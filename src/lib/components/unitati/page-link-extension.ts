import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { PAGE_PICK_LIMIT } from '#lib/domain/knowledge.js';
import { pageLink } from '#lib/domain/markdown-profiles.js';
import { suggestionPopup, type SuggestionLabels } from './suggestion-popup.js';

/**
 * The page picker of the `document` profile (#324): `[[` (or the toolbar
 * button, which types it) opens a list of pages, and choosing one replaces what
 * was typed with `[Title](/knowledge/DOC-0012)`, the canonical link (ADR 0031
 * addendum §7). Which pages are offered is the server's to decide.
 */

export type PageOption = { tag: string; title: string; hint?: string };
export type PageSource = (query: string) => Promise<PageOption[]>;

/** What opens the picker. */
export const PAGE_LINK_TRIGGER = '[[';

const pageLinkKey = new PluginKey('pageLink');

let instance = 0;

export function pageLinkExtension(source: PageSource, labels: SuggestionLabels) {
	return Extension.create({
		name: 'pageLink',
		addProseMirrorPlugins() {
			return [
				Suggestion<PageOption & { label: string }, PageOption>({
					editor: this.editor,
					pluginKey: pageLinkKey,
					char: PAGE_LINK_TRIGGER,
					// A title has spaces, and `[[` may follow any character.
					allowSpaces: true,
					allowedPrefixes: null,
					items: async ({ query }) =>
						(await source(query))
							.slice(0, PAGE_PICK_LIMIT)
							.map((page) => ({ ...page, label: page.title, hint: page.hint ?? page.tag })),
					command: ({ editor, range, props }) => {
						editor
							.chain()
							.focus()
							.insertContentAt(range, [
								{
									type: 'text',
									text: props.title,
									marks: [{ type: 'link', attrs: { href: pageLink(props.tag) } }]
								},
								{ type: 'text', text: ' ' }
							])
							.run();
					},
					render: () =>
						suggestionPopup(
							labels,
							`page-link-list-${++instance}`,
							(item: PageOption & { label: string }) => ({ tag: item.tag, title: item.title })
						)
				})
			];
		}
	});
}
