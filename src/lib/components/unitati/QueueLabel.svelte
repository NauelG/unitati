<script lang="ts">
	import { queueColorVar } from '#lib/domain/queue-color.js';

	interface Props {
		name: string;
		/** A palette key (`#lib/domain/queue-color.js`). */
		color: string;
		class?: string;
	}

	let { name, color, class: className }: Props = $props();
</script>

<!-- The dot is decoration: the name already says which queue, so colour is never the only signal. -->
<span class="inline-flex min-w-0 items-center gap-[var(--space-2)] {className ?? ''}">
	<span
		class="size-2 shrink-0 rounded-[var(--radius-full)]"
		style:background-color={queueColorVar(color)}
		aria-hidden="true"
	></span>
	<span class="min-w-0 truncate">{name}</span>
</span>
