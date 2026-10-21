<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import DateField from '#lib/components/unitati/DateField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let ownerPersonId = $state<string | null>(data.defaultOwnerId);
	let submitting = $state(false);
	let visibility = $state<'organisation' | 'members'>('organisation');

	const ownerOptions = $derived(
		data.people.map((person) => ({ value: person.id, label: person.fullName }))
	);

	/** The refusal for one field, or nothing when it belongs to another. */
	const errorFor = (field: string) =>
		form && 'field' in form && form.field === field && 'message' in form
			? String(form.message)
			: undefined;
</script>

<svelte:head>
	<title>{documentTitle(m.project_new_title())}</title>
</svelte:head>

<!--
	A full page rather than a Dialog (ADR 0020): creating a project is a
	substantial act with a destination — the record it creates — not a quick
	addition to the list it was started from.
-->
<PageLayout variant="form">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.nav_projects(), href: '/projects' }, { label: m.project_new_title() }]}
	/>

	<PageHeader title={m.project_new_title()}>
		{#snippet summary()}{m.project_new_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
		class="mt-[var(--space-6)] space-y-[var(--space-5)]"
	>
		<Field label={m.project_field_name()} name="name" required error={errorFor('name')} />

		<TextAreaField
			label={m.project_field_description()}
			name="description"
			error={errorFor('description')}
		/>

		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<SearchSelectField
				label={m.project_field_owner()}
				name="ownerPersonId"
				placeholder={m.project_field_owner_none()}
				options={ownerOptions}
				bind:value={ownerPersonId}
				error={errorFor('ownerPersonId')}
			/>
			<DateField label={m.project_field_due()} name="dueDate" error={errorFor('dueDate')} />
		</div>

		<fieldset class="space-y-[var(--space-2)]">
			<legend class="text-sm font-medium text-[var(--ink)]">{m.project_visibility_title()}</legend>
			<label class="flex items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
				<input type="radio" name="visibility" value="organisation" bind:group={visibility} />
				{m.project_visibility_organisation()}
			</label>
			<label class="flex items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
				<input type="radio" name="visibility" value="members" bind:group={visibility} />
				{m.project_visibility_members()}
			</label>
			{#if visibility === 'members'}
				<p class="text-small text-[var(--ink-muted)]">{m.project_visibility_hint_new()}</p>
			{/if}
		</fieldset>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" size="lg" busy={submitting}>
				{submitting ? m.form_saving() : m.project_new_submit()}
			</Button>
			<Button href="/projects" variant="ghost" size="lg">{m.form_cancel()}</Button>
		</div>
	</form>
</PageLayout>
