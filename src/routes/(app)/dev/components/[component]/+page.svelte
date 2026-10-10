<script lang="ts">
	import { findComponentEntry } from '../gallery/manifest.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const entry = $derived(findComponentEntry(data.componentId));
</script>

{#if entry}
	{#await entry.load()}
		<p class="text-sm text-[var(--ink-muted)]">Cargando…</p>
	{:then module}
		{@const Spec = module.default}
		<Spec />
	{/await}
{/if}
