<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { SPACE_ICON_COMPONENTS } from '#lib/components/unitati/space-icons.js';
	import { spaceColourVar } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const published = (count: number) =>
		count === 1 ? m.knowledge_space_published_one() : m.knowledge_space_published_other({ count });
</script>

<svelte:head>
	<title>{documentTitle(m.knowledge_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.knowledge_title()}>
		{#snippet summary()}{m.portal_knowledge_lede()}{/snippet}
	</PageHeader>

	<form method="GET" role="search" class="mt-[var(--space-5)] flex items-end gap-[var(--space-2)]">
		<Field
			label={m.portal_knowledge_search_label()}
			name="q"
			type="search"
			value={data.query}
			class="w-full sm:w-96"
		/>
		<Button type="submit" variant="secondary">
			<Search class="size-4" aria-hidden="true" />
			{m.portal_knowledge_search_submit()}
		</Button>
	</form>

	{#if data.results}
		<section class="mt-[var(--space-6)]" aria-labelledby="results-heading">
			<h2 id="results-heading" class="text-title-3 text-[var(--ink)]">
				{m.portal_knowledge_results({ query: data.query })}
			</h2>
			{#if data.results.length === 0}
				<EmptyState description={m.portal_knowledge_no_results()} />
			{:else}
				<ul class="mt-[var(--space-3)] flex list-none flex-col gap-[var(--space-3)] p-0">
					{#each data.results as hit (hit.tag)}
						<li class="flex flex-col gap-[var(--space-1)]">
							<a
								href="/portal/knowledge/{hit.tag}"
								class="w-fit text-label text-[var(--brand)] hover:underline"
							>
								{hit.title}
							</a>
							<span class="text-caption text-[var(--ink-muted)]">{hit.spaceName}</span>
							{#if hit.excerpt}
								<span class="text-small text-[var(--ink-muted)]">{hit.excerpt}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else if data.spaces.length === 0}
		<EmptyState description={m.knowledge_spaces_empty_index()} />
	{:else}
		<ul
			class="mt-[var(--space-5)] grid list-none gap-[var(--space-4)] p-0 sm:grid-cols-2 xl:grid-cols-3"
		>
			{#each data.spaces as space (space.id)}
				{@const Icon = SPACE_ICON_COMPONENTS[space.icon]}
				<li data-space={space.id}>
					<a
						href="/portal/knowledge/spaces/{space.id}"
						class="flex h-full min-w-0 flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
					>
						<span class="flex items-center gap-[var(--space-2)]">
							<span style:color={spaceColourVar(space.colour)} aria-hidden="true">
								<Icon class="size-5" />
							</span>
							<span class="truncate text-title-3 text-[var(--ink)]">{space.name}</span>
						</span>
						{#if space.description}
							<span class="text-small text-[var(--ink-muted)]">{space.description}</span>
						{/if}
						<span class="text-caption text-[var(--ink-muted)]">{published(space.pageCount)}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</PageLayout>
