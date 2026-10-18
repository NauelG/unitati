<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import AssetPicker from '#lib/components/unitati/AssetPicker.svelte';
	import type { PickedAsset } from '#lib/components/unitati/asset-choice.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let affected = $state<PickedAsset[]>([]);
	/** Success navigates away to the new ticket — no local value to flip, so `Button`'s `busy` prop is the whole feedback (#89). */
	let busy = $state(false);

	const values = $derived(form && 'values' in form ? form.values : {});
	const queueOptions = $derived(data.queues.map((q) => ({ value: q.id, label: q.name })));
	const requesterOptions = $derived(data.people.map((p) => ({ value: p.id, label: p.fullName })));
	const priorityOptions = $derived(
		data.priorities.map((value) => ({
			value,
			label: value === 'normal' ? m.ticket_priority_normal() : statusLabel(value)
		}))
	);
</script>

<svelte:head>
	<title>{documentTitle(m.ticket_new_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.ticket_new_title()}>
		{#snippet summary()}{m.ticket_new_lede()}{/snippet}
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
			<span class="text-label text-[var(--ink)]">
				{m.ticket_form_body()}
			</span>
			<textarea
				name="body"
				required
				rows="6"
				class="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-[var(--space-3)] text-sm leading-5 text-[var(--ink)]"
				>{values.body ?? ''}</textarea
			>
		</label>

		<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
			<SelectField
				label={m.ticket_form_queue()}
				name="queueId"
				placeholder={m.ticket_form_queue_placeholder()}
				options={queueOptions}
				value={values.queueId ?? ''}
				required
			/>
			<SelectField
				label={m.ticket_form_priority()}
				name="priority"
				options={priorityOptions}
				value={values.priority ?? 'normal'}
			/>
		</div>

		<SelectField
			label={m.ticket_form_requester()}
			name="requesterPersonId"
			placeholder={m.ticket_form_requester_self()}
			hint={m.ticket_form_requester_hint()}
			options={requesterOptions}
			value={values.requesterPersonId ?? ''}
		/>

		<AssetPicker
			label={m.ticket_form_assets()}
			hint={m.ticket_form_assets_hint()}
			searchUrl="/service-desk/new/assets"
			bind:selected={affected}
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
			<Alert tone="danger">{form.message}</Alert>
		{/if}

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" {busy}>{m.ticket_form_submit()}</Button>
			<Button href="/service-desk" variant="ghost">{m.form_cancel()}</Button>
		</div>
	</form>
</PageLayout>
