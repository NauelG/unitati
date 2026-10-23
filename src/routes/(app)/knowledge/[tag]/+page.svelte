<script lang="ts">
	import { enhance } from '$app/forms';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import FolderInput from '@lucide/svelte/icons/folder-input';
	import History from '@lucide/svelte/icons/history';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { formatDateTime, formatRelative } from '#lib/format-date.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RecordAttachments from '#lib/components/unitati/RecordAttachments.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import PageStatusBadge from '#lib/components/unitati/PageStatusBadge.svelte';
	import { prose } from '#lib/components/unitati/prose.js';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import CreatePageDialog from '../CreatePageDialog.svelte';
	import KnowledgeTree from '../KnowledgeTree.svelte';
	import MovePageDialog from '../MovePageDialog.svelte';
	import PageComments from './PageComments.svelte';
	import type { PageProps } from './$types';
	import { pageTrail } from '../trail.js';

	let { data, form }: PageProps = $props();

	let creating = $state(false);
	let moving = $state(false);
	let archiving = $state(false);
	let archivePending = $state(false);

	const status = $derived(data.page.status);
	const revisedAt = $derived(new Date(data.page.revisedAt));
	const failureFor = (action: string) =>
		form && form.action === action && form.message ? String(form.message) : undefined;
	const refusal = $derived(
		form && ['publish', 'unarchive'].includes(form.action ?? '') ? form.message : null
	);
</script>

<svelte:head>
	<title>{documentTitle(data.page.tag, data.page.title)}</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs class="mb-[var(--space-5)]" segments={pageTrail(data.space, data.path, data.page)} />

	<PageHeader title={data.page.title} level="record" code={data.page.tag}>
		{#snippet summary()}
			<span class="flex flex-wrap items-center gap-[var(--space-2)]">
				<PageStatusBadge {status} />
				<span title={formatDateTime(revisedAt)}>
					{m.knowledge_page_revision_by({
						n: data.page.revision,
						author: data.page.revisionAuthorName ?? m.knowledge_page_author_unknown(),
						time: formatRelative(revisedAt)
					})}
				</span>
			</span>
		{/snippet}
		{#snippet actions()}
			{#if status !== 'archived'}
				<!-- Publishing is a draft's main action; editing is everybody else's. -->
				<Button
					variant={status === 'draft' ? 'secondary' : 'primary'}
					href={`/knowledge/${data.page.tag}/edit`}
				>
					<Pencil class="size-4" aria-hidden="true" />
					{m.knowledge_page_edit()}
				</Button>
			{/if}
			<Button variant="secondary" href={`/knowledge/${data.page.tag}/revisions`}>
				<History class="size-4" aria-hidden="true" />
				{m.knowledge_page_history()}
			</Button>
			<Button variant="secondary" onclick={() => (creating = true)}>
				<Plus class="size-4" aria-hidden="true" />
				{m.knowledge_page_new_child()}
			</Button>
			{#if status !== 'archived'}
				<Button variant="secondary" onclick={() => (moving = true)}>
					<FolderInput class="size-4" aria-hidden="true" />
					{m.knowledge_page_move()}
				</Button>
			{/if}
			{#if status === 'draft'}
				<form method="POST" action="?/publish" use:enhance>
					<input type="hidden" name="id" value={data.page.id} />
					<Button type="submit">
						<Send class="size-4" aria-hidden="true" />
						{m.knowledge_page_publish()}
					</Button>
				</form>
			{/if}
			{#if status === 'archived'}
				<form method="POST" action="?/unarchive" use:enhance>
					<input type="hidden" name="id" value={data.page.id} />
					<Button type="submit" variant="secondary">
						<ArchiveRestore class="size-4" aria-hidden="true" />
						{m.knowledge_page_unarchive()}
					</Button>
				</form>
			{:else}
				<Button variant="ghost" onclick={() => (archiving = true)}>
					<Archive class="size-4" aria-hidden="true" />
					{m.knowledge_page_archive()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if refusal}
		<Alert tone="danger">{refusal}</Alert>
	{/if}
	{#if status === 'draft'}
		<Alert tone="info">{m.knowledge_page_draft_notice()}</Alert>
	{:else if status === 'archived'}
		<Alert tone="warning">{m.knowledge_page_archived_notice()}</Alert>
	{/if}

	<WorkPanel>
		{#if data.hasBody}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
			<div class={prose}>{@html data.bodyHtml}</div>
		{:else}
			<EmptyState description={m.knowledge_page_body_empty()} />
		{/if}
	</WorkPanel>

	<PageComments
		comments={data.comments}
		archived={status === 'archived'}
		mentionsUrl={`/knowledge/${data.page.tag}/mentions`}
		error={form?.action === 'addComment' ? form.message : null}
		editError={form?.action === 'editComment' ? form.message : null}
	/>

	{#snippet side()}
		<RecordAttachments
			items={data.attachments}
			downloadBase={`/knowledge/${data.page.tag}/attachments`}
			canManage={status !== 'archived'}
			uploadError={failureFor('addAttachments')}
			removeError={failureFor('removeAttachment')}
		/>

		<WorkPanel heading={m.knowledge_tree_label({ space: data.space.name })}>
			<KnowledgeTree
				entries={data.tree}
				spaceId={data.space.id}
				spaceName={data.space.name}
				currentId={data.page.id}
			/>
		</WorkPanel>

		{#if data.related.length > 0}
			<!-- Read-only: a citation is removed from the ticket, a project's page from the project. -->
			<RelatedRecords groups={data.related} />
		{/if}
	{/snippet}
</PageLayout>

<CreatePageDialog
	open={creating}
	onOpenChange={(open) => (creating = open)}
	spaceId={data.space.id}
	spaceName={data.space.name}
	entries={data.tree}
	parentId={data.page.id}
/>

<MovePageDialog
	open={moving}
	onOpenChange={(open) => (moving = open)}
	page={data.page}
	currentSpaceId={data.space.id}
	spaces={data.spaces}
	trees={data.targetTrees}
/>

<ConfirmDialog
	open={archiving}
	onOpenChange={(open) => (archiving = open)}
	title={m.knowledge_page_archive_title({ title: data.page.title })}
	description={m.knowledge_page_archive_ask()}
	confirmLabel={m.knowledge_page_archive()}
	pending={archivePending}
	error={archiving && form?.action === 'archive' ? form.message : null}
>
	{#snippet action(confirm)}
		<form
			method="POST"
			action="?/archive"
			use:enhance={confirmSubmit({
				onPending: (pending) => (archivePending = pending),
				onSettled: (succeeded) => {
					if (succeeded) archiving = false;
				}
			})}
		>
			<input type="hidden" name="id" value={data.page.id} />
			{@render confirm()}
		</form>
	{/snippet}
</ConfirmDialog>
