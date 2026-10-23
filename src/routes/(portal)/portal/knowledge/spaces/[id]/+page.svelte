<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import PageTree from '#lib/components/unitati/PageTree.svelte';
	import { SPACE_ICON_COMPONENTS } from '#lib/components/unitati/space-icons.js';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { spaceColourVar } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const Icon = $derived(SPACE_ICON_COMPONENTS[data.space.icon]);
</script>

<svelte:head>
	<title>{documentTitle(data.space.name, m.knowledge_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[
			{ label: m.knowledge_title(), href: '/portal/knowledge' },
			{ label: data.space.name }
		]}
	/>
	<PageHeader title={data.space.name} level="record">
		{#snippet summary()}
			<span class="inline-flex items-center gap-[var(--space-2)]">
				<span style:color={spaceColourVar(data.space.colour)} aria-hidden="true">
					<Icon class="size-4" />
				</span>
				{data.space.description ?? ''}
			</span>
		{/snippet}
	</PageHeader>

	<WorkPanel
		class="mt-[var(--space-5)]"
		heading={m.knowledge_tree_label({ space: data.space.name })}
	>
		<PageTree
			entries={data.tree}
			expandAll
			label={m.knowledge_tree_label({ space: data.space.name })}
			href={(entry) => `/portal/knowledge/${entry.tag}`}
		/>
	</WorkPanel>
</PageLayout>
