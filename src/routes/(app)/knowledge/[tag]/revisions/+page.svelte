<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import RevisionList from './RevisionList.svelte';
	import type { PageProps } from './$types';
	import { pageTrail } from '../../trail.js';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{documentTitle(m.knowledge_revisions_title({ title: data.page.title }))}</title>
</svelte:head>

<PageLayout variant="index" class="flex flex-col gap-[var(--space-5)]">
	<Breadcrumbs
		segments={pageTrail(data.space, data.path, data.page, [{ label: m.knowledge_page_history() }])}
	/>

	<PageHeader
		title={m.knowledge_revisions_title({ title: data.page.title })}
		level="record"
		code={data.page.tag}
	>
		{#snippet summary()}
			{m.knowledge_revisions_lede()}
		{/snippet}
	</PageHeader>

	<WorkPanel>
		<RevisionList
			revisions={data.revisions}
			tag={data.page.tag}
			current={data.page.revision}
			label={m.knowledge_revisions_label({ title: data.page.title })}
		/>
	</WorkPanel>
</PageLayout>
