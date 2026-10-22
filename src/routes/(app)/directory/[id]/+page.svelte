<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { documentTitle } from '#lib/brand.svelte.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import CommentsCard from '#lib/components/unitati/CommentsCard.svelte';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import HandoversTable from '#lib/components/unitati/HandoversTable.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { formatDateTime, formatRelative } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import TakeBackDialog from '../../assets/TakeBackDialog.svelte';
	import PersonDialogs from '../PersonDialogs.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const person = $derived(data.person);

	let dialogs: PersonDialogs | undefined = $state();
	let takeBackOpen = $state(false);
	// `?takeBack=1` (the directory row menu's link) opens the dialog on arrival.
	$effect(() => {
		if (data.openTakeBack) takeBackOpen = true;
	});

	const takeBackError = $derived(
		form?.action === 'takeBack' && 'message' in form ? form.message : undefined
	);

	/** Your own role and the last active admin's are not offered; the actions refuse them too. */
	const canChangeAccess = $derived(
		person.id !== data.selfPersonId && person.id !== data.lastAdminId
	);
	const canTakeBack = $derived(data.canCheckout && data.held.length > 0);

	/** The URL carries the confirmation and the take-back dialog, so a link reaches them. */
	function closeParam(key: string) {
		const params = new SvelteURLSearchParams(page.url.search);
		params.delete(key);
		const query = params.toString();
		return query ? `?${query}` : page.url.pathname;
	}
</script>

<svelte:head>
	<title>{documentTitle(person.fullName)}</title>
</svelte:head>

<PageLayout variant="index">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.person_breadcrumb(), href: '/directory' }, { label: person.fullName }]}
	/>
	<PageHeader title={person.fullName} level="record">
		{#snippet actions()}
			{#if canTakeBack}
				<Button variant="secondary" onclick={() => (takeBackOpen = true)}>
					{m.directory_take_back()}
				</Button>
			{/if}
			{#if data.canManagePeople}
				<Button variant="secondary" onclick={() => dialogs?.edit(person)}>
					<PencilIcon class="size-4" aria-hidden="true" />
					{m.directory_edit()}
				</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="ut-transition-fast grid size-9 place-items-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
						aria-label={m.person_actions_more()}
					>
						<EllipsisIcon class="size-4" aria-hidden="true" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-40">
						{#if !person.hasAccess}
							{#if person.active}
								<DropdownMenu.Item onSelect={() => dialogs?.access(person, 'grant')}>
									<UserPlusIcon class="size-4" aria-hidden="true" />
									{m.directory_grant_access()}
								</DropdownMenu.Item>
							{/if}
						{:else}
							{#if canChangeAccess}
								<DropdownMenu.Item onSelect={() => dialogs?.access(person, 'role')}>
									<ShieldIcon class="size-4" aria-hidden="true" />
									{m.directory_change_role()}
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Item onSelect={() => dialogs?.reset(person)}>
								<KeyRoundIcon class="size-4" aria-hidden="true" />
								{m.directory_reset_password()}
							</DropdownMenu.Item>
							{#if canChangeAccess}
								<DropdownMenu.Item
									class="text-[var(--danger)]"
									onSelect={() => dialogs?.revoke(person)}
								>
									<UserMinusIcon class="size-4" aria-hidden="true" />
									{m.directory_revoke_access()}
								</DropdownMenu.Item>
							{/if}
						{/if}
						{#if person.active}
							<DropdownMenu.Item
								class="text-[var(--danger)]"
								onSelect={() => goto('?deactivate=1')}
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
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.canManagePeople}
		<PersonDialogs
			bind:this={dialogs}
			{form}
			departments={data.departments}
			locations={data.locations}
			deactivating={data.deactivating}
			onDeactivateClose={() => goto(closeParam('deactivate'))}
		/>
	{/if}

	<div class="mt-[var(--space-6)] space-y-[var(--space-6)]">
		<WorkPanel heading={person.fullName}>
			<DescriptionList
				items={[
					{ label: m.person_detail_email(), value: person.email },
					{ label: m.person_detail_department(), value: person.departmentName },
					{ label: m.person_detail_location(), value: person.locationPath },
					{
						label: m.person_detail_status(),
						value: person.active ? m.person_detail_active() : m.person_detail_inactive()
					}
				]}
			/>
		</WorkPanel>

		{#if data.handovers}
			<WorkPanel heading={m.person_detail_holdings()}>
				{#if data.held.length === 0}
					<p class="text-sm text-[var(--ink-muted)]">{m.person_detail_holdings_empty()}</p>
				{:else}
					<ul class="space-y-[var(--space-1)] text-sm">
						{#each data.held as asset (asset.id)}
							<li>
								<a
									href="/assets/{encodeURIComponent(asset.assetTag)}"
									class="font-mono text-xs hover:underline">{asset.assetTag}</a
								>
								{asset.name}
							</li>
						{/each}
					</ul>
				{/if}
			</WorkPanel>
		{/if}

		{#if data.tickets}
			<WorkPanel heading={m.person_tickets_title()}>
				{#snippet actions()}
					<a href="/service-desk?requester={person.id}" class="text-sm font-medium hover:underline">
						{m.person_tickets_all()}
					</a>
				{/snippet}
				{#if data.tickets.length === 0}
					<p class="text-sm text-[var(--ink-muted)]">{m.person_tickets_empty()}</p>
				{:else}
					<ul class="divide-y divide-[var(--border)] text-sm">
						{#each data.tickets as ticket (ticket.id)}
							<li class="flex flex-wrap items-center gap-[var(--space-3)] py-[var(--space-2)]">
								<a
									href="/service-desk/{encodeURIComponent(ticket.ticketTag)}"
									class="font-mono text-xs hover:underline">{ticket.ticketTag}</a
								>
								<span class="min-w-0 flex-1 truncate">{ticket.subject}</span>
								<StatusBadge status={ticket.status} />
								<time
									class="text-xs text-[var(--ink-muted)]"
									datetime={ticket.updatedAt.toISOString()}
									title={formatDateTime(ticket.updatedAt)}
								>
									{formatRelative(ticket.updatedAt)}
								</time>
							</li>
						{/each}
					</ul>
				{/if}
			</WorkPanel>
		{/if}

		{#if data.handovers}
			<section class="space-y-[var(--space-3)]">
				<h2 class="text-title-3 text-[var(--ink)]">{m.person_handovers_title()}</h2>
				<HandoversTable
					rows={data.handovers}
					showPerson={false}
					emptyMessage={m.person_handovers_empty()}
				/>
			</section>
		{/if}

		<CommentsCard
			id="comments"
			comments={data.comments}
			action="?/addComment"
			canComment={data.canManagePeople}
			error={form?.action === 'addComment' && 'message' in form ? form.message : undefined}
		/>

		<WorkPanel heading={m.person_activity_title()}>
			{#if data.timeline.length === 0}
				<p class="text-sm text-[var(--ink-muted)]">{m.person_activity_empty()}</p>
			{:else}
				<AssetTimeline items={data.timeline} />
			{/if}
		</WorkPanel>
	</div>
</PageLayout>

{#if data.canCheckout && takeBackOpen && canTakeBack}
	<TakeBackDialog
		open={true}
		onOpenChange={(next) => {
			if (!next) {
				takeBackOpen = false;
				if (page.url.searchParams.has('takeBack')) goto(closeParam('takeBack'));
			}
		}}
		person={{ id: person.id, fullName: person.fullName }}
		assets={data.held}
		action="?/takeBack"
		error={takeBackError}
	/>
{/if}
