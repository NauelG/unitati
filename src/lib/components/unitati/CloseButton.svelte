<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { button } from './Button.svelte';

	/**
	 * The close control of an overlay, in Spanish. The vendored `Dialog.Content` /
	 * `Sheet.Content` render their own with an English `sr-only` "Close" and cannot
	 * be edited (ADR 0011, ADR 0008), so every `unitati` overlay passes
	 * `showCloseButton={false}` and renders this inside its content instead. It
	 * keeps the primitive's `data-slot` (`dialog-close` / `sheet-close`), so the
	 * focus-ring rule in `app.css` still applies.
	 */
	interface Props {
		/** Which primitive's `Close` this sits inside; it has to be a descendant of that `Root`. */
		kind: 'dialog' | 'sheet';
		/** Position, e.g. `absolute top-2 right-2`. */
		class?: string;
	}

	let { kind, class: className }: Props = $props();

	const classes = $derived(
		button({ variant: 'ghost', size: 'sm', iconOnly: true, class: className })
	);
</script>

{#if kind === 'dialog'}
	<Dialog.Close class={classes} aria-label={m.dialog_close()}>
		<XIcon class="size-4" aria-hidden="true" />
	</Dialog.Close>
{:else}
	<Sheet.Close class={classes} aria-label={m.dialog_close()}>
		<XIcon class="size-4" aria-hidden="true" />
	</Sheet.Close>
{/if}
