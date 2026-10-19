<script lang="ts">
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import EscalateSheet from '#lib/components/unitati/EscalateSheet.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import QueueLabel from '#lib/components/unitati/QueueLabel.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import { statusBadge, statusLabel } from '#lib/components/unitati/status.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import TicketThread, {
		type PendingThreadItem
	} from '#lib/components/unitati/TicketThread.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { keymapRegistry } from '#lib/keymap.js';
	import {
		ESCALATE_TICKET_EVENT,
		LINK_ASSET_EVENT,
		paletteContext
	} from '#lib/palette-context.svelte.js';
	import { formatDateTime } from '#lib/format-date.js';
	import { PRIORITIES } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { ThreadItem } from '#lib/server/service-desk/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const ticket = $derived(data.ticket);

	/**
	 * Optimistic mirrors (#89), same shape as the asset detail page: each
	 * action form flips one of these the instant it submits and rolls back to
	 * the pre-flip snapshot on `failure`/`error` (`optimisticEnhance`,
	 * `#lib/optimistic.ts`). `localThread` additionally carries the composer's
	 * own pending reply until it reconciles or fails.
	 */
	let localStatus = $state(ticket.status);
	let localPriority = $state(ticket.priority);
	let localAssigneePersonId = $state(ticket.assigneePersonId);
	let localAssigneeName = $state(ticket.assigneeName);
	let localQueueId = $state(ticket.queueId);
	let localQueueName = $state(ticket.queueName);
	let localQueueColor = $state(ticket.queueColor);
	// A writable `$derived` (Svelte 5: a direct assignment overrides it until
	// `data.thread` itself changes again) rather than `$state` + `$effect` —
	// the lone assignment here has nothing else to coordinate with.
	let localThread = $derived<(ThreadItem | PendingThreadItem)[]>(data.thread);

	$effect(() => {
		localStatus = ticket.status;
		localPriority = ticket.priority;
		localAssigneePersonId = ticket.assigneePersonId;
		localAssigneeName = ticket.assigneeName;
		localQueueId = ticket.queueId;
		localQueueName = ticket.queueName;
		localQueueColor = ticket.queueColor;
	});

	const provenance = $derived(
		m.ticket_detail_opened({
			name: ticket.requesterName,
			when: formatDateTime(ticket.createdAt),
			channel: ticket.channel === 'portal' ? m.ticket_channel_portal() : m.ticket_channel_agent()
		})
	);

	const toneOf = (value: Parameters<typeof statusBadge>[0]) =>
		statusBadge(value)?.tone ?? 'neutral';
	// The chip shows where the ticket is; only the legal next states are offered besides it.
	// `nextStatuses` comes from `load`, so it follows the status once the action reconciles.
	const statusOptions = $derived(
		// Deduplicated: right after a pick `localStatus` is already the new status while
		// `nextStatuses` still lists it, and a repeated value is a duplicate key in the list.
		[...new Set([localStatus, ...data.nextStatuses])].map((value) => ({
			value,
			label: statusLabel(value),
			tone: toneOf(value)
		}))
	);
	const priorityOptions = $derived(
		PRIORITIES.map((value) => ({
			value,
			label: value === 'normal' ? m.ticket_priority_normal() : statusLabel(value),
			tone: toneOf(value)
		}))
	);
	const queueOptions = $derived(
		data.queues.map((queue) => ({ value: queue.id, label: queue.name }))
	);
	const peopleOptions = $derived(
		data.people.map((person) => ({ value: person.id, label: person.fullName }))
	);

	function optimisticStatus(formData: FormData) {
		const next = formData.get('status');
		const previous = localStatus;
		if (typeof next === 'string') localStatus = next as typeof localStatus;
		return () => {
			localStatus = previous;
		};
	}

	function optimisticPriority(formData: FormData) {
		const next = formData.get('priority');
		const previous = localPriority;
		if (typeof next === 'string') localPriority = next as typeof localPriority;
		return () => {
			localPriority = previous;
		};
	}

	function optimisticAssignee(formData: FormData) {
		const personId = formData.get('personId');
		const previousId = localAssigneePersonId;
		const previousName = localAssigneeName;
		const nextId = typeof personId === 'string' && personId !== '' ? personId : null;
		localAssigneePersonId = nextId;
		localAssigneeName = nextId
			? (data.people.find((candidate) => candidate.id === nextId)?.fullName ?? previousName)
			: null;
		return () => {
			localAssigneePersonId = previousId;
			localAssigneeName = previousName;
		};
	}

	function optimisticQueue(formData: FormData) {
		const queueId = formData.get('queueId');
		const previousId = localQueueId;
		const previousName = localQueueName;
		const previousColor = localQueueColor;
		if (typeof queueId === 'string') {
			const next = data.queues.find((candidate) => candidate.id === queueId);
			localQueueId = queueId;
			localQueueName = next?.name ?? previousName;
			localQueueColor = next?.color ?? previousColor;
		}
		return () => {
			localQueueId = previousId;
			localQueueName = previousName;
			localQueueColor = previousColor;
		};
	}

	const unlinkError = $derived(
		form &&
			'action' in form &&
			(form.action === 'unlinkAsset' ||
				form.action === 'unlinkTask' ||
				form.action === 'unlinkProject') &&
			'message' in form
			? form.message
			: undefined
	);

	/**
	 * The escalation Sheet (#150). The header button, the palette and the keymap
	 * all open this one. It is only wired up for someone who may manage tickets.
	 */
	let escalateOpen = $state(false);
	const escalation = $derived(data.escalation);

	$effect(() => {
		if (!escalation) return;
		const open = () => (escalateOpen = true);
		paletteContext.escalatableTicketTag = ticket.ticketTag;
		window.addEventListener(ESCALATE_TICKET_EVENT, open);
		const unregister = keymapRegistry.register({
			id: 'tickets.escalate',
			keys: ['e'],
			scope: 'global',
			group: m.keymap_group_tickets(),
			label: m.keymap_entry_escalate_ticket(),
			permission: 'tickets.manage',
			run: open
		});
		return () => {
			window.removeEventListener(ESCALATE_TICKET_EVENT, open);
			paletteContext.escalatableTicketTag = null;
			unregister();
		};
	});

	// The palette's "Vincular activo" opens the panel's own dialog (#79).
	let linkOpen = $state(false);
	$effect(() => {
		if (!data.canManage) return;
		const open = () => (linkOpen = true);
		window.addEventListener(LINK_ASSET_EVENT, open);
		return () => window.removeEventListener(LINK_ASSET_EVENT, open);
	});

	const replyError = $derived(
		form && 'action' in form && form.action === 'reply' && 'message' in form
			? form.message
			: undefined
	);
</script>

<svelte:head>
	<title>{documentTitle(ticket.ticketTag, ticket.subject)}</title>
</svelte:head>

{#snippet assigneeValue()}
	<EditableDetailRow
		kind="select"
		label={m.ticket_detail_assignee()}
		value={localAssigneePersonId}
		display={localAssigneeName ?? ''}
		placeholder={m.tickets_no_assignee()}
		noneLabel={m.tickets_no_assignee()}
		options={peopleOptions}
		action="?/assign"
		name="personId"
		editable={data.canManage}
		optimistic={optimisticAssignee}
	/>
{/snippet}

{#snippet queueValue()}
	{#if data.canManage}
		<EditableDetailRow
			kind="select"
			label={m.ticket_detail_queue()}
			value={localQueueId}
			display={localQueueName}
			options={queueOptions}
			action="?/queue"
			name="queueId"
			editable
			optimistic={optimisticQueue}
		/>
	{:else}
		<QueueLabel name={localQueueName} color={localQueueColor} />
	{/if}
{/snippet}

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[
			{ label: m.nav_service_desk(), href: '/service-desk' },
			{ label: ticket.queueName, href: `/service-desk?queue=${ticket.queueId}` },
			{ label: ticket.ticketTag }
		]}
	/>

	<WorkPanel>
		<TicketDetailLayout
			ticketTag={ticket.ticketTag}
			ticketTagViewTransitionName={toViewTransitionName('record', ticket.ticketTag)}
			subject={ticket.subject}
			status={localStatus}
			priority={localPriority}
			{provenance}
		>
			{#snippet statusChip()}
				<EditableChip
					value={localStatus}
					options={statusOptions}
					action="?/status"
					name="status"
					editable={data.canManage && data.nextStatuses.length > 0}
					optimistic={optimisticStatus}
					openOnHash="#action-status"
					label={m.ticket_detail_status()}
				/>
			{/snippet}
			{#snippet priorityChip()}
				<EditableChip
					value={localPriority}
					options={priorityOptions}
					action="?/priority"
					name="priority"
					editable={data.canManage}
					optimistic={optimisticPriority}
					label={m.ticket_detail_priority()}
				/>
			{/snippet}
			{#snippet actions()}
				{#if escalation}
					<Button variant="secondary" onclick={() => (escalateOpen = true)}>
						<ArrowUpRight class="size-4" aria-hidden="true" />
						{m.ticket_escalate_action()}
					</Button>
				{/if}
			{/snippet}
		</TicketDetailLayout>

		<div class="mt-[var(--space-5)]">
			<TicketThread items={localThread} attachmentHref={(id) => `/attachments/${id}`} />
		</div>
	</WorkPanel>

	<TicketComposer
		action="?/reply"
		allowInternal={data.canInternal}
		error={replyError}
		placeholder={m.composer_placeholder_reply({ name: ticket.requesterName })}
		onOptimisticSend={(formData) => {
			const body = formData.get('body');
			if (typeof body !== 'string' || body.trim() === '') return () => {};
			const key = `pending-${crypto.randomUUID()}`;
			const pending: PendingThreadItem = {
				kind: 'pending',
				key,
				authorName: data.user.name,
				visibility: formData.get('visibility') === 'internal' ? 'internal' : 'public',
				body
			};
			localThread = [...localThread, pending];
			return () => {
				localThread = localThread.filter((item) => !(item.kind === 'pending' && item.key === key));
			};
		}}
	/>

	{#snippet side()}
		<WorkPanel heading={m.ticket_detail_details()}>
			<DescriptionList
				items={[
					{ label: m.ticket_detail_requester(), value: ticket.requesterName },
					...('requesterLocation' in data
						? [
								{
									label: m.ticket_detail_requester_location(),
									value: data.requesterLocation?.path ?? m.directory_no_location()
								}
							]
						: []),
					{ label: m.ticket_detail_assignee(), value: assigneeValue },
					{ label: m.ticket_detail_queue(), value: queueValue }
				]}
			/>
		</WorkPanel>

		<!-- Streamed (#89): `related` is read on the same scoped footing as the
		     ticket itself but nothing above it needs the answer first. -->
		{#await data.related}
			<WorkPanel heading={m.related_title()}>
				<div role="status" aria-live="polite">
					<span class="sr-only">{m.loading_generic()}</span>
					<Skeleton class="h-4 w-32" />
					<div class="mt-[var(--space-3)] space-y-[var(--space-2)]">
						<Skeleton class="h-5 w-full" />
						<Skeleton class="h-5 w-3/4" />
					</div>
				</div>
			</WorkPanel>
		{:then relatedGroups}
			<RelationConstellation
				centre={{ kind: 'ticket', tag: ticket.ticketTag }}
				groups={relatedGroups}
			/>
			{@const assetGroups = relatedGroups.filter((group) => group.relation === 'affects')}
			<RelatedRecords
				groups={relatedGroups}
				unlinkActions={data.canManage
					? { asset: '?/unlinkAsset', task: '?/unlinkTask', project: '?/unlinkProject' }
					: {}}
				error={unlinkError}
				linkAction={data.canManage ? '?/linkAssets' : undefined}
				linkLabel={m.related_link_asset()}
				linkDescription={m.related_link_asset_lede()}
				linkFieldLabel={m.related_link_asset_field()}
				linkPlaceholder={m.related_link_asset_placeholder()}
				linkSearchUrl="/service-desk/new/assets"
				linkSubmitLabel={(count) =>
					count === 0
						? m.related_link_asset_submit_none()
						: count === 1
							? m.related_link_asset_submit_one({ count })
							: m.related_link_asset_submit_other({ count })}
				linkedIds={assetGroups.flatMap((group) => group.items.map((item) => item.ref.id))}
				bind:linkOpen
			/>
		{/await}
	{/snippet}
</PageLayout>

{#if escalation}
	<EscalateSheet
		open={escalateOpen}
		onOpenChange={(next) => (escalateOpen = next)}
		ticket={{
			tag: ticket.ticketTag,
			statusLabel: statusLabel(localStatus),
			assigneeName: localAssigneeName
		}}
		draft={escalation.draft}
		projectName={ticket.subject}
		canCreate={escalation.canCreate}
		people={peopleOptions}
		defaultOwnerId={data.user.personId}
		searchBase="/service-desk/{encodeURIComponent(ticket.ticketTag)}/escalate"
	/>
{/if}
