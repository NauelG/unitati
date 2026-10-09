<script lang="ts">
	import { enhance } from '$app/forms';
	import AssetPicker from '#lib/components/unitati/AssetPicker.svelte';
	import type { PickedAsset } from '#lib/components/unitati/asset-choice.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let affected = $state<PickedAsset[]>([]);

	const values = $derived(form && 'values' in form ? form.values : {});
</script>

<svelte:head>
	<title>{m.portal_new_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.portal_new_title()}>
		{#snippet summary()}{m.portal_new_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance
		class="mt-[var(--space-6)] space-y-[var(--space-4)]"
	>
		<Field label={m.ticket_form_subject()} name="subject" value={values.subject} required />

		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">{m.ticket_form_body()}</span
			>
			<textarea
				name="body"
				required
				rows="6"
				class="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-[var(--space-3)] text-sm leading-5 text-[var(--ink)]"
				>{values.body ?? ''}</textarea
			>
		</label>

		<AssetPicker
			label={m.ticket_form_assets()}
			hint={m.ticket_form_assets_hint()}
			searchUrl="/portal/tickets/new/assets"
			bind:selected={affected}
		/>

		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">
				{m.ticket_form_attachments()}
			</span>
			<input type="file" name="files" multiple class="text-sm" />
			<span class="text-[13px] leading-[18px] text-[var(--ink-muted)]">
				{m.ticket_form_attachments_hint()}
			</span>
		</label>

		{#if form && 'message' in form}
			<p class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">{form.message}</p>
		{/if}

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit">{m.ticket_form_submit()}</Button>
			<Button href="/portal" variant="ghost">{m.form_cancel()}</Button>
		</div>
	</form>
</PageLayout>
