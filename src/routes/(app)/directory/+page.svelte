<script lang="ts">
	import { enhance } from '$app/forms';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const roleLabels: Record<string, string> = {
		admin: m.role_admin(),
		technician: m.role_technician(),
		employee: m.role_employee()
	};

	type Person = PageProps['data']['people'][number];

	/** The person whose location the dialog is editing, if any. */
	let editing = $state<Person | null>(null);
	let draftLocationId = $state<string | null>(null);
	let saving = $state(false);

	function open(person: Person) {
		editing = person;
		draftLocationId = person.locationId;
	}

	function close() {
		editing = null;
	}

	const failure = $derived(
		form && 'message' in form && form.action === 'setLocation' && form.id === editing?.id
			? (form.message as string)
			: null
	);

	const columns = $derived<DataTableColumn<Person>[]>([
		{ key: 'name', header: m.directory_column_name(), cell: name },
		{ key: 'email', header: m.directory_column_email(), cell: email },
		{ key: 'department', header: m.directory_column_department(), cell: department },
		{ key: 'location', header: m.directory_column_location(), cell: location },
		{ key: 'role', header: m.directory_column_role(), cell: role },
		...(data.canManagePeople
			? [
					{
						key: 'actions',
						header: m.directory_location_change(),
						kind: 'actions' as const,
						cell: actions
					}
				]
			: [])
	]);
</script>

{#snippet name(person: Person)}{person.fullName}{/snippet}
{#snippet email(person: Person)}{person.email}{/snippet}
{#snippet department(person: Person)}{person.departmentName ??
		m.directory_no_department()}{/snippet}
{#snippet location(person: Person)}{person.locationPath ?? m.directory_no_location()}{/snippet}
{#snippet role(person: Person)}{person.role
		? (roleLabels[person.role] ?? person.role)
		: '—'}{/snippet}
{#snippet actions(person: Person)}
	<Button
		type="button"
		variant="ghost"
		size="sm"
		iconOnly
		title={m.directory_location_change()}
		aria-label={m.directory_location_change_title({ name: person.fullName })}
		onclick={() => open(person)}
	>
		<MapPinIcon class="size-4" aria-hidden="true" />
	</Button>
{/snippet}

<svelte:head>
	<title>{documentTitle(m.directory_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.directory_title()}>
		{#snippet summary()}
			{data.people.length === 0
				? m.directory_lede()
				: `${data.people.length === 1 ? m.directory_summary_people_one() : m.directory_summary_people_other({ count: data.people.length })} · ${data.teams === 1 ? m.directory_summary_teams_one() : m.directory_summary_teams_other({ count: data.teams })}`}
		{/snippet}
	</PageHeader>

	<div class="mt-6">
		<DataTable
			{columns}
			rows={data.people}
			rowKey={(person) => person.id}
			rowLabel={(person) => person.fullName}
			emptyMessage={m.directory_empty()}
		/>
	</div>

	<Dialog
		open={editing !== null}
		onOpenChange={(next) => {
			if (!next) close();
		}}
		title={m.directory_location_change_title({ name: editing?.fullName ?? '' })}
		pending={saving}
	>
		{#if editing}
			<form
				method="POST"
				action="?/setLocation"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update();
						saving = false;
						if (result.type === 'success') close();
					};
				}}
				class="space-y-[var(--space-4)]"
			>
				<input type="hidden" name="personId" value={editing.id} />
				<SearchSelectField
					label={m.directory_location_field()}
					name="locationId"
					options={data.locations}
					bind:value={draftLocationId}
					placeholder={m.directory_location_none()}
					noneText={m.directory_location_none()}
					clearable
				/>

				{#if failure}
					<FormError>{failure}</FormError>
				{/if}

				<div class="flex justify-end gap-[var(--space-2)]">
					<Button type="button" variant="ghost" size="sm" onclick={close}>
						{m.form_cancel()}
					</Button>
					<Button type="submit" size="sm" busy={saving}>{m.catalogue_save()}</Button>
				</div>
			</form>
		{/if}
	</Dialog>
</PageLayout>
