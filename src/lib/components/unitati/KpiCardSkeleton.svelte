<script lang="ts">
	import { kpiCard } from './KpiCard.svelte';
	import Skeleton from './Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	const styles = kpiCard();
</script>

<div class={styles.root({ class: className })} role="status" aria-live="polite">
	<span class="sr-only">{m.loading_generic()}</span>
	<Skeleton class="h-4 w-20" />
	<!-- Matches `.value`'s 28/34 box exactly: the KPI card's own CLS-sensitive line. -->
	<Skeleton class="h-[28px] w-16" />
</div>
