<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { groupByModule, MODULE_LABELS, visibleSections } from '#lib/settings/sections.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const groups = $derived(groupByModule(visibleSections(data.permissions)));
</script>

<svelte:head>
	<title>{documentTitle(m.settings_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.settings_title()}>
		{#snippet summary()}{m.settings_lede()}{/snippet}
	</PageHeader>

	<div class="mt-[var(--space-6)] flex flex-col gap-[var(--space-5)]">
		{#each groups as group (group.module)}
			<section aria-labelledby="settings-module-{group.module}">
				<h2
					id="settings-module-{group.module}"
					class="mb-[var(--space-2)] text-xs font-semibold tracking-[0.04em] text-[var(--ink-muted)] uppercase"
				>
					{MODULE_LABELS[group.module]()}
				</h2>
				<ul
					class="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
				>
					{#each group.sections as section (section.href)}
						<li>
							<a
								href={section.href}
								class="ut-transition-fast flex min-h-10 items-center p-[var(--space-3)] text-sm font-medium text-[var(--ink)] no-underline transition-colors hover:bg-[var(--surface-2)]"
							>
								{section.label()}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</PageLayout>
