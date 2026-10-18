<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The contextual-edit shape (issue #100, ADR 0020): editing a record
	 * already open in a list or its own detail page, without navigating away
	 * from it. Composed around `ui/sheet`'s own `Sheet.Root`/`Sheet.Content`
	 * the same way `AppShell`'s mobile drawer already does (ADR 0011) — not
	 * `ui/dialog`'s primitives directly, and not `unitati/Dialog.svelte`,
	 * which this ADR scopes to one-to-three-field creates. Right-anchored,
	 * `--size-control-lg`-ish 760px ceiling on wide desktop, full width on
	 * mobile, per the issue's own "approximately 720–840px … full-width on
	 * mobile" — wider than shadcn's own `sm:max-w-sm` default, which
	 * `Sheet.Content`'s `class` override replaces rather than extends.
	 *
	 * Unlike `Dialog`, this owns no footer of its own: `children` is the
	 * whole `<form>`, the same reasoning as `Dialog` — a form already knows
	 * its own submit label, its own sticky-footer layout if it needs one (a
	 * `flex h-full min-h-0 flex-col` form with a `flex-1 overflow-y-auto`
	 * fields wrapper and a `shrink-0` button row achieves that inside the
	 * area this component gives it), and its own `use:enhance` shape.
	 */
	export const sheet = tv({
		slots: {
			content: [
				'flex h-full w-full flex-col gap-0 border-l border-[var(--border)]',
				'bg-[var(--surface-1)] p-0 sm:w-[85%] sm:max-w-[760px]'
			],
			header: 'shrink-0 border-b border-[var(--border)] px-[var(--space-5)] py-[var(--space-4)]',
			title: 'text-title-3 text-[var(--ink)]',
			description: 'mt-[var(--space-1)] text-sm text-[var(--ink-muted)]',
			// `.ut-scrollbar` (ADR 0015 addendum, #96): the app's own thin,
			// native scrollbar styling, the same one `AppShell`'s `main` and
			// nav regions use — never a JS overlay scrollbar.
			body: 'ut-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-[var(--space-5)] pb-[max(var(--space-5),env(safe-area-inset-bottom))]'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import CloseButton from './CloseButton.svelte';

	interface Props {
		/** The caller owns this, same as `Dialog`'s own `open`. */
		open: boolean;
		/**
		 * Fired when Escape, the overlay or the close button wants to close
		 * it — never while `pending`. A dirty form is the caller's own
		 * decision, not this component's: gate the actual close behind a
		 * `ConfirmDialog` ("discard changes?") in `onOpenChange` instead of
		 * closing immediately, the same way a destructive action does.
		 */
		onOpenChange: (open: boolean) => void;
		title: string;
		description?: string;
		/** Blocks Escape, the overlay and the close button, same as `Dialog`'s `pending`. */
		pending?: boolean;
		/** The whole form: its own scroll region and its own action row. */
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

	const styles = sheet();

	function handleOpenChange(next: boolean) {
		if (pending && !next) return;
		onOpenChange(next);
	}
</script>

<Sheet.Root {open} onOpenChange={handleOpenChange}>
	<Sheet.Content side="right" class={styles.content({ class: className })} showCloseButton={false}>
		<div class={styles.header()}>
			<Sheet.Title class={styles.title()}>{title}</Sheet.Title>
			{#if description}
				<Sheet.Description class={styles.description()}>{description}</Sheet.Description>
			{/if}
		</div>
		<div class={styles.body()}>
			{@render children()}
		</div>
		<CloseButton kind="sheet" class="absolute top-3 right-3" />
	</Sheet.Content>
</Sheet.Root>
