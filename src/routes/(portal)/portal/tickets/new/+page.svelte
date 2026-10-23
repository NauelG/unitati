<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageSuggestions from '#lib/components/unitati/PageSuggestions.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let affected = $state<string[]>([]);
	let affectedLabels = $state<Record<string, string>>({});
	/** Success navigates away to the new ticket — no local value to flip, so `Button`'s `busy` prop is the whole feedback (#89). */
	let busy = $state(false);

	const values = $derived(form && 'values' in form ? form.values : {});
	// Seeded once from a failed post, then owned by the field: it feeds the page suggestions.
	// svelte-ignore state_referenced_locally
	let subject = $state(values.subject ?? '');
</script>

<svelte:head>
	<title>{documentTitle(m.portal_new_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.portal_new_title()}>
		{#snippet summary()}{m.portal_new_lede()}{/snippet}
	</PageHeader>

	{#if data.requestForms.length > 0}
		<section class="mt-[var(--space-6)]" aria-labelledby="request-forms-heading">
			<h2 id="request-forms-heading" class="text-label text-[var(--ink)]">
				{m.portal_requests_title()}
			</h2>
			<p class="text-small text-[var(--ink-muted)]">{m.portal_requests_lede()}</p>
			<ul class="mt-[var(--space-3)] space-y-[var(--space-2)]">
				{#each data.requestForms as requestForm (requestForm.id)}
					<li
						class="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-3)]"
					>
						<a
							href="/portal/tickets/new/request/{requestForm.id}"
							class="text-sm font-medium text-[var(--brand)] hover:underline"
						>
							{requestForm.name}
						</a>
						{#if requestForm.descriptionHtml}
							<div class="text-small text-[var(--ink-muted)]">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
								{@html requestForm.descriptionHtml}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
		<h2 class="mt-[var(--space-8)] text-label text-[var(--ink)]">{m.portal_free_title()}</h2>
	{/if}

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
		class="mt-[var(--space-4)] space-y-[var(--space-4)]"
	>
		<Field label={m.ticket_form_subject()} name="subject" bind:value={subject} required />

		<PageSuggestions {subject} />

		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.ticket_form_body()}</span>
			<textarea
				name="body"
				required
				rows="6"
				class="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-[var(--space-3)] text-sm leading-5 text-[var(--ink)]"
				>{values.body ?? ''}</textarea
			>
		</label>

		<SearchSelectField
			label={m.ticket_form_assets()}
			hint={m.ticket_form_assets_hint()}
			name="assetIds"
			multiple
			searchUrl="/portal/tickets/new/assets"
			placeholder={m.asset_search_placeholder()}
			noneText={m.asset_search_none()}
			countText={(count) => m.asset_search_count({ count })}
			bind:values={affected}
			bind:pickedLabels={affectedLabels}
		/>

		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">
				{m.ticket_form_attachments()}
			</span>
			<input type="file" name="files" multiple class="text-sm" />
			<span class="text-small text-[var(--ink-muted)]">
				{m.ticket_form_attachments_hint()}
			</span>
		</label>

		{#if form && 'message' in form}
			<FormError>{form.message}</FormError>
		{/if}

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" {busy}>{m.ticket_form_submit()}</Button>
			<Button href="/portal" variant="ghost">{m.form_cancel()}</Button>
		</div>
	</form>
</PageLayout>
