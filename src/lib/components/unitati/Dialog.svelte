<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The short-task dialog shape (issue #100, ADR 0020): one to three fields
	 * and a single primary action — "new category", "edit model" — never a
	 * form with its own nested subflow (that is a full page) or a change to an
	 * existing record's broader context (that is a `Sheet`). Composed directly
	 * around shadcn-svelte's vendored `ui/dialog` primitives (bits-ui
	 * underneath), the same way `ConfirmDialog` composes `ui/alert-dialog`
	 * instead of reaching for `ui/dialog/dialog-content.svelte`'s own default
	 * chrome, so this dialog carries the app's own typography and radius
	 * grammar instead of shadcn's defaults.
	 *
	 * Unlike `ConfirmDialog`, this component does not own a footer or a
	 * confirm button: `children` is the whole `<form>`, including its own
	 * Guardar/Cancelar row, because a create/edit form already knows its own
	 * submit label and the caller already has a `use:enhance` shape for it.
	 * The one thing this component owns is closing: pending blocks Escape and
	 * the overlay the same way `ConfirmDialog`'s does, so a slow network never
	 * leaves the caller unsure whether the dialog closed because the save
	 * succeeded or because a stray keypress raced the response.
	 */
	export const dialog = tv({
		slots: {
			overlay: 'fixed inset-0 z-50 bg-[var(--scrim)]',
			content: [
				'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2*var(--space-4))] max-w-[480px]',
				'-translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[var(--border)]',
				'bg-[var(--surface-1)] p-[var(--space-5)] shadow-[var(--shadow-lg)] outline-none',
				// `.ut-scrollbar` (ADR 0015 addendum, #96): same native, thin
				// scrollbar styling as `Sheet`'s own scroll region.
				'ut-scrollbar max-h-[calc(100dvh-2*var(--space-6))] overflow-y-auto overscroll-contain'
			],
			title: 'text-base font-semibold text-[var(--ink)]',
			description: 'mt-[var(--space-2)] text-sm leading-[22px] text-[var(--ink-muted)]'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import CloseButton from './CloseButton.svelte';

	interface Props {
		/** The caller owns this, same as `ConfirmDialog`'s own `open`. */
		open: boolean;
		/** Fired when Escape or an outside click wants to close it — never while `pending`. */
		onOpenChange: (open: boolean) => void;
		title: string;
		description?: string;
		/**
		 * `true` disables Escape and the overlay the same way `ConfirmDialog`'s
		 * `pending` does. The caller still owns its own submit button's disabled
		 * state and label inside `children`.
		 */
		pending?: boolean;
		/** The whole form: fields, errors, and its own Guardar/Cancelar row. */
		children: Snippet;
		class?: string;
	}

	let {
		open,
		onOpenChange,
		title,
		description,
		pending = false,
		children,
		class: className
	}: Props = $props();

	const styles = dialog();

	function handleOpenChange(next: boolean) {
		if (pending && !next) return;
		onOpenChange(next);
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class={styles.overlay()} />
		<Dialog.Content class={styles.content({ class: className })} showCloseButton={false}>
			<Dialog.Title class={styles.title()}>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class={styles.description()}>{description}</Dialog.Description>
			{/if}

			<div class="mt-[var(--space-4)]">
				{@render children()}
			</div>

			<!-- The vendored close button's name is English (ADR 0008); this one is Spanish. -->
			<CloseButton kind="dialog" class="absolute top-2 right-2" />
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
