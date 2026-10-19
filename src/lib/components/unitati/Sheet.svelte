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
	 * Unlike `Dialog`, the caller decides whether this owns the layout:
	 *
	 * - `fields` + `footer` (+ `form`): this renders the `<form>`, the
	 *   scrolling fields region and the fixed action row. The region is padded
	 *   (and pulled back with an equal negative margin, so fields stay aligned
	 *   with the header) because the focus ring is drawn outside a control and
	 *   `overflow-y: auto` clips the x axis too (#218). Forms never build their
	 *   own scroll wrapper.
	 * - `children`: the whole `<form>` is the caller's, with no scroll region or
	 *   ring room from here. Kept for compatibility.
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
			// The ring is 4px outside a control (2px offset + 2px width,
			// `app.css`); `p-1.5` (6px) leaves room for it and `-m-1.5` cancels
			// the shift. Not on `body`, whose own padding must not double up.
			fields: [
				'ut-scrollbar -m-1.5 min-h-0 flex-1 space-y-[var(--space-5)] overflow-y-auto overscroll-contain p-1.5'
			],
			footer: 'mt-[var(--space-4)] shrink-0',
			body: 'ut-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-[var(--space-5)] pb-[max(var(--space-5),env(safe-area-inset-bottom))]'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import CloseButton from './CloseButton.svelte';

	/** What `Sheet` needs to render the `<form>` that wraps `fields` and `footer`. */
	export interface SheetForm {
		action: string;
		method?: 'POST';
		enctype?: HTMLFormAttributes['enctype'];
		/** A form action, e.g. `(node) => enhance(node, submit)`; runs on the rendered `<form>`. */
		use?: (node: HTMLFormElement) => void | { destroy?: () => void };
		oninput?: HTMLFormAttributes['oninput'];
	}

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
		/** Wraps `fields` and `footer`; only used with them. */
		form?: SheetForm;
		/** The scrolling fields, padded so the focus ring is not clipped. */
		fields?: Snippet;
		/** The fixed action row under the fields. */
		footer?: Snippet;
		/** Instead of `fields`/`footer`: the whole form, with its own layout. */
		children?: Snippet;
		class?: string;
	}

	let {
		open,
		onOpenChange,
		title,
		description,
		pending = false,
		form,
		fields,
		footer,
		children,
		class: className
	}: Props = $props();

	const styles = sheet();

	function useForm(node: HTMLFormElement) {
		return form?.use?.(node);
	}

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
			{#if fields}
				<form
					method={form?.method}
					action={form?.action}
					enctype={form?.enctype}
					oninput={form?.oninput}
					use:useForm
					class="flex h-full min-h-0 flex-col"
				>
					<div class={styles.fields()}>{@render fields()}</div>
					{#if footer}
						<div class={styles.footer()}>{@render footer()}</div>
					{/if}
				</form>
			{:else}
				{@render children?.()}
			{/if}
		</div>
		<CloseButton kind="sheet" class="absolute top-3 right-3" />
	</Sheet.Content>
</Sheet.Root>
