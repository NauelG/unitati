import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

/**
 * The list a Tiptap suggestion opens under the caret: the @mention picker
 * (#303) and the page picker of the `document` profile (#324).
 *
 * Plain DOM: it lives outside the component tree (it is positioned against the
 * caret) and ProseMirror's plugin drives it. The focus never leaves the editor,
 * so the list is announced with `aria-activedescendant` on the textbox, not by
 * moving focus.
 */

/** What a row shows: a label and, under it, a hint. */
export type SuggestionOption = { label: string; hint?: string };

export type SuggestionLabels = { list: string; empty: string };

const listStyles = [
	'fixed z-50 max-h-64 w-72 overflow-y-auto rounded-[var(--radius-md)] border',
	'border-[var(--border-strong)] bg-[var(--surface-1)] p-1 shadow-md'
].join(' ');
const optionStyles =
	'flex cursor-pointer flex-col rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--ink)] aria-selected:bg-[var(--surface-2)]';
const hintStyles = 'text-xs text-[var(--ink-muted)]';
const emptyStyles = 'px-2 py-1 text-sm text-[var(--ink-muted)]';

/**
 * `toCommand` turns the chosen item into what the suggestion's `command` takes
 * (the mention node's attributes, the page to link).
 */
export function suggestionPopup<Item extends SuggestionOption, Command>(
	labels: SuggestionLabels,
	listId: string,
	toCommand: (item: Item) => Command
) {
	let element: HTMLDivElement | null = null;
	let current: SuggestionProps<Item, Command> | null = null;
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
		if (item) current?.command(toCommand(item));
	}

	return {
		onStart(props: SuggestionProps<Item, Command>) {
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
		onUpdate(props: SuggestionProps<Item, Command>) {
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
