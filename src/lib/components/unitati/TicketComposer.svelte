<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The `.ut-composer`: a box at the end of the thread with the rich text editor above
	 * and a bar below it — the internal-note toggle, the attach control, and the
	 * send button with its shortcut.
	 */
	export const composer = tv({
		slots: {
			root: 'rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-1)]',
			// The editor sits flush inside the box: the box owns the border.
			editor: 'rounded-b-none rounded-t-[var(--radius-lg)] border-0 bg-transparent',
			bar: 'flex flex-wrap items-center gap-[var(--space-2)] border-t border-[var(--border)] p-[var(--space-2)]',
			toggle: [
				'inline-flex h-[var(--size-control-sm)] items-center rounded-[var(--radius-full)] px-[var(--space-3)]',
				'text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			attach: [
				'inline-flex h-[var(--size-control-sm)] items-center rounded-[var(--radius-full)] px-[var(--space-3)]',
				'text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			chips: 'flex flex-wrap gap-[var(--space-2)] px-[var(--space-2)] pt-[var(--space-2)]',
			chip: [
				'inline-flex max-w-full items-center gap-[var(--space-1)] rounded-[var(--radius-full)]',
				'border border-[var(--border)] bg-[var(--surface-2)] py-0.5 pr-0.5 pl-[var(--space-3)] text-xs'
			],
			chipName: 'min-w-0 max-w-[16rem] truncate font-medium text-[var(--ink)]',
			chipSize: 'shrink-0 text-[var(--ink-muted)]',
			chipRemove: [
				'inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-full)]',
				'text-[var(--ink-muted)] hover:bg-[var(--surface-3,var(--border))] hover:text-[var(--ink)]'
			],
			drop: 'px-[var(--space-3)] py-[var(--space-2)] text-center text-small font-medium text-[var(--brand)]',
			error: 'px-[var(--space-3)] pb-[var(--space-2)] text-small text-[var(--danger)]'
		},
		variants: {
			dragging: {
				true: { root: 'outline-2 outline-dashed outline-offset-2 outline-[var(--brand)]' }
			},
			internal: {
				true: {
					root: 'border-[var(--warning)] bg-[var(--warning-soft)]',
					toggle:
						'bg-[var(--warning-soft)] text-[var(--warning)] shadow-[inset_0_0_0_1px_var(--warning)]'
				}
			}
		}
	});
</script>

<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		addAttachments,
		formatBytes,
		MAX_ATTACHMENT_BYTES,
		MAX_ATTACHMENTS_PER_COMMENT
	} from '#lib/domain/attachments.js';
	import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
	import Button from './Button.svelte';
	import RichTextEditor from './RichTextEditor.svelte';

	interface Props {
		/** The form action, e.g. `?/reply`. */
		action: string;
		/** Whether the viewer may write internal notes; employees never see the toggle. */
		allowInternal?: boolean;
		/** Shown under the box when the last submission was refused. */
		error?: string;
		/** Files already chosen; only the gallery sets it, to show the chip list and the drop state. */
		initialFiles?: File[];
		/** Renders the drag-over state; only the gallery sets it. */
		initialDragging?: boolean;
		/** Renders an attachment message; only the gallery sets it. */
		initialAttachmentError?: string;
		placeholder?: string;
		class?: string;
		/**
		 * Perceived speed (#89): called the instant this form submits, so the
		 * caller can append a pending copy of the message to its own thread
		 * mirror. Returns the cleanup that removes it again — this component
		 * calls that cleanup itself on `failure`/`error`; a reconciled success
		 * removes it by replacing `items` with the server's own list instead.
		 */
		onOptimisticSend?: (formData: FormData) => () => void;
	}

	let {
		action,
		allowInternal = false,
		error,
		initialFiles = [],
		initialDragging = false,
		initialAttachmentError = '',
		placeholder,
		class: className,
		onOptimisticSend
	}: Props = $props();

	const uid = $props.id();
	const inputId = `composer-files-${uid}`;
	let internal = $state(false);
	let body = $state('');
	let form: HTMLFormElement | undefined = $state();

	let files = $state<File[]>(untrack(() => initialFiles));
	let dragging = $state(untrack(() => initialDragging));
	let attachmentError = $state(untrack(() => initialAttachmentError));
	let fileInput: HTMLInputElement | undefined = $state();
	// `dragenter`/`dragleave` also fire for every child the pointer crosses.
	let dragDepth = 0;

	const styles = $derived(composer({ internal, dragging }));

	/** The hidden input stays the single source the form posts: rebuild its list from `files`. */
	function syncInput() {
		if (!fileInput) return;
		const transfer = new DataTransfer();
		for (const file of files) transfer.items.add(file);
		fileInput.files = transfer.files;
	}

	function addFiles(incoming: File[]) {
		if (incoming.length === 0) return;
		const result = addAttachments(files, incoming);
		files = result.files;
		syncInput();
		if (result.tooLarge.length > 0) {
			attachmentError = m.composer_attach_too_large({
				names: result.tooLarge.map((file) => file.name).join(', '),
				max: MAX_ATTACHMENT_BYTES / 1024 / 1024
			});
		} else if (result.overflow.length > 0) {
			attachmentError = m.composer_attach_too_many({ max: MAX_ATTACHMENTS_PER_COMMENT });
		} else {
			attachmentError = '';
		}
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		attachmentError = '';
		syncInput();
	}

	function onPick() {
		// The picker replaces the input's list; fold it into the selection instead.
		const picked = Array.from(fileInput?.files ?? []);
		const kept = files;
		files = [];
		addFiles([...kept, ...picked]);
	}

	function hasFiles(event: DragEvent) {
		return event.dataTransfer?.types.includes('Files') === true;
	}

	function ondragenter(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		dragDepth += 1;
		dragging = true;
	}

	function ondragover(event: DragEvent) {
		if (!hasFiles(event)) return;
		// Without this the browser navigates to the dropped file.
		event.preventDefault();
	}

	function ondragleave(event: DragEvent) {
		if (!hasFiles(event)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}

	function ondrop(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		dragDepth = 0;
		dragging = false;
		addFiles(Array.from(event.dataTransfer?.files ?? []));
	}

	/** Nothing to send, or too much: the server refuses both, so the box does not offer them. */
	const sendable = $derived(body.trim().length > 0 && body.length <= RICH_TEXT_MAX_LENGTH);

	/** ⌘↵ or Ctrl+↵ sends, as the design system's composer promises. */
	function send() {
		if (sendable) form?.requestSubmit();
	}
</script>

<form
	bind:this={form}
	method="POST"
	{action}
	enctype="multipart/form-data"
	class={styles.root({ class: className })}
	{ondragenter}
	{ondragover}
	{ondragleave}
	{ondrop}
	use:optimisticEnhance={(formData) => {
		const previousBody = body;
		const previousInternal = internal;
		const previousFiles = files;
		const removePending = onOptimisticSend?.(formData);
		// The box empties the instant the message is "sent" — reconciling on
		// success (`update()` inside `optimisticEnhance`) never has to touch
		// it again, so there is no second clear racing a keystroke the
		// visitor already made in the next message.
		body = '';
		internal = false;
		files = [];
		attachmentError = '';
		if (fileInput) fileInput.value = '';
		return () => {
			body = previousBody;
			internal = previousInternal;
			files = previousFiles;
			syncInput();
			removePending?.();
		};
	}}
>
	<RichTextEditor
		name="body"
		class={styles.editor()}
		label={m.composer_label()}
		placeholder={placeholder ??
			(internal ? m.composer_placeholder_internal() : m.composer_placeholder_portal())}
		bind:value={body}
		onsubmitshortcut={send}
	/>

	<input type="hidden" name="visibility" value={internal ? 'internal' : 'public'} />

	{#if files.length > 0}
		<ul class={styles.chips()} aria-label={m.composer_attachments_label()}>
			{#each files as file, index (file)}
				<li class={styles.chip()}>
					<span class={styles.chipName()} title={file.name}>{file.name}</span>
					<span class={styles.chipSize()}>{formatBytes(file.size)}</span>
					<button
						type="button"
						class={styles.chipRemove()}
						aria-label={m.composer_attachment_remove({ name: file.name })}
						onclick={() => removeFile(index)}
					>
						<X class="size-3" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if dragging}
		<p class={styles.drop()}>{m.composer_drop_hint()}</p>
	{/if}

	{#if attachmentError}
		<p class={styles.error()} role="alert">{attachmentError}</p>
	{/if}

	{#if error}
		<p class={styles.error()} role="alert">{error}</p>
	{/if}

	<div class={styles.bar()}>
		{#if allowInternal}
			<button
				type="button"
				class={styles.toggle()}
				aria-pressed={internal}
				onclick={() => (internal = !internal)}
			>
				{m.composer_internal_toggle()}
			</button>
		{/if}

		<input
			bind:this={fileInput}
			id={inputId}
			type="file"
			name="files"
			multiple
			class="sr-only"
			tabindex="-1"
			aria-label={m.composer_attach()}
			onchange={onPick}
		/>
		<button
			type="button"
			class={styles.attach()}
			aria-controls={inputId}
			onclick={() => fileInput?.click()}
		>
			<Paperclip class="mr-1 size-3.5" aria-hidden="true" />
			{m.composer_attach_button()}
		</button>

		<Button type="submit" size="sm" class="ml-auto" disabled={!sendable}>
			{internal ? m.composer_send_internal() : m.composer_send()}
			<span class="text-caption font-normal opacity-80" aria-hidden="true"
				>{m.composer_shortcut()}</span
			>
		</Button>
	</div>
</form>
