<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The "Attachments" panel of a project or a task: the files it holds, and for
	 * whoever may manage it, the control to add more and to remove one. The chips,
	 * the drag-and-drop and the client-side limit checks are the composer's (#223),
	 * through the same `addAttachments`; the server enforces the same limits
	 * regardless.
	 */
	export const recordAttachments = tv({
		slots: {
			list: 'divide-y divide-[var(--border)]',
			row: 'flex items-center gap-[var(--space-3)] py-[var(--space-2)]',
			file: 'min-w-0 flex-1',
			name: 'block truncate text-sm font-medium text-[var(--brand)] hover:underline',
			meta: 'text-caption text-[var(--ink-muted)]',
			empty: 'text-sm text-[var(--ink-muted)]',
			form: 'mt-[var(--space-3)] space-y-[var(--space-2)]',
			bar: 'flex flex-wrap items-center gap-[var(--space-2)]',
			chips: 'flex flex-wrap gap-[var(--space-2)]',
			chip: [
				'inline-flex max-w-full items-center gap-[var(--space-1)] rounded-[var(--radius-full)]',
				'border border-[var(--border)] bg-[var(--surface-2)] py-0.5 pr-0.5 pl-[var(--space-3)] text-xs'
			],
			chipName: 'min-w-0 max-w-[16rem] truncate font-medium text-[var(--ink)]',
			chipSize: 'shrink-0 text-[var(--ink-muted)]',
			chipRemove: [
				'inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-full)]',
				'text-[var(--ink-muted)] hover:bg-[var(--border)] hover:text-[var(--ink)]'
			],
			drop: 'rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-[var(--space-2)]',
			error: 'text-small text-[var(--danger)]'
		},
		variants: {
			dragging: {
				true: { drop: 'border-[var(--brand)] bg-[var(--surface-2)]' }
			}
		}
	});
</script>

<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { enhance } from '$app/forms';
	import {
		addAttachments,
		formatBytes,
		MAX_ATTACHMENT_BYTES,
		MAX_ATTACHMENTS_PER_COMMENT
	} from '#lib/domain/attachments.js';
	import { m } from '#lib/paraglide/messages.js';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { confirmSubmit } from './confirm-submit.js';
	import WorkPanel from './WorkPanel.svelte';

	interface Item {
		id: string;
		filename: string;
		contentType: string;
		byteSize: number;
	}

	interface Props {
		items: Item[];
		/** Where a file is served, without the id: `/task-attachments`. */
		downloadBase: string;
		/** Whether the viewer may add and remove; false hides both, and the list stays. */
		canManage: boolean;
		/** Form action that adds, e.g. `?/addAttachments`. */
		addAction?: string;
		/** Form action that removes, posted with the id as `attachmentId`. */
		removeAction?: string;
		/** The last refusal of an add. */
		uploadError?: string;
		/** The last refusal of a remove. */
		removeError?: string;
	}

	let {
		items,
		downloadBase,
		canManage,
		addAction = '?/addAttachments',
		removeAction = '?/removeAttachment',
		uploadError,
		removeError
	}: Props = $props();

	const uid = $props.id();
	const inputId = `attachments-files-${uid}`;
	let files = $state<File[]>([]);
	let dragging = $state(false);
	let selectionError = $state('');
	let uploading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	const styles = $derived(recordAttachments({ dragging }));
	// `dragenter`/`dragleave` also fire for every child the pointer crosses.
	let dragDepth = 0;

	let confirming = $state<string | null>(null);
	let pendingId = $state<string | null>(null);
	const removing = $derived(items.find((item) => item.id === confirming));

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
			selectionError = m.composer_attach_too_large({
				names: result.tooLarge.map((file) => file.name).join(', '),
				max: MAX_ATTACHMENT_BYTES / 1024 / 1024
			});
		} else if (result.overflow.length > 0) {
			selectionError = m.attachments_too_many_selected({ max: MAX_ATTACHMENTS_PER_COMMENT });
		} else {
			selectionError = '';
		}
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		selectionError = '';
		syncInput();
	}

	function onPick() {
		// The picker replaces the input's list; fold it into the selection instead.
		const picked = Array.from(fileInput?.files ?? []);
		const kept = files;
		files = [];
		addFiles([...kept, ...picked]);
	}

	const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true;

	function ondragenter(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		dragDepth += 1;
		dragging = true;
	}

	function ondragover(event: DragEvent) {
		// Without this the browser navigates to the dropped file.
		if (hasFiles(event)) event.preventDefault();
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
</script>

<WorkPanel heading={m.attachments_heading()}>
	{#if items.length === 0}
		<p class={styles.empty()}>{m.attachments_none()}</p>
	{:else}
		<ul class={styles.list()} aria-label={m.attachments_list_label()}>
			{#each items as item (item.id)}
				<li class={styles.row()}>
					<div class={styles.file()}>
						<a
							class={styles.name()}
							href="{downloadBase}/{item.id}"
							download
							aria-label={m.attachments_download({ filename: item.filename })}
							title={item.filename}
						>
							{item.filename}
						</a>
						<span class={styles.meta()}>{formatBytes(item.byteSize)} · {item.contentType}</span>
					</div>
					{#if canManage}
						<Button
							type="button"
							size="sm"
							variant="ghost"
							aria-label={m.attachments_remove_button({ filename: item.filename })}
							onclick={() => (confirming = item.id)}
						>
							<Trash2 class="size-4" aria-hidden="true" />
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canManage}
		<form
			method="POST"
			action={addAction}
			enctype="multipart/form-data"
			class={styles.form()}
			{ondragenter}
			{ondragover}
			{ondragleave}
			{ondrop}
			use:enhance={() => {
				uploading = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					uploading = false;
					if (result.type === 'success') {
						files = [];
						selectionError = '';
						syncInput();
					}
				};
			}}
		>
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

			{#if selectionError}
				<p class={styles.error()} role="alert">{selectionError}</p>
			{/if}
			{#if uploadError}
				<p class={styles.error()} role="alert">{uploadError}</p>
			{/if}

			<div class={styles.bar()}>
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
				<Button
					type="button"
					size="sm"
					variant="secondary"
					aria-controls={inputId}
					onclick={() => fileInput?.click()}
				>
					<Paperclip class="size-4" aria-hidden="true" />
					{m.composer_attach_button()}
				</Button>
				<Button type="submit" size="sm" busy={uploading} disabled={files.length === 0}>
					{m.attachments_upload_submit()}
				</Button>
				<span class={styles.meta()}>{m.ticket_form_attachments_hint()}</span>
			</div>
		</form>

		<ConfirmDialog
			open={removing !== undefined}
			onOpenChange={(next) => {
				if (!next) confirming = null;
			}}
			title={m.attachments_remove_title()}
			description={m.attachments_remove_description({ filename: removing?.filename ?? '' })}
			confirmLabel={m.attachments_remove_confirm()}
			pending={pendingId !== null}
			error={confirming ? removeError : null}
		>
			{#snippet action(confirm)}
				<form
					method="POST"
					action={removeAction}
					use:enhance={confirmSubmit({
						onPending: (pending) => (pendingId = pending ? confirming : null),
						onSettled: (succeeded) => {
							if (succeeded) confirming = null;
						}
					})}
				>
					<input type="hidden" name="attachmentId" value={confirming ?? ''} />
					{@render confirm()}
				</form>
			{/snippet}
		</ConfirmDialog>
	{/if}
</WorkPanel>
