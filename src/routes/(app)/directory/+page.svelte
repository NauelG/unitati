<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PackageCheckIcon from '@lucide/svelte/icons/package-check';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import UnlinkIcon from '@lucide/svelte/icons/unlink';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { documentTitle } from '#lib/brand.svelte.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import Button, { button } from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import PersonDialogs from './PersonDialogs.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const roleLabels: Record<string, string> = {
		admin: m.role_admin(),
		technician: m.role_technician(),
		employee: m.role_employee()
	};

	type Person = PageProps['data']['people'][number];

	let dialogs: PersonDialogs | undefined = $state();

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

	// A technician who can take equipment back has the menu too, with that one item.
	const hasMenu = $derived(data.canEditPeople || data.canManagePeople || data.canCheckout);

	const columns = $derived<DataTableColumn<Person>[]>([
		{ key: 'name', header: m.directory_column_name(), cell: name },
		{ key: 'email', header: m.directory_column_email(), cell: email },
		{ key: 'department', header: m.directory_column_department(), cell: department },
		{ key: 'location', header: m.directory_column_location(), cell: location },
		{ key: 'role', header: m.directory_column_role(), cell: role },
		...(hasMenu
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
{#snippet role(person: Person)}{person.hasAccess && person.role
		? (roleLabels[person.role] ?? person.role)
		: m.directory_no_access()}{/snippet}
{#snippet actions(person: Person)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="ut-transition-fast grid size-8 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
			aria-label={m.directory_actions_label({ name: person.fullName })}
		>
			<EllipsisIcon class="size-4" aria-hidden="true" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-40">
			{#if data.canCheckout}
				<DropdownMenu.Item onSelect={() => goto(`/directory/${person.id}?takeBack=1`)}>
					<PackageCheckIcon class="size-4" aria-hidden="true" />
					{m.directory_take_back()}
				</DropdownMenu.Item>
			{/if}
			{#if data.canEditPeople}
				<DropdownMenu.Item onSelect={() => dialogs?.edit(person)}>
					<PencilIcon class="size-4" aria-hidden="true" />
					{m.directory_edit()}
				</DropdownMenu.Item>
			{/if}
			{#if data.canManagePeople}
				{#if !person.hasAccess}
					{#if person.active && !data.ssoRequired}
						<DropdownMenu.Item onSelect={() => dialogs?.access(person, 'grant')}>
							<UserPlusIcon class="size-4" aria-hidden="true" />
							{m.directory_grant_access()}
						</DropdownMenu.Item>
					{/if}
				{:else}
					<!-- Your own role and the last active admin's are not offered; the actions refuse them too. -->
					{#if person.id !== data.selfPersonId && person.id !== data.lastAdminId}
						<DropdownMenu.Item onSelect={() => dialogs?.access(person, 'role')}>
							<ShieldIcon class="size-4" aria-hidden="true" />
							{m.directory_change_role()}
						</DropdownMenu.Item>
					{/if}
					<!-- While SSO is required only an admin keeps a password (ADR 0056). -->
					{#if !data.ssoRequired || person.role === 'admin'}
						<DropdownMenu.Item onSelect={() => dialogs?.reset(person)}>
							<KeyRoundIcon class="size-4" aria-hidden="true" />
							{m.directory_reset_password()}
						</DropdownMenu.Item>
					{/if}
					{#if person.id !== data.selfPersonId && person.id !== data.lastAdminId}
						<DropdownMenu.Item
							class="text-[var(--danger)]"
							onSelect={() => dialogs?.revoke(person)}
						>
							<UserMinusIcon class="size-4" aria-hidden="true" />
							{m.directory_revoke_access()}
						</DropdownMenu.Item>
					{/if}
				{/if}
				{#if data.canUnlinkIdentity && person.hasIdentity}
					<DropdownMenu.Item onSelect={() => dialogs?.unlink(person)}>
						<UnlinkIcon class="size-4" aria-hidden="true" />
						{m.directory_unlink_identity()}
					</DropdownMenu.Item>
				{/if}
				{#if person.active}
					<DropdownMenu.Item
						class="text-[var(--danger)]"
						onSelect={() => goto(search({ deactivate: person.id }))}
					>
						<UserXIcon class="size-4" aria-hidden="true" />
						{m.directory_deactivate()}
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item onSelect={() => dialogs?.reactivate(person)}>
						<UserCheckIcon class="size-4" aria-hidden="true" />
						{m.directory_reactivate()}
					</DropdownMenu.Item>
				{/if}
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
			{#if data.canEditPeople}
				<Button href="/directory/import" variant="secondary">{m.import_open()}</Button>
				<Button onclick={() => dialogs?.create()}>{m.directory_new()}</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.canEditPeople}
		<PersonDialogs
			bind:this={dialogs}
			{form}
			departments={data.departments}
			locations={data.locations}
			deactivating={data.deactivating}
			onDeactivateClose={() => goto(search({ deactivate: null }))}
			openCreate={data.openCreate}
		/>
	{/if}

	<div class="mt-6">
		<DataTable
			{columns}
			rows={data.people}
			rowKey={(person) => person.id}
			rowLabel={(person) => person.fullName}
			href={(person) => `/directory/${person.id}`}
			emptyMessage={m.directory_empty()}
		/>
	</div>
</PageLayout>
