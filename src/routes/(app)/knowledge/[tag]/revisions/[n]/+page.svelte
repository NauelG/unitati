<script lang="ts">
	import { enhance } from '$app/forms';
	import History from '@lucide/svelte/icons/history';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { prose } from '#lib/components/unitati/prose.js';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { formatDateTime, formatRelative } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import RevisionList from '../RevisionList.svelte';
	import type { PageProps } from './$types';
	import { pageTrail } from '../../../trail.js';

	let { data, form }: PageProps = $props();

	let restoring = $state(false);
	let pending = $state(false);

	const createdAt = $derived(new Date(data.revision.createdAt));
	const current = $derived(data.revision.number === data.page.revision);
	const canRestore = $derived(!current && data.page.status !== 'archived');
</script>

<svelte:head>
	<title>
		{documentTitle(
			data.page.tag,
			m.knowledge_revision_title({ n: data.revision.number, title: data.page.title })
		)}
	</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs
		segments={pageTrail(data.space, data.path, data.page, [
			{ label: m.knowledge_page_history(), href: `/knowledge/${data.page.tag}/revisions` },
			{ label: m.knowledge_page_revision({ n: data.revision.number }) }
		])}
	/>

	<PageHeader title={data.revision.title} level="record" code={data.page.tag}>
		{#snippet summary()}
			<span title={formatDateTime(createdAt)}>
				{m.knowledge_page_revision_by({
					n: data.revision.number,
					author: data.revision.authorName ?? m.knowledge_page_author_unknown(),
					time: formatRelative(createdAt)
				})}
			</span>
		{/snippet}
		{#snippet actions()}
			<Button variant="secondary" href={`/knowledge/${data.page.tag}/revisions`}>
				<History class="size-4" aria-hidden="true" />
				{m.knowledge_page_history()}
			</Button>
			{#if canRestore}
				<Button onclick={() => (restoring = true)}>
					<RotateCcw class="size-4" aria-hidden="true" />
					{m.knowledge_revision_restore()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if current}
		<Alert tone="info">{m.knowledge_revision_is_current()}</Alert>
	{:else}
		<Alert tone="warning">
			{m.knowledge_revision_old_notice({ current: data.page.revision })}
		</Alert>
	{/if}

	<WorkPanel>
		{#if data.revision.hasBody}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
			<div class={prose}>{@html data.revision.bodyHtml}</div>
		{:else}
			<EmptyState description={m.knowledge_page_body_empty()} />
		{/if}
	</WorkPanel>

	{#snippet side()}
		<WorkPanel heading={m.knowledge_page_history()}>
			<RevisionList
				revisions={data.history}
				tag={data.page.tag}
				current={data.page.revision}
				selected={data.revision.number}
				label={m.knowledge_revisions_label({ title: data.page.title })}
			/>
		</WorkPanel>
	{/snippet}
</PageLayout>

<ConfirmDialog
	open={restoring}
	onOpenChange={(open) => (restoring = open)}
	title={m.knowledge_revision_restore_title({ n: data.revision.number })}
	description={m.knowledge_revision_restore_ask()}
	confirmLabel={m.knowledge_revision_restore()}
	danger={false}
	{pending}
	error={restoring && form?.action === 'restore' ? form.message : null}
>
	{#snippet action(confirm)}
		<form
			method="POST"
			action="?/restore"
			use:enhance={confirmSubmit({
				onPending: (next) => (pending = next),
				onSettled: (succeeded) => {
					if (succeeded) restoring = false;
				}
			})}
		>
			<input type="hidden" name="baseRevision" value={data.page.revision} />
			{@render confirm()}
		</form>
	{/snippet}
</ConfirmDialog>
