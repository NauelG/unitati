<script lang="ts" module>
	import { tv } from '#lib/tv.js';
	import { prose } from './prose.js';

	/**
	 * The rich text editor (ADR 0030): a toolbar over a Tiptap surface whose
	 * value is **markdown**. Used by the ticket composer; project and task
	 * descriptions adopt it next.
	 */
	export const richTextEditor = tv({
		slots: {
			root: [
				'relative rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)]',
				'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]'
			],
			toolbar: 'flex flex-wrap items-center gap-1 border-b border-[var(--border)] p-1',
			tool: [
				'inline-flex size-[var(--size-control-sm)] items-center justify-center',
				'rounded-[var(--radius-sm)] text-[var(--ink)] hover:bg-[var(--surface-2)]',
				'aria-pressed:bg-[var(--surface-2)] aria-pressed:shadow-[inset_0_0_0_1px_var(--border-strong)]',
				'disabled:cursor-not-allowed disabled:opacity-45'
			],
			surface: 'max-h-64 min-h-[76px] overflow-y-auto',
			content: [
				'min-h-[76px] p-[var(--space-3)] outline-none',
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
			}
		}
	});
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import { Markdown } from '@tiptap/markdown';
	import StarterKit from '@tiptap/starter-kit';
	import Bold from '@lucide/svelte/icons/bold';
	import Code from '@lucide/svelte/icons/code';
	import Italic from '@lucide/svelte/icons/italic';
	import LinkIcon from '@lucide/svelte/icons/link';
	import List from '@lucide/svelte/icons/list';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Quote from '@lucide/svelte/icons/quote';
	import SquareCode from '@lucide/svelte/icons/square-code';
	import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
	import { m } from '#lib/paraglide/messages.js';

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
		class: className
	}: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined = $state.raw();
	/** Bumped on every transaction so the toolbar's `aria-pressed` follows the selection. */
	let tick = $state(0);

	let linkOpen = $state(false);
	let linkUrl = $state('');

	const styles = $derived(richTextEditor({ over: value.length > maxLength, disabled }));
	const counterVisible = $derived(value.length > maxLength * 0.9);
	const over = $derived(value.length > maxLength);

	onMount(() => {
		const instance = new Editor({
			element: host,
			editable: !disabled,
			content: value,
			contentType: 'markdown',
			extensions: [
				// Only what the sanitiser allows (ADR 0030): no headings, strike,
				// underline, rules or images.
				StarterKit.configure({
					heading: false,
					strike: false,
					underline: false,
					horizontalRule: false,
					link: {
						openOnClick: false,
						HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
					}
				}),
				Markdown
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

	const tools = [
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
</script>

<div class={styles.root({ class: className })}>
	<div class={styles.toolbar()} role="toolbar" aria-label={m.richtext_toolbar()}>
		{#each tools as tool (tool.id)}
			<button
				type="button"
				class={styles.tool()}
				aria-label={tool.label()}
				title={tool.label()}
				aria-pressed={active(tool.id)}
				disabled={disabled || !editor}
				onmousedown={(event) => event.preventDefault()}
				onclick={tool.run}
			>
				<tool.icon class="size-4" aria-hidden="true" />
			</button>
		{/each}
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
