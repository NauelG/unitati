<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import DateField from '#lib/components/unitati/DateField.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const values = $derived(form && 'values' in form ? form.values : null);

	let categoryId = $state<string | null>(null);
	let justification = $state('');
	let neededBy = $state<string | null>(null);
	/** Success navigates away to the new ticket, so `busy` is the whole feedback (#89). */
	let busy = $state(false);

	// A refusal re-renders with what was typed: keep the draft, do not wipe it.
	$effect(() => {
		if (values) {
			categoryId = values.categoryId || null;
			justification = values.justification;
			neededBy = values.neededBy || null;
		}
	});
</script>

<svelte:head>
	<title>{documentTitle(data.requestForm.name)}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={data.requestForm.name}>
		{#snippet summary()}
			{#if data.requestForm.descriptionHtml}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
				{@html data.requestForm.descriptionHtml}
			{:else}
				{m.portal_request_title()}
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.categories.length === 0}
		<p class="mt-[var(--space-6)] text-sm text-[var(--ink-muted)]">
			{m.request_equipment_no_categories()}
		</p>
	{:else}
		<form
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
			class="mt-[var(--space-6)] space-y-[var(--space-4)]"
		>
			<SelectField
				label={m.request_equipment_category()}
				name="categoryId"
				placeholder={m.request_equipment_category_placeholder()}
				options={data.categories}
				bind:value={categoryId}
				required
			/>

			<TextAreaField
				label={m.request_equipment_justification()}
				name="justification"
				hint={m.request_equipment_justification_hint({ max: data.justificationMax })}
				maxlength={data.justificationMax}
				rows={5}
				required
				bind:value={justification}
			/>

			<DateField label={m.request_equipment_needed_by()} name="neededBy" bind:value={neededBy} />

			{#if form && 'message' in form}
				<FormError>{form.message}</FormError>
			{/if}

			<div class="flex items-center gap-[var(--space-3)]">
				<Button type="submit" {busy}>{m.request_equipment_submit()}</Button>
				<Button href="/portal/tickets/new" variant="ghost">{m.form_cancel()}</Button>
			</div>
		</form>
	{/if}
</PageLayout>
