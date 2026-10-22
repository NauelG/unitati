<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { SPACE_ICON_COMPONENTS } from '#lib/components/unitati/space-icons.js';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { spaceColourVar } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import CreatePageDialog from '../../CreatePageDialog.svelte';
	import KnowledgeTree from '../../KnowledgeTree.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const Icon = $derived(SPACE_ICON_COMPONENTS[data.space.icon]);
	let creating = $state(false);
</script>

<svelte:head>
	<title>{documentTitle(data.space.name, m.knowledge_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.knowledge_title(), href: '/knowledge' }, { label: data.space.name }]}
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
		{#snippet actions()}
			<Button variant="secondary" href={data.showArchived ? '?' : '?archived=1'}>
				{data.showArchived ? m.knowledge_tree_hide_archived() : m.knowledge_tree_show_archived()}
			</Button>
			<Button onclick={() => (creating = true)}>
				<Plus class="size-4" aria-hidden="true" />
				{m.knowledge_page_new()}
			</Button>
		{/snippet}
	</PageHeader>

	<WorkPanel
		class="mt-[var(--space-5)]"
		heading={m.knowledge_tree_label({ space: data.space.name })}
	>
		<KnowledgeTree
			entries={data.tree}
			spaceId={data.space.id}
			spaceName={data.space.name}
			expandAll
		/>
	</WorkPanel>
</PageLayout>

<CreatePageDialog
	open={creating}
	onOpenChange={(open) => (creating = open)}
	spaceId={data.space.id}
	spaceName={data.space.name}
	entries={data.tree}
/>
