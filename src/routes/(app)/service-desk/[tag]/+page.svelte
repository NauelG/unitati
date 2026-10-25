<script lang="ts">
	import { enhance } from '$app/forms';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import EscalateSheet from '#lib/components/unitati/EscalateSheet.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import FollowControl from '#lib/components/unitati/FollowControl.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import PageCitePanel from '#lib/components/unitati/PageCitePanel.svelte';
	import QueueLabel from '#lib/components/unitati/QueueLabel.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
	import EditableText from '#lib/components/unitati/EditableText.svelte';
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import { statusBadge, statusLabel } from '#lib/components/unitati/status.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import TicketThread, {
		type PendingThreadItem
	} from '#lib/components/unitati/TicketThread.svelte';
	import TimePanel from '#lib/components/unitati/TimePanel.svelte';
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

	/** A refusal of one of the Time section's actions, placed in its form. */
	const timeError = $derived(
		form &&
			['logTime', 'editTime', 'deleteTime', 'startTimer', 'saveTimer', 'discardTimer'].includes(
				form.action
			) &&
			'message' in form
			? String(form.message)
			: null
	);

	/**
	 * Optimistic mirrors (#89), same shape as the asset detail page: each
	 * action form flips one of these the instant it submits and rolls back to
	 * the pre-flip snapshot on `failure`/`error` (`optimisticEnhance`,
	 * `#lib/optimistic.ts`). `localThread` additionally carries the composer's
	 * own pending reply until it reconciles or fails.
	 */
	let localSubject = $state(ticket.subject);
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
		localSubject = ticket.subject;
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
		data.choices.queues.map((queue) => ({ value: queue.id, label: queue.name }))
	);
	const peopleOptions = $derived(
		data.choices.people.map((person) => ({ value: person.id, label: person.fullName }))
	);

	function optimisticSubject(formData: FormData) {
		const next = formData.get('subject');
		const previous = localSubject;
		if (typeof next === 'string') localSubject = next;
		return () => {
			localSubject = previous;
		};
	}

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
			? (data.choices.people.find((candidate) => candidate.id === nextId)?.fullName ?? previousName)
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
			const next = data.choices.queues.find((candidate) => candidate.id === queueId);
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

	const linkHandoverError = $derived(
		form && 'action' in form && form.action === 'linkHandover' && 'message' in form
			? form.message
			: undefined
	);

	const unlinkError = $derived(
		form &&
			'action' in form &&
			(form.action === 'unlinkAsset' ||
				form.action === 'unlinkHandover' ||
				form.action === 'uncitePage' ||
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
	const escalation = $derived(data.may.escalate ? data.escalationDraft : null);

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
		if (!data.may.link) return;
		const open = () => (linkOpen = true);
		window.addEventListener(LINK_ASSET_EVENT, open);
		return () => window.removeEventListener(LINK_ASSET_EVENT, open);
	});

	const replyError = $derived(
		form && 'action' in form && form.action === 'reply' && 'message' in form
			? form.message
			: undefined
	);
	const formMessage = (action: string) =>
		form && 'action' in form && form.action === action && 'message' in form
			? form.message
			: undefined;
	const editError = $derived(formMessage('editComment'));
	const citeError = $derived(formMessage('citePage'));
	const subjectError = $derived(formMessage('subject'));
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
		editable={data.may.assign}
		optimistic={optimisticAssignee}
	/>
{/snippet}

{#snippet queueValue()}
	{#if data.may.moveToQueue}
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
			subject={localSubject}
			status={localStatus}
			priority={localPriority}
			{provenance}
		>
			{#snippet subjectEditor(className)}
				<EditableText
					value={localSubject}
					editable={data.may.editSubject}
					action="?/subject"
					name="subject"
					optimistic={optimisticSubject}
					label={m.ticket_detail_subject()}
					level={1}
					class={className}
					error={subjectError}
				/>
			{/snippet}
			{#snippet statusChip()}
				<EditableChip
					value={localStatus}
					options={statusOptions}
					action="?/status"
					name="status"
					editable={data.may.changeStatus}
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
					editable={data.may.setPriority}
					optimistic={optimisticPriority}
					label={m.ticket_detail_priority()}
				/>
			{/snippet}
			{#snippet actions()}
				<FollowControl follow={data.follow} />
				{#if escalation}
					<Button variant="secondary" onclick={() => (escalateOpen = true)}>
						<ArrowUpRight class="size-4" aria-hidden="true" />
						{m.ticket_escalate_action()}
					</Button>
				{/if}
			{/snippet}
		</TicketDetailLayout>

		<div class="mt-[var(--space-5)]">
			<TicketThread
				items={localThread}
				attachmentHref={(id) => `/attachments/${id}`}
				editAction="?/editComment"
				mentionsUrl={`/service-desk/${ticket.ticketTag}/mentions`}
				{editError}
			/>
		</div>
	</WorkPanel>

	<TicketComposer
		action="?/reply"
		allowInternal={data.may.commentInternal}
		mentionsUrl={`/service-desk/${ticket.ticketTag}/mentions`}
		pagesUrl={data.may.citePage ? '/knowledge/pages/pick' : undefined}
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
					{ label: m.ticket_detail_queue(), value: queueValue },
					...(ticket.requestFormName
						? [{ label: m.ticket_request_form(), value: ticket.requestFormName }]
						: []),
					...(data.requestedCategory
						? [{ label: m.ticket_request_category(), value: data.requestedCategory.name }]
						: [])
				]}
			/>
		</WorkPanel>

		{#if data.time}
			<TimePanel
				entries={data.time.entries}
				totalMinutes={data.time.totalMinutes}
				types={data.time.types}
				canLog={data.time.canLog}
				timer={data.time.timer}
				error={timeError}
			/>
		{/if}

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
				unlinkActions={data.may.unlink
					? {
							asset: '?/unlinkAsset',
							task: '?/unlinkTask',
							project: '?/unlinkProject',
							handover: '?/unlinkHandover',
							page: '?/uncitePage'
						}
					: {}}
				error={unlinkError}
				linkAction={data.may.link ? '?/linkAssets' : undefined}
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
			{#if data.may.citePage}
				<PageCitePanel
					heading={m.ticket_page_cite_title()}
					label={m.ticket_page_cite_field()}
					placeholder={m.ticket_page_cite_placeholder()}
					submitLabel={m.ticket_page_cite_submit()}
					action="?/citePage"
					searchUrl="/knowledge/pages/pick?format=options&citable=internal"
					error={citeError}
				/>
			{/if}
			{#if data.may.linkHandover}
				<WorkPanel heading={m.ticket_handover_title()}>
					<div class="space-y-[var(--space-3)]">
						{#if data.may.deliver && data.requestedCategory}
							<!-- An equipment request: the in-stock assets of the category asked for. -->
							{#if data.choices.inStockForRequest.length === 0}
								<p class="m-0 text-sm text-[var(--ink-muted)]">
									{m.ticket_request_deliver_none({ category: data.requestedCategory.name })}
								</p>
							{:else}
								<ul class="m-0 list-none space-y-[var(--space-1)] p-0 text-sm">
									{#each data.choices.inStockForRequest as stocked (stocked.assetTag)}
										<li>
											<a
												class="text-[var(--brand)] hover:underline"
												href="/assets/{encodeURIComponent(
													stocked.assetTag
												)}?ticket={encodeURIComponent(ticket.ticketTag)}#action-custody"
											>
												{m.ticket_request_deliver_asset({ asset: stocked.assetTag })}
											</a>
											<span class="text-[var(--ink-muted)]">{stocked.name}</span>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
						{#if data.may.deliver}
							<ul class="m-0 list-none space-y-[var(--space-1)] p-0 text-sm">
								{#each assetGroups.flatMap((group) => group.items) as item (item.ref.id)}
									<li>
										<a
											class="text-[var(--brand)] hover:underline"
											href="/assets/{encodeURIComponent(item.ref.tag)}?ticket={encodeURIComponent(
												ticket.ticketTag
											)}#action-custody"
										>
											{m.ticket_handover_deliver({ asset: item.ref.tag })}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
						<form
							method="POST"
							action="?/linkHandover"
							use:enhance
							class="space-y-[var(--space-2)]"
						>
							<Field
								label={m.ticket_handover_link_label()}
								name="code"
								placeholder={m.ticket_handover_link_placeholder()}
								autocomplete="off"
								error={linkHandoverError}
								required
							/>
							<Button type="submit" size="sm" variant="secondary">
								{m.ticket_handover_link_submit()}
							</Button>
						</form>
					</div>
				</WorkPanel>
			{/if}
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
		draft={escalation}
		projectName={ticket.subject}
		canCreate={data.may.escalateCreate}
		people={peopleOptions}
		defaultOwnerId={data.user.personId}
		searchBase="/service-desk/{encodeURIComponent(ticket.ticketTag)}/escalate"
	/>
{/if}
