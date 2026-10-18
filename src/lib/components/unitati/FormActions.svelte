<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The action row of a form in a `Dialog` or `Sheet` (ADR 0020: the form owns
	 * it, because only the form knows its submit label and its `use:enhance`).
	 * Owning it does not mean spelling it: the form composes this layout.
	 *
	 * Convention: **secondary first, primary last, right-aligned**,
	 * `[Cancelar][Guardar]`, with a rule above. `sticky` pins the row to the
	 * bottom of a scrolling `Sheet` body.
	 */
	export const formActions = tv({
		base: 'flex justify-end gap-[var(--space-2)] border-t border-[var(--border)] pt-[var(--space-4)]',
		variants: {
			sticky: { true: 'sticky bottom-0 bg-[var(--surface-1)]', false: '' }
		},
		defaultVariants: { sticky: false }
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		sticky?: boolean;
		class?: string;
		children: Snippet;
	}

	let { sticky = false, class: className, children }: Props = $props();
</script>

<div class={formActions({ sticky, class: className })}>{@render children()}</div>
