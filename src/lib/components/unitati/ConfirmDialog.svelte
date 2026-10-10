<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The shared "are you sure?" shell (#99), composed around shadcn-svelte's
	 * vendored `ui/alert-dialog` (ADR 0011: `ui/` is never hand-edited, only
	 * composed — the same way `AppShell` reaches the mobile drawer through
	 * `ui/sheet`'s `Sheet.Root`/`Sheet.Content`, not `bits-ui` directly). It owns
	 * the chrome a browser `confirm()` cannot give: app typography and radius,
	 * translated copy, default focus on Cancel, Escape-to-cancel, and focus
	 * return to whatever opened it. It never submits anything itself — `action`
	 * wraps the caller's real `<form method="POST">`, so the page still works
	 * without JS and a slow network never leaves the user unsure whether the
	 * dialog closed because it succeeded or because a click raced the response.
	 */
	export const confirmDialog = tv({
		slots: {
			overlay: 'fixed inset-0 z-50 bg-[var(--scrim)]',
			content: [
				'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2*var(--space-4))] max-w-[420px]',
				'-translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[var(--border)]',
				'bg-[var(--surface-1)] p-[var(--space-5)] shadow-[var(--shadow-lg)] outline-none'
			],
			title: 'text-base font-semibold text-[var(--ink)]',
			description: 'mt-[var(--space-2)] text-sm leading-[22px] text-[var(--ink-muted)]',
			error: 'mt-[var(--space-3)] text-[13px] leading-[18px] text-[var(--danger)]',
			footer: 'mt-[var(--space-5)] flex flex-wrap justify-end gap-[var(--space-2)]'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { button } from './Button.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/**
		 * The caller owns this, same as `Sheet.Root`'s own `open`: a trigger
		 * button sets the id it is confirming, this component only ever asks to
		 * go back to closed through `onOpenChange`. One dialog per call site, so
		 * a plain callback reads better than a per-row `bind:open`.
		 */
		open: boolean;
		/** Fired when Cancel, Escape or an outside click wants to close it — never while `pending`. */
		onOpenChange: (open: boolean) => void;
		title: string;
		/** Names the specific record — "Eliminar HP EliteBook", never a generic "¿Estás seguro?". */
		description: string;
		confirmLabel: string;
		cancelLabel?: string;
		/** `true` paints the confirm button `danger`; a non-destructive confirm (rare — most of those need no dialog at all) can pass `false`. */
		danger?: boolean;
		/**
		 * The caller sets this from its own `use:enhance` pending state. True
		 * disables Cancel and Confirm, blocks Escape and the overlay, and swaps
		 * the confirm button's label: an in-flight mutation cannot be discarded
		 * by a stray keypress or doubled by a second click, only resolved by the
		 * server responding.
		 */
		pending?: boolean;
		/** Shown under the description after a server failure; the dialog stays open and the record stays named. */
		error?: string | null;
		/**
		 * The real POST form. Receives the confirm button as a snippet so this
		 * component still owns its label and tone — place it inside the form,
		 * wherever the hidden fields make sense.
		 */
		action: Snippet<[Snippet]>;
	}

	let {
		open,
		onOpenChange,
		title,
		description,
		confirmLabel,
		cancelLabel,
		danger = true,
		pending = false,
		error = null,
		action
	}: Props = $props();

	const styles = confirmDialog();

	let cancelRef: HTMLElement | null = $state(null);

	function handleOpenChange(next: boolean) {
		if (pending && !next) return;
		onOpenChange(next);
	}

	/** Radix/bits-ui's own default is the content container; the spec asks for Cancel. */
	function focusCancel(event: Event) {
		event.preventDefault();
		cancelRef?.focus();
	}
</script>

{#snippet confirmButton()}
	<button
		type="submit"
		disabled={pending}
		class={button({ variant: danger ? 'danger' : 'primary', size: 'sm' })}
	>
		{pending ? m.form_saving() : confirmLabel}
	</button>
{/snippet}

<AlertDialog.Root {open} onOpenChange={handleOpenChange}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class={styles.overlay()} />
		<AlertDialog.Content class={styles.content()} onOpenAutoFocus={focusCancel}>
			<AlertDialog.Title class={styles.title()}>{title}</AlertDialog.Title>
			<AlertDialog.Description class={styles.description()}>
				{description}
			</AlertDialog.Description>

			{#if error}
				<p class={styles.error()} role="alert">{error}</p>
			{/if}

			<div class={styles.footer()}>
				<AlertDialog.Cancel
					bind:ref={cancelRef}
					disabled={pending}
					class={button({ variant: 'ghost', size: 'sm' })}
				>
					{cancelLabel ?? m.form_cancel()}
				</AlertDialog.Cancel>
				{@render action(confirmButton)}
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
