import Mention from '@tiptap/extension-mention';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { MENTION_TOKEN, mentionToken, unescapeMentionLabel } from '#lib/domain/mentions.js';

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

const listStyles = [
	'fixed z-50 max-h-64 w-72 overflow-y-auto rounded-[var(--radius-md)] border',
	'border-[var(--border-strong)] bg-[var(--surface-1)] p-1 shadow-md'
].join(' ');
const optionStyles =
	'flex cursor-pointer flex-col rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--ink)] aria-selected:bg-[var(--surface-2)]';
const hintStyles = 'text-xs text-[var(--ink-muted)]';
const emptyStyles = 'px-2 py-1 text-sm text-[var(--ink-muted)]';

type Labels = { list: string; empty: string };

/**
 * The suggestion popup, as plain DOM: it lives outside the component tree (it is
 * positioned against the caret) and ProseMirror's plugin drives it. The focus
 * never leaves the editor, so the list is announced with `aria-activedescendant`
 * on the textbox, not by moving focus.
 */
function mentionPopup(labels: Labels, listId: string) {
	let element: HTMLDivElement | null = null;
	let current: SuggestionProps<MentionOption, { id: string; label: string }> | null = null;
	let selected = 0;

	const optionId = (index: number) => `${listId}-option-${index}`;

	function paint() {
		if (!element || !current) return;
		const { items, editor } = current;
		element.replaceChildren();

		if (items.length === 0) {
			const empty = document.createElement('p');
			empty.className = emptyStyles;
			empty.textContent = labels.empty;
			element.append(empty);
		}

		items.forEach((item, index) => {
			const option = document.createElement('div');
			option.id = optionId(index);
			option.setAttribute('role', 'option');
			option.setAttribute('aria-selected', String(index === selected));
			option.className = optionStyles;
			const name = document.createElement('span');
			name.textContent = item.label;
			option.append(name);
			if (item.hint) {
				const hint = document.createElement('span');
				hint.className = hintStyles;
				hint.textContent = item.hint;
				option.append(hint);
			}
			// mousedown, not click: a click would blur the editor and close the list first.
			option.addEventListener('mousedown', (event) => {
				event.preventDefault();
				choose(index);
			});
			element!.append(option);
		});

		const dom = editor.view.dom;
		dom.setAttribute('aria-expanded', 'true');
		dom.setAttribute('aria-controls', listId);
		if (items.length > 0) dom.setAttribute('aria-activedescendant', optionId(selected));
		else dom.removeAttribute('aria-activedescendant');

		const rect = current.clientRect?.();
		if (rect) {
			element.style.left = `${rect.left}px`;
			element.style.top = `${rect.bottom + 4}px`;
		}
	}

	function choose(index: number) {
		const item = current?.items[index];
		if (item) current?.command({ id: item.id, label: item.label });
	}

	return {
		onStart(props: SuggestionProps<MentionOption, { id: string; label: string }>) {
			current = props;
			selected = 0;
			element = document.createElement('div');
			element.id = listId;
			element.setAttribute('role', 'listbox');
			element.setAttribute('aria-label', labels.list);
			element.className = listStyles;
			document.body.append(element);
			paint();
		},
		onUpdate(props: SuggestionProps<MentionOption, { id: string; label: string }>) {
			current = props;
			selected = Math.min(selected, Math.max(props.items.length - 1, 0));
			paint();
		},
		onKeyDown({ event }: SuggestionKeyDownProps): boolean {
			const count = current?.items.length ?? 0;
			if (event.key === 'Escape') {
				// Returning false would let the editor see Esc; true closes the list only.
				this.onExit();
				return true;
			}
			if (count === 0) return false;
			if (event.key === 'ArrowDown') {
				selected = (selected + 1) % count;
				paint();
				return true;
			}
			if (event.key === 'ArrowUp') {
				selected = (selected - 1 + count) % count;
				paint();
				return true;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				choose(selected);
				return true;
			}
			return false;
		},
		onExit() {
			const dom = current?.editor.view.dom;
			dom?.removeAttribute('aria-expanded');
			dom?.removeAttribute('aria-controls');
			dom?.removeAttribute('aria-activedescendant');
			element?.remove();
			element = null;
			current = null;
		}
	};
}

let instance = 0;

/** The Tiptap extension, wired to a source of people and the strings of the list. */
export function mentionExtension(source: MentionSource, labels: Labels) {
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
			render: () => mentionPopup(labels, `mention-list-${++instance}`)
		}
	});
}
