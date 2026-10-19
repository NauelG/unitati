<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { documentTitle } from '#lib/brand.svelte.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import Button, { button } from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const roleLabels: Record<string, string> = {
		admin: m.role_admin(),
		technician: m.role_technician(),
		employee: m.role_employee()
	};

	type Person = PageProps['data']['people'][number];

	/** The person being edited, or `'new'` for the create dialog; one dialog serves both. */
	let editing = $state<Person | 'new' | null>(data.openCreate ? 'new' : null);
	let draftName = $state('');
	let draftEmail = $state('');
	let draftDepartmentId = $state<string | null>(null);
	let draftLocationId = $state<string | null>(null);
	let saving = $state(false);

	const person = $derived(editing && editing !== 'new' ? editing : null);

	function openCreate() {
		draftName = '';
		draftEmail = '';
		draftDepartmentId = null;
		draftLocationId = null;
		editing = 'new';
	}

	function openEdit(target: Person) {
		draftName = target.fullName;
		draftEmail = target.email;
		draftDepartmentId = target.departmentId;
		draftLocationId = target.locationId;
		editing = target;
	}

	function close() {
		editing = null;
	}

	const failure = $derived(
		form && 'message' in form && form.message
			? form.action === 'createPerson' && editing === 'new'
				? (form.message as string)
				: form.action === 'updatePerson' && person && form.id === person.id
					? (form.message as string)
					: null
			: null
	);

	/** The dialog's refusal that belongs under the email field. */
	const emailFailure = $derived(
		failure === m.directory_error_duplicate_email() ? failure : undefined
	);
	const dialogFailure = $derived(emailFailure ? null : failure);

	/** The state of the toggle and the confirmation live in the URL, so a link reaches them. */
	function search(changes: Record<string, string | null>) {
		const params = new SvelteURLSearchParams(page.url.search);
		params.delete('new');
		for (const [key, value] of Object.entries(changes)) {
			if (value === null) params.delete(key);
			else params.set(key, value);
		}
		const query = params.toString();
		return query ? `?${query}` : page.url.pathname;
	}

	const confirming = $derived(
		data.deactivating ? (data.people.find((p) => p.id === data.deactivating?.id) ?? null) : null
	);
	let pending = $state(false);

	/** Reactivating asks nothing: one hidden form, filled with whoever was picked. */
	let reactivateForm: HTMLFormElement | undefined = $state();
	let reactivateId = $state('');

	async function reactivate(target: Person) {
		reactivateId = target.id;
		await tick();
		reactivateForm?.requestSubmit();
	}

	function holdings(counts: NonNullable<typeof data.deactivating>): string {
		const parts = [
			counts.assets > 0
				? counts.assets === 1
					? m.directory_holds_assets_one()
					: m.directory_holds_assets_other({ count: counts.assets })
				: null,
			counts.tickets > 0
				? counts.tickets === 1
					? m.directory_holds_tickets_one()
					: m.directory_holds_tickets_other({ count: counts.tickets })
				: null
		].filter((part) => part !== null);
		if (parts.length === 0) return m.directory_deactivate_ask();
		const held =
			parts.length === 2
				? m.directory_holds_both({ assets: parts[0], tickets: parts[1] })
				: parts[0];
		return `${m.directory_holds_summary({ holds: held })} ${m.directory_deactivate_ask()}`;
	}

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
						header: m.directory_column_actions(),
						kind: 'actions' as const,
						cell: actions
					}
				]
			: [])
	]);
</script>

{#snippet name(person: Person)}
	{person.fullName}
	{#if !person.active}
		<span
			class="ml-[var(--space-2)] rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-[var(--space-2)] py-0.5 text-xs text-[var(--ink-muted)]"
		>
			{m.directory_inactive_badge()}
		</span>
	{/if}
{/snippet}
{#snippet email(person: Person)}{person.email}{/snippet}
{#snippet department(person: Person)}{person.departmentName ??
		m.directory_no_department()}{/snippet}
{#snippet location(person: Person)}{person.locationPath ?? m.directory_no_location()}{/snippet}
{#snippet role(person: Person)}{person.role
		? (roleLabels[person.role] ?? person.role)
		: '—'}{/snippet}
{#snippet actions(person: Person)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="ut-transition-fast grid size-8 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
			aria-label={m.directory_actions_label({ name: person.fullName })}
		>
			<EllipsisIcon class="size-4" aria-hidden="true" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-40">
			<DropdownMenu.Item onSelect={() => openEdit(person)}>
				<PencilIcon class="size-4" aria-hidden="true" />
				{m.directory_edit()}
			</DropdownMenu.Item>
			{#if person.active}
				<DropdownMenu.Item
					class="text-[var(--danger)]"
					onSelect={() => goto(search({ deactivate: person.id }))}
				>
					<UserXIcon class="size-4" aria-hidden="true" />
					{m.directory_deactivate()}
				</DropdownMenu.Item>
			{:else}
				<DropdownMenu.Item onSelect={() => reactivate(person)}>
					<UserCheckIcon class="size-4" aria-hidden="true" />
					{m.directory_reactivate()}
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
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
		{#snippet actions()}
			<a
				href={search({ inactive: data.showInactive ? null : '1', deactivate: null })}
				class={button({ variant: 'ghost', size: 'sm' })}
				aria-pressed={data.showInactive}
				data-sveltekit-noscroll
			>
				{m.directory_show_inactive()}
			</a>
			{#if data.canManagePeople}
				<Button onclick={openCreate}>{m.directory_new()}</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if form && 'message' in form && form.message && ['reactivatePerson', 'deactivatePerson'].includes(form.action) && !confirming}
		<FormError class="mt-[var(--space-4)]">{form.message}</FormError>
	{/if}

	<div class="mt-6">
		<DataTable
			{columns}
			rows={data.people}
			rowKey={(person) => person.id}
			rowLabel={(person) => person.fullName}
			emptyMessage={m.directory_empty()}
		/>
	</div>

	{#if data.canManagePeople}
		<form
			bind:this={reactivateForm}
			method="POST"
			action="?/reactivatePerson"
			use:enhance
			class="hidden"
		>
			<input type="hidden" name="id" value={reactivateId} />
		</form>

		<Dialog
			open={editing !== null}
			onOpenChange={(next) => {
				if (!next) close();
			}}
			title={person ? m.directory_edit_title({ name: person.fullName }) : m.directory_new_title()}
			pending={saving}
		>
			{#if editing}
				<form
					method="POST"
					action={person ? '?/updatePerson' : '?/createPerson'}
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							await update({ reset: false });
							saving = false;
							if (result.type === 'success') close();
						};
					}}
					class="space-y-[var(--space-4)]"
				>
					{#if person}
						<input type="hidden" name="id" value={person.id} />
					{/if}
					<Field
						label={m.directory_field_name()}
						name="fullName"
						bind:value={draftName}
						maxlength={120}
						required
					/>
					<!-- A disabled input is not posted, so a locked email can never travel. -->
					<Field
						label={m.directory_field_email()}
						name="email"
						type="email"
						bind:value={draftEmail}
						disabled={person?.hasAccess ?? false}
						hint={person?.hasAccess ? m.directory_email_locked() : undefined}
						error={emailFailure}
						required
					/>
					<SelectField
						label={m.directory_field_department()}
						name="departmentId"
						options={data.departments}
						bind:value={draftDepartmentId}
						placeholder={m.directory_no_department()}
					/>
					<SearchSelectField
						label={m.directory_location_field()}
						name="locationId"
						options={data.locations}
						bind:value={draftLocationId}
						placeholder={m.directory_location_none()}
						noneText={m.directory_location_none()}
						clearable
					/>

					{#if dialogFailure}
						<FormError>{dialogFailure}</FormError>
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

		<ConfirmDialog
			open={confirming !== null}
			onOpenChange={(next) => {
				if (!next) goto(search({ deactivate: null }));
			}}
			title={m.directory_deactivate_title({ name: confirming?.fullName ?? '' })}
			description={data.deactivating ? holdings(data.deactivating) : ''}
			confirmLabel={m.directory_deactivate()}
			{pending}
			error={confirming && form?.action === 'deactivatePerson' && form.id === confirming.id
				? form.message
				: null}
		>
			{#snippet action(confirm)}
				<form
					method="POST"
					action="?/deactivatePerson"
					use:enhance={confirmSubmit({
						onPending: (value) => (pending = value),
						onSettled: (succeeded) => {
							if (succeeded) goto(search({ deactivate: null }), {});
						}
					})}
				>
					<input type="hidden" name="id" value={confirming?.id ?? ''} />
					{@render confirm()}
				</form>
			{/snippet}
		</ConfirmDialog>
	{/if}
</PageLayout>
