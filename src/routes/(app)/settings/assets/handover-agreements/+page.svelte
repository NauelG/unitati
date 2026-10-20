<script lang="ts">
	import { enhance } from '$app/forms';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import { field } from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { formatDateTime } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import AgreementEditor from './AgreementEditor.svelte';
	import NewOverride from './NewOverride.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const input = field().input();
	const PLACEHOLDERS = '{{person.name}}, {{organisation.name}}, {{date}}';

	const directionLabel = (direction: 'delivery' | 'return') =>
		direction === 'delivery' ? m.handover_direction_delivery() : m.handover_direction_return();

	const globals = $derived(data.agreements.filter((a) => a.categoryId === null));
	const overrides = $derived(data.agreements.filter((a) => a.categoryId !== null));

	const saveError = $derived(form?.action === 'save' ? form.message : null);
	const linkError = $derived(form?.action === 'linkDays' ? form.message : null);

	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);
</script>

<svelte:head>
	<title>{documentTitle(m.handover_agreements_title())}</title>
</svelte:head>

{#snippet history(agreement: (typeof data.agreements)[number])}
	<details class="mt-[var(--space-3)] text-sm text-[var(--ink)]">
		<summary class="cursor-pointer text-[var(--ink-muted)]">
			{m.handover_agreements_history({ count: agreement.versions.length })}
		</summary>
		<ol class="mt-[var(--space-2)] space-y-[var(--space-2)]">
			{#each agreement.versions as version (version.id)}
				<li class="rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-3)]">
					<p class="text-small text-[var(--ink-muted)]">
						{m.handover_agreements_version({ version: version.version })} ·
						{m.handover_agreements_version_meta({
							author: version.authorName ?? m.handover_agreements_unknown_author(),
							date: formatDateTime(version.createdAt)
						})}
					</p>
					<pre
						class="mt-[var(--space-1)] font-[inherit] break-words whitespace-pre-wrap">{version.body}</pre>
				</li>
			{/each}
		</ol>
	</details>
{/snippet}

<PageLayout variant="index">
	<PageHeader title={m.handover_agreements_title()}>
		{#snippet summary()}{m.handover_agreements_lede()}{/snippet}
	</PageHeader>

	<p class="mt-[var(--space-4)] text-small text-[var(--ink-muted)]">
		{m.handover_agreements_placeholders({ placeholders: PLACEHOLDERS })}
	</p>

	{#each data.missingGlobals as direction (direction)}
		<Alert tone="warning" class="mt-[var(--space-4)]">
			{m.handover_agreements_missing({ direction: directionLabel(direction).toLowerCase() })}
		</Alert>
	{/each}

	<section class="mt-[var(--space-6)] space-y-[var(--space-3)]">
		<h2 class="text-h3 text-[var(--ink)]">{m.handover_link_title()}</h2>
		<form method="POST" action="?/linkDays" use:enhance class="flex items-end gap-[var(--space-3)]">
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class="text-label text-[var(--ink)]">{m.handover_link_days()}</span>
				<input
					name="days"
					type="number"
					inputmode="numeric"
					min={data.linkValidDaysMin}
					max={data.linkValidDaysMax}
					step="1"
					value={data.linkValidDays}
					class={input}
					required
				/>
			</label>
			<Button type="submit" size="sm">{m.handover_link_save()}</Button>
		</form>
		<p class="text-small text-[var(--ink-muted)]">
			{m.handover_link_hint({ min: data.linkValidDaysMin, max: data.linkValidDaysMax })}
		</p>
		{#if linkError}
			<FormError>{linkError}</FormError>
		{/if}
	</section>

	<section class="mt-[var(--space-8)] space-y-[var(--space-6)]">
		{#each globals as agreement (agreement.templateId)}
			<article
				class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
			>
				<h2 class="text-h3 mb-[var(--space-3)] text-[var(--ink)]">
					{directionLabel(agreement.direction)} · {m.handover_agreements_global()}
				</h2>
				<AgreementEditor
					direction={agreement.direction}
					initialBody={agreement.versions[0]?.body ?? ''}
					submitLabel={m.handover_agreements_save()}
					error={saveError}
				/>
				{@render history(agreement)}
			</article>
		{/each}

		{#each data.missingGlobals as direction (direction)}
			<article
				class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
			>
				<h2 class="text-h3 mb-[var(--space-3)] text-[var(--ink)]">
					{directionLabel(direction)} · {m.handover_agreements_global()}
				</h2>
				<AgreementEditor
					{direction}
					initialBody=""
					submitLabel={m.handover_agreements_create()}
					error={saveError}
				/>
			</article>
		{/each}
	</section>

	<section class="mt-[var(--space-8)] space-y-[var(--space-4)]">
		<h2 class="text-h3 text-[var(--ink)]">{m.handover_agreements_overrides()}</h2>

		{#if overrides.length === 0}
			<p class="text-small text-[var(--ink-muted)]">{m.handover_agreements_overrides_empty()}</p>
		{/if}

		{#each overrides as agreement (agreement.templateId)}
			<article
				class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
			>
				<div class="mb-[var(--space-3)] flex items-center justify-between gap-[var(--space-3)]">
					<h3 class="text-h3 text-[var(--ink)]">
						{m.handover_agreements_override_for({
							direction: directionLabel(agreement.direction),
							category: agreement.categoryName ?? ''
						})}
					</h3>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
						onclick={() => (confirmingId = agreement.templateId)}
					>
						{m.handover_agreements_remove()}
					</Button>
				</div>
				<AgreementEditor
					direction={agreement.direction}
					categoryId={agreement.categoryId}
					initialBody={agreement.versions[0]?.body ?? ''}
					submitLabel={m.handover_agreements_save()}
				/>
				{@render history(agreement)}

				<ConfirmDialog
					open={confirmingId === agreement.templateId}
					onOpenChange={(next) => {
						if (!next) confirmingId = null;
					}}
					title={m.handover_agreements_remove()}
					description={m.handover_agreements_remove_ask()}
					confirmLabel={m.handover_agreements_remove()}
					pending={pendingId === agreement.templateId}
					error={confirmingId === agreement.templateId && form?.id === agreement.templateId
						? form.message
						: null}
				>
					{#snippet action(confirm)}
						<form
							method="POST"
							action="?/removeOverride"
							use:enhance={confirmSubmit({
								onPending: (pending) => (pendingId = pending ? agreement.templateId : null),
								onSettled: (succeeded) => {
									if (succeeded) confirmingId = null;
								}
							})}
						>
							<input type="hidden" name="id" value={agreement.templateId} />
							{@render confirm()}
						</form>
					{/snippet}
				</ConfirmDialog>
			</article>
		{/each}

		{#if data.categories.length > 0}
			<article
				class="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
			>
				<h3 class="text-h3 mb-[var(--space-3)] text-[var(--ink)]">
					{m.handover_agreements_new_override()}
				</h3>
				<NewOverride categories={data.categories} error={saveError} />
			</article>
		{/if}
	</section>
</PageLayout>
