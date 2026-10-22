<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { SPACE_ICON_COMPONENTS } from '#lib/components/unitati/space-icons.js';
	import { spaceColourVar } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import CreatePageDialog from './CreatePageDialog.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Entry = PageProps['data']['spaces'][number];

	let creatingIn = $state<Entry | null>(null);

	const published = (count: number) =>
		count === 1 ? m.knowledge_space_published_one() : m.knowledge_space_published_other({ count });
</script>

<svelte:head>
	<title>{documentTitle(m.knowledge_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.knowledge_title()}>
		{#snippet summary()}{m.knowledge_lede()}{/snippet}
	</PageHeader>

	{#if data.spaces.length === 0}
		<EmptyState description={m.knowledge_spaces_empty_index()} />
	{:else}
		<ul
			class="mt-[var(--space-5)] grid list-none gap-[var(--space-4)] p-0 sm:grid-cols-2 xl:grid-cols-3"
		>
			{#each data.spaces as space (space.id)}
				{@const Icon = SPACE_ICON_COMPONENTS[space.icon]}
				<li
					class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
					data-space={space.id}
				>
					<a
						href="/knowledge/spaces/{space.id}"
						class="flex min-w-0 flex-1 flex-col gap-[var(--space-2)] rounded-[var(--radius-sm)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
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
					<div>
						<Button variant="secondary" size="sm" onclick={() => (creatingIn = space)}>
							<Plus class="size-4" aria-hidden="true" />
							{m.knowledge_page_new_short()}
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageLayout>

{#if creatingIn}
	<CreatePageDialog
		open
		onOpenChange={(open) => {
			if (!open) creatingIn = null;
		}}
		spaceId={creatingIn.id}
		spaceName={creatingIn.name}
		entries={[]}
	/>
{/if}
