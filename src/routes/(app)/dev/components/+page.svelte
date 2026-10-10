<script lang="ts">
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { CATEGORY_LABEL, GALLERY_CATEGORIES, entriesByCategory } from './gallery/manifest.js';

	const sections = GALLERY_CATEGORIES.map((category) => ({
		category,
		label: CATEGORY_LABEL[category],
		entries: entriesByCategory(category)
	}));
</script>

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title="Componentes">
		{#snippet summary()}
			El banco de trabajo del sistema de diseño. Un componente que no aparece aquí no está
			terminado.
		{/snippet}
		{#snippet actions()}
			<a href="/dev/components/tokens" class="ut-btn ut-btn-secondary ut-btn-sm">Tokens</a>
			<a href="/dev/components/motion" class="ut-btn ut-btn-secondary ut-btn-sm">Motion</a>
			<a href="/dev/components/coverage" class="ut-btn ut-btn-secondary ut-btn-sm">Cobertura</a>
			<a href="/dev/components/patterns" class="ut-btn ut-btn-secondary ut-btn-sm">Patrones</a>
		{/snippet}
	</PageHeader>

	{#each sections as section (section.category)}
		<WorkPanel heading={section.label}>
			<ul class="m-0 grid list-none gap-[var(--space-2)] p-0 sm:grid-cols-2 lg:grid-cols-3">
				{#each section.entries as entry (entry.id)}
					<li>
						<a
							href="/dev/components/{entry.id}"
							class="block rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-3)] hover:bg-[var(--surface-2)]"
						>
							<p class="font-mono text-xs font-semibold text-[var(--ink)]">{entry.name}</p>
							<p class="mt-1 text-[13px] leading-[18px] text-[var(--ink-muted)]">
								{entry.summary}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		</WorkPanel>
	{/each}
</div>
