<script lang="ts">
	import { catalogueColorVar } from '#lib/domain/catalogue-color.js';

	interface Props {
		name: string;
		/** A palette key (`#lib/domain/catalogue-color.js`). */
		color: string;
		/** Shown as a tooltip. */
		description?: string | null;
		class?: string;
	}

	let { name, color, description = null, class: className }: Props = $props();
</script>

<!-- The dot is decoration: the name already says which label, so colour is never the only signal. -->
<span
	class="inline-flex max-w-full min-w-0 items-center gap-[var(--space-2)] rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-2)] py-[1px] text-xs text-[var(--ink)] {className ??
		''}"
	title={description ?? undefined}
>
	<span
		class="size-2 shrink-0 rounded-[var(--radius-full)]"
		style:background-color={catalogueColorVar(color)}
		aria-hidden="true"
	></span>
	<span class="min-w-0 truncate">{name}</span>
</span>
