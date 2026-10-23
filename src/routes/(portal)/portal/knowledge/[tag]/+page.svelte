<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import PageTree from '#lib/components/unitati/PageTree.svelte';
	import { prose } from '#lib/components/unitati/prose.js';
	import RecordAttachments from '#lib/components/unitati/RecordAttachments.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { portalTrail } from '../trail';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{documentTitle(data.page.title)}</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={portalTrail(data.space, data.path, data.page)}
	/>

	<PageHeader title={data.page.title} level="record" />

	<WorkPanel>
		{#if data.hasBody}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
			<div class={prose}>{@html data.bodyHtml}</div>
		{:else}
			<EmptyState description={m.knowledge_page_body_empty()} />
		{/if}
	</WorkPanel>

	<div class="mt-[var(--space-5)]">
		<Button href="/portal/tickets/new" variant="secondary">
			{m.portal_knowledge_unresolved()}
		</Button>
	</div>

	{#snippet side()}
		{#if data.attachments.length > 0}
			<RecordAttachments
				items={data.attachments}
				downloadBase={`/portal/knowledge/${data.page.tag}/attachments`}
				canManage={false}
			/>
		{/if}

		<WorkPanel heading={m.knowledge_tree_label({ space: data.space.name })}>
			<PageTree
				entries={data.tree}
				currentId={data.page.id}
				label={m.knowledge_tree_label({ space: data.space.name })}
				href={(entry) => `/portal/knowledge/${entry.tag}`}
			/>
		</WorkPanel>
	{/snippet}
</PageLayout>
