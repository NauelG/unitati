<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';
	import { fetchPages } from '#lib/components/unitati/page-source.js';
	import { PAGE_BODY_MAX_LENGTH, PAGE_TITLE_MAX } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	import { pageTrail } from '../../trail.js';

	let { data, form }: PageProps = $props();

	// A refused save comes back with what the user wrote: that is what the form
	// shows, never the stored version (#324). The page's own values otherwise.
	// Read once: from here on the form owns them (a refusal must not reset them).
	let title = $state(untrack(() => form?.title ?? data.page.title));
	let body = $state(untrack(() => form?.body ?? data.page.body));
	// After a refusal the base stays the one the user started from, so saving
	// again is refused again: the screen never overwrites a version the user has
	// not seen (#324). Reopening the editor starts from the current one.
	const baseRevision = $derived(form?.baseRevision ?? String(data.page.revision));

	let saving = $state(false);
	/** Set once leaving is decided (a save that succeeded, or a confirmed discard). */
	let leaving = false;
	let pendingLeave = $state<URL | null>(null);
	let copied = $state<'copied' | 'failed' | null>(null);

	const dirty = $derived(title !== data.page.title || body !== data.page.body);
	const stale = $derived(form?.stale ?? null);

	beforeNavigate((navigation) => {
		if (!dirty || leaving) return;
		// Closing the tab or leaving the app: only the browser's own prompt can ask.
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		navigation.cancel();
		pendingLeave = navigation.to?.url ?? null;
	});

	function leave() {
		const target = pendingLeave;
		pendingLeave = null;
		if (!target) return;
		leaving = true;
		void goto(target);
	}

	async function copyText() {
		try {
			await navigator.clipboard.writeText(body);
			copied = 'copied';
		} catch {
			copied = 'failed';
		}
	}
</script>

<svelte:head>
	<title>{documentTitle(m.knowledge_page_edit_title({ title: data.page.title }))}</title>
</svelte:head>

<PageLayout variant="form" class="flex flex-col gap-[var(--space-5)]">
	<Breadcrumbs
		segments={pageTrail(data.space, data.path, data.page, [{ label: m.knowledge_page_edit() }])}
	/>

	<PageHeader
		title={m.knowledge_page_edit_title({ title: data.page.title })}
		level="record"
		code={data.page.tag}
	>
		{#snippet summary()}
			{m.knowledge_page_revision({ n: data.page.revision })}
		{/snippet}
	</PageHeader>

	{#if stale}
		<Alert
			tone="warning"
			title={m.knowledge_page_stale({
				author: stale.authorName ?? m.knowledge_page_author_unknown()
			})}
		>
			{m.knowledge_page_stale_hint()}
			{#snippet actions()}
				<Button
					variant="secondary"
					size="sm"
					href={`/knowledge/${data.page.tag}`}
					target="_blank"
					rel="noopener"
				>
					<ExternalLink class="size-4" aria-hidden="true" />
					{m.knowledge_page_stale_view()}
				</Button>
				<Button variant="secondary" size="sm" onclick={copyText}>
					<Copy class="size-4" aria-hidden="true" />
					{m.knowledge_page_stale_copy()}
				</Button>
				<span role="status" class="text-small text-[var(--ink-muted)]">
					{#if copied === 'copied'}
						{m.knowledge_page_stale_copied()}
					{:else if copied === 'failed'}
						{m.knowledge_page_stale_copy_failed()}
					{/if}
				</span>
			{/snippet}
		</Alert>
	{/if}

	<form
		method="POST"
		class="flex flex-col gap-[var(--space-4)]"
		use:enhance={() => {
			saving = true;
			copied = null;
			return async ({ result, update }) => {
				// A save that worked redirects to the page: nothing is unsaved any more.
				if (result.type === 'redirect') leaving = true;
				await update({ reset: false });
				saving = false;
			};
		}}
	>
		<input type="hidden" name="baseRevision" value={baseRevision} />
		<Field
			label={m.knowledge_page_field_title()}
			name="title"
			bind:value={title}
			maxlength={PAGE_TITLE_MAX}
			required
			autocomplete="off"
		/>
		<RichTextEditor
			name="body"
			label={m.knowledge_page_field_body()}
			placeholder={m.knowledge_page_body_placeholder()}
			profile="document"
			pageSource={(query) => fetchPages('/knowledge/pages/pick', query)}
			maxLength={PAGE_BODY_MAX_LENGTH}
			bind:value={body}
			disabled={saving}
		/>
		<FormError>{form?.message}</FormError>
		<FormActions>
			<Button variant="secondary" href={`/knowledge/${data.page.tag}`}>
				{m.knowledge_page_cancel()}
			</Button>
			<Button type="submit" busy={saving}>{m.knowledge_page_save()}</Button>
		</FormActions>
	</form>
</PageLayout>

<ConfirmDialog
	open={pendingLeave !== null}
	onOpenChange={(open) => {
		if (!open) pendingLeave = null;
	}}
	title={m.knowledge_page_leave_title()}
	description={m.knowledge_page_leave_ask({ title: data.page.title })}
	confirmLabel={m.knowledge_page_leave_confirm()}
>
	{#snippet action(confirm)}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				leave();
			}}
		>
			{@render confirm()}
		</form>
	{/snippet}
</ConfirmDialog>
