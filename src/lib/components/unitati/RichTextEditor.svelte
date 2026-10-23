<script lang="ts" module>
	import { tv } from '#lib/tv.js';
	import { prose } from './prose.js';

	/**
	 * The rich text editor (ADR 0030): a toolbar over a Tiptap surface whose
	 * value is **markdown**. Used by the ticket composer and descriptions; ticket
	 * text can also @mention people (#303).
	 *
	 * The `profile` says what the text may contain (`domain/markdown-profiles.ts`),
	 * the same profile the server renders it with. `document` (knowledge pages,
	 * #324) adds headings h2–h4, tables, the horizontal rule and a page picker,
	 * drops mentions, and grows with its content instead of scrolling.
	 */
	export const richTextEditor = tv({
		slots: {
			root: [
				'relative rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)]',
				// Same treatment as a text field (#216): the border turns `--focus`, plus a faint halo.
				// The transparent outline is the forced-colors fallback.
				'focus-within:border-[var(--focus)] focus-within:outline focus-within:outline-1 focus-within:outline-transparent',
				'focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--focus)_12%,transparent)]'
			],
			toolbar: 'flex flex-wrap items-center gap-1 border-b border-[var(--border)] p-1',
			tool: [
				'inline-flex size-[var(--size-control-sm)] items-center justify-center',
				'rounded-[var(--radius-sm)] text-[var(--ink)] hover:bg-[var(--surface-2)]',
				'aria-pressed:bg-[var(--surface-2)] aria-pressed:shadow-[inset_0_0_0_1px_var(--border-strong)]',
				'disabled:cursor-not-allowed disabled:opacity-45'
			],
			surface: 'max-h-64 min-h-[76px] overflow-y-auto',
			separator: 'mx-1 h-5 w-px bg-[var(--border)]',
			select: [
				'h-[var(--size-control-sm)] rounded-[var(--radius-sm)] border border-[var(--border)]',
				'bg-[var(--surface-1)] px-1 text-xs text-[var(--ink)]',
				'disabled:cursor-not-allowed disabled:opacity-45'
			],
			content: [
				'min-h-[76px] p-[var(--space-3)] outline-none [&_.ProseMirror]:outline-none',
				'[&_.is-editor-empty:first-child::before]:pointer-events-none',
				'[&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0',
				'[&_.is-editor-empty:first-child::before]:text-[var(--ink-muted)]',
				'[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
				...prose
			],
			link: [
				'absolute top-full left-0 z-10 mt-1 flex items-center gap-1 rounded-[var(--radius-md)]',
				'border border-[var(--border-strong)] bg-[var(--surface-1)] p-1 shadow-md'
			],
			linkInput: [
				'h-[var(--size-control-sm)] w-56 rounded-[var(--radius-sm)] border border-[var(--border)]',
				'bg-[var(--surface-1)] px-2 text-xs text-[var(--ink)]'
			],
			linkAction: [
				'h-[var(--size-control-sm)] rounded-[var(--radius-sm)] px-2 text-xs font-semibold',
				'text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			counter: 'px-[var(--space-3)] pb-[var(--space-1)] text-right text-xs text-[var(--ink-muted)]'
		},
		variants: {
			over: {
				true: { counter: 'font-semibold text-[var(--danger)]' }
			},
			disabled: {
				true: { root: 'opacity-60' }
			},
			profile: {
				comment: {},
				// A page is long: the surface grows with it and the page scrolls.
				document: { surface: 'max-h-none min-h-80', content: 'min-h-80' }
			}
		}
	});
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import { TableKit } from '@tiptap/extension-table';
	import { Markdown } from '@tiptap/markdown';
	import StarterKit from '@tiptap/starter-kit';
	import BetweenHorizontalEnd from '@lucide/svelte/icons/between-horizontal-end';
	import BetweenVerticalEnd from '@lucide/svelte/icons/between-vertical-end';
	import Bold from '@lucide/svelte/icons/bold';
	import Code from '@lucide/svelte/icons/code';
	import FileSymlink from '@lucide/svelte/icons/file-symlink';
	import Grid2x2X from '@lucide/svelte/icons/grid-2x2-x';
	import Italic from '@lucide/svelte/icons/italic';
	import LinkIcon from '@lucide/svelte/icons/link';
	import List from '@lucide/svelte/icons/list';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Quote from '@lucide/svelte/icons/quote';
	import SeparatorHorizontal from '@lucide/svelte/icons/separator-horizontal';
	import SquareCode from '@lucide/svelte/icons/square-code';
	import TableIcon from '@lucide/svelte/icons/table';
	import TableColumnsSplit from '@lucide/svelte/icons/table-columns-split';
	import TableRowsSplit from '@lucide/svelte/icons/table-rows-split';
	import {
		DOCUMENT_HEADING_LEVELS,
		type DocumentHeadingLevel,
		type MarkdownProfile
	} from '#lib/domain/markdown-profiles.js';
	import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
	import { m } from '#lib/paraglide/messages.js';
	import { mentionExtension, type MentionSource } from './mention-extension.js';
	import { PAGE_LINK_TRIGGER, pageLinkExtension, type PageSource } from './page-link-extension.js';

	interface Props {
		/** Name of the hidden input that carries the markdown in a form post. */
		name: string;
		/** The markdown. Bindable: reassigning it from outside (clearing after a send) resets the editor. */
		value?: string;
		placeholder?: string;
		/** Accessible name of the editing surface; visually hidden. */
		label: string;
		maxLength?: number;
		disabled?: boolean;
		/** Called on Cmd/Ctrl+Enter. */
		onsubmitshortcut?: () => void;
		/**
		 * Who `@` may offer, asked as the person types (#303). The server decides
		 * who may be named; without a source `@` is plain text, which is what task
		 * and project descriptions get.
		 */
		mentionSource?: MentionSource;
		/** What the text may contain; the server renders it with the same profile. */
		profile?: MarkdownProfile;
		/**
		 * The pages the `document` picker (`[[` and its button) offers, asked as
		 * the person types. The server decides which pages may be linked; without
		 * a source there is no picker, as `@` without a `mentionSource`.
		 */
		pageSource?: PageSource;
		class?: string;
	}

	let {
		name,
		value = $bindable(''),
		placeholder = '',
		label,
		maxLength = RICH_TEXT_MAX_LENGTH,
		disabled = false,
		onsubmitshortcut,
		mentionSource,
		profile = 'comment',
		pageSource,
		class: className
	}: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined = $state.raw();
	/** Bumped on every transaction so the toolbar's `aria-pressed` follows the selection. */
	let tick = $state(0);

	let linkOpen = $state(false);
	let linkUrl = $state('');

	const styles = $derived(richTextEditor({ over: value.length > maxLength, disabled, profile }));
	const isDocument = $derived(profile === 'document');
	const counterVisible = $derived(value.length > maxLength * 0.9);
	const over = $derived(value.length > maxLength);

	onMount(() => {
		// The profile is fixed for the life of the editor: it decides the schema.
		const asDocument = profile === 'document';
		const instance = new Editor({
			element: host,
			editable: !disabled,
			content: value,
			contentType: 'markdown',
			extensions: [
				// Only what the sanitiser allows for the profile (ADR 0030): no strike,
				// underline or images ever; headings and rules in a document only.
				StarterKit.configure({
					heading: asDocument ? { levels: [...DOCUMENT_HEADING_LEVELS] } : false,
					strike: false,
					underline: false,
					horizontalRule: asDocument ? {} : false,
					link: {
						openOnClick: false,
						HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
					}
				}),
				Markdown,
				...(asDocument ? [TableKit.configure({ table: { resizable: false } })] : []),
				...(asDocument && pageSource
					? [
							pageLinkExtension(pageSource, {
								list: m.richtext_page_link_list(),
								empty: m.richtext_page_link_empty()
							})
						]
					: []),
				// Page bodies carry no mentions (ADR 0031 addendum §2).
				...(mentionSource && !asDocument
					? [
							mentionExtension(mentionSource, {
								list: m.notifications_mention_label(),
								empty: m.notifications_mention_empty()
							})
						]
					: [])
			],
			editorProps: {
				attributes: {
					role: 'textbox',
					'aria-multiline': 'true',
					'aria-label': label
				},
				handleKeyDown: (_view, event) => {
					if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						onsubmitshortcut?.();
						return true;
					}
					return false;
				}
			},
			onTransaction: () => {
				tick++;
			},
			onUpdate: ({ editor: current }) => {
				value = current.getMarkdown();
			}
		});
		editor = instance;
		return () => {
			instance.destroy();
			editor = undefined;
		};
	});

	// A reassignment from outside (the composer empties the box on send) resets
	// the document; edits made here already equal `value`, so they are skipped.
	$effect(() => {
		const next = value;
		if (editor && next !== editor.getMarkdown()) {
			editor.commands.setContent(next, { emitUpdate: false, contentType: 'markdown' });
		}
	});

	$effect(() => {
		editor?.setEditable(!disabled);
	});

	// Placeholder: ProseMirror has no native one, so the empty first paragraph
	// carries it as an attribute that the stylesheet above prints.
	$effect(() => {
		void tick;
		if (!editor) return;
		const first = editor.view.dom.firstElementChild;
		if (!first) return;
		const empty = editor.isEmpty;
		first.classList.toggle('is-editor-empty', empty);
		if (empty && placeholder) first.setAttribute('data-placeholder', placeholder);
		else first.removeAttribute('data-placeholder');
	});

	function active(mark: string): boolean {
		void tick;
		return editor?.isActive(mark) ?? false;
	}

	/** The heading level under the caret, or `0` for body text. */
	const headingLevel = $derived.by((): number => {
		void tick;
		return DOCUMENT_HEADING_LEVELS.find((level) => editor?.isActive('heading', { level })) ?? 0;
	});

	const inTable = $derived.by(() => {
		void tick;
		return editor?.isActive('table') ?? false;
	});

	function setBlock(event: Event) {
		const level = Number((event.currentTarget as HTMLSelectElement).value);
		const chain = editor?.chain().focus();
		if (!chain) return;
		if (level === 0) chain.setParagraph().run();
		else chain.setHeading({ level: level as DocumentHeadingLevel }).run();
	}

	/** Types the trigger, which opens the picker where the caret is. */
	function openPagePicker() {
		editor?.chain().focus().insertContent(PAGE_LINK_TRIGGER).run();
	}

	function openLink() {
		if (!editor) return;
		linkUrl = (editor.getAttributes('link').href as string | undefined) ?? '';
		linkOpen = true;
	}

	function applyLink(event: Event) {
		event.preventDefault();
		if (!editor) return;
		let href = linkUrl.trim();
		if (href === '') return removeLink();
		if (!/^(https?:\/\/|mailto:)/i.test(href)) {
			href = /^[^\s@]+@[^\s@]+$/.test(href) ? `mailto:${href}` : `https://${href}`;
		}
		const chain = editor.chain().focus();
		if (editor.state.selection.empty && !editor.isActive('link')) {
			chain
				.insertContent({
					type: 'text',
					text: linkUrl.trim(),
					marks: [{ type: 'link', attrs: { href } }]
				})
				.run();
		} else {
			chain.extendMarkRange('link').setLink({ href }).run();
		}
		linkOpen = false;
	}

	function removeLink() {
		editor?.chain().focus().extendMarkRange('link').unsetLink().run();
		linkOpen = false;
	}

	function closeLink() {
		linkOpen = false;
		editor?.commands.focus();
	}

	type Tool = { id: string; icon: typeof Bold; label: () => string; run: () => unknown };

	const tools: Tool[] = [
		{
			id: 'bold',
			icon: Bold,
			label: m.richtext_bold,
			run: () => editor?.chain().focus().toggleBold().run()
		},
		{
			id: 'italic',
			icon: Italic,
			label: m.richtext_italic,
			run: () => editor?.chain().focus().toggleItalic().run()
		},
		{
			id: 'bulletList',
			icon: List,
			label: m.richtext_bullet_list,
			run: () => editor?.chain().focus().toggleBulletList().run()
		},
		{
			id: 'orderedList',
			icon: ListOrdered,
			label: m.richtext_ordered_list,
			run: () => editor?.chain().focus().toggleOrderedList().run()
		},
		{ id: 'link', icon: LinkIcon, label: m.richtext_link, run: openLink },
		{
			id: 'code',
			icon: Code,
			label: m.richtext_code,
			run: () => editor?.chain().focus().toggleCode().run()
		},
		{
			id: 'codeBlock',
			icon: SquareCode,
			label: m.richtext_code_block,
			run: () => editor?.chain().focus().toggleCodeBlock().run()
		},
		{
			id: 'blockquote',
			icon: Quote,
			label: m.richtext_quote,
			run: () => editor?.chain().focus().toggleBlockquote().run()
		}
	];

	const pageLinkTool: Tool = {
		id: 'pageLink',
		icon: FileSymlink,
		label: m.richtext_page_link,
		run: openPagePicker
	};

	/** What a document adds after the shared tools; the page picker only with a source. */
	const documentTools: Tool[] = $derived([
		...(pageSource ? [pageLinkTool] : []),
		{
			id: 'horizontalRule',
			icon: SeparatorHorizontal,
			label: m.richtext_horizontal_rule,
			run: () => editor?.chain().focus().setHorizontalRule().run()
		},
		{
			id: 'table',
			icon: TableIcon,
			label: m.richtext_table_insert,
			run: () =>
				editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
		}
	]);

	/** Shown while the caret is inside a table. */
	const tableTools: Tool[] = [
		{
			id: 'addRow',
			icon: BetweenHorizontalEnd,
			label: m.richtext_table_add_row,
			run: () => editor?.chain().focus().addRowAfter().run()
		},
		{
			id: 'addColumn',
			icon: BetweenVerticalEnd,
			label: m.richtext_table_add_column,
			run: () => editor?.chain().focus().addColumnAfter().run()
		},
		{
			id: 'deleteRow',
			icon: TableRowsSplit,
			label: m.richtext_table_delete_row,
			run: () => editor?.chain().focus().deleteRow().run()
		},
		{
			id: 'deleteColumn',
			icon: TableColumnsSplit,
			label: m.richtext_table_delete_column,
			run: () => editor?.chain().focus().deleteColumn().run()
		},
		{
			id: 'deleteTable',
			icon: Grid2x2X,
			label: m.richtext_table_delete,
			run: () => editor?.chain().focus().deleteTable().run()
		}
	];
</script>

{#snippet toolButton(tool: Tool, pressed: boolean | undefined)}
	<button
		type="button"
		class={styles.tool()}
		aria-label={tool.label()}
		title={tool.label()}
		aria-pressed={pressed}
		disabled={disabled || !editor}
		onmousedown={(event) => event.preventDefault()}
		onclick={tool.run}
	>
		<tool.icon class="size-4" aria-hidden="true" />
	</button>
{/snippet}

<div class={styles.root({ class: className })}>
	<div class={styles.toolbar()} role="toolbar" aria-label={m.richtext_toolbar()}>
		{#if isDocument}
			<select
				class={styles.select()}
				aria-label={m.richtext_block_style()}
				value={String(headingLevel)}
				disabled={disabled || !editor}
				onchange={setBlock}
			>
				<option value="0">{m.richtext_block_paragraph()}</option>
				<option value="2">{m.richtext_block_heading_2()}</option>
				<option value="3">{m.richtext_block_heading_3()}</option>
				<option value="4">{m.richtext_block_heading_4()}</option>
			</select>
			<span class={styles.separator()} aria-hidden="true"></span>
		{/if}
		{#each tools as tool (tool.id)}
			{@render toolButton(tool, active(tool.id))}
		{/each}
		{#if isDocument}
			<span class={styles.separator()} aria-hidden="true"></span>
			{#each documentTools as tool (tool.id)}
				{@render toolButton(tool, undefined)}
			{/each}
			{#if inTable}
				<span class={styles.separator()} aria-hidden="true"></span>
				{#each tableTools as tool (tool.id)}
					{@render toolButton(tool, undefined)}
				{/each}
			{/if}
		{/if}
	</div>

	{#if linkOpen}
		<form class={styles.link()} onsubmit={applyLink}>
			<input
				type="text"
				class={styles.linkInput()}
				aria-label={m.richtext_link_url()}
				placeholder="https://"
				bind:value={linkUrl}
				onkeydown={(event) => event.key === 'Escape' && closeLink()}
			/>
			<button type="submit" class={styles.linkAction()}>{m.richtext_link_apply()}</button>
			{#if editor?.isActive('link')}
				<button type="button" class={styles.linkAction()} onclick={removeLink}>
					{m.richtext_link_remove()}
				</button>
			{/if}
			<button type="button" class={styles.linkAction()} onclick={closeLink}>
				{m.richtext_link_cancel()}
			</button>
		</form>
	{/if}

	<div class={styles.surface()}>
		<div bind:this={host} class={styles.content()}></div>
	</div>

	{#if counterVisible}
		<p class={styles.counter()} role={over ? 'alert' : undefined}>
			{over
				? m.richtext_over_limit({ max: maxLength })
				: m.richtext_counter({ count: value.length, max: maxLength })}
		</p>
	{/if}

	<input type="hidden" {name} {value} />
</div>
