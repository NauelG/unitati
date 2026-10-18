<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let affected = $state<string[]>([]);
	let affectedLabels = $state<Record<string, string>>({});
	/** Success navigates away to the new ticket — no local value to flip, so `Button`'s `busy` prop is the whole feedback (#89). */
	let busy = $state(false);

	const values = $derived(form && 'values' in form ? form.values : {});
</script>

<svelte:head>
	<title>{documentTitle(m.portal_new_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.portal_new_title()}>
		{#snippet summary()}{m.portal_new_lede()}{/snippet}
	</PageHeader>

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
		class="mt-[var(--space-6)] space-y-[var(--space-4)]"
	>
		<Field label={m.ticket_form_subject()} name="subject" value={values.subject} required />

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
