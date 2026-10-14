<script lang="ts">
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import TicketThread, {
		type PendingThreadItem
	} from '#lib/components/unitati/TicketThread.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { focusFirstField } from '#lib/keymap.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { PRIORITIES } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { ThreadItem } from '#lib/server/service-desk/index.js';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The keymap's `s` row verb (#88) lands here with `#action-status`. */
	$effect(() => {
		if (!location.hash) return;
		focusFirstField(document.querySelector(location.hash));
	});

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
	});

	const provenance = $derived(
		m.ticket_detail_opened({
			name: ticket.requesterName,
			when: new Intl.DateTimeFormat(getLocale(), {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(ticket.createdAt),
			channel: ticket.channel === 'portal' ? m.ticket_channel_portal() : m.ticket_channel_agent()
		})
	);

	const statusOptions = $derived(
		data.nextStatuses.map((value) => ({ value, label: statusLabel(value) }))
	);
	const priorityOptions = $derived(
		PRIORITIES.map((value) => ({
			value,
			label: value === 'normal' ? m.ticket_priority_normal() : statusLabel(value)
		}))
	);
	const queueOptions = $derived(
		data.queues.map((queue) => ({ value: queue.id, label: queue.name }))
	);
	const peopleOptions = $derived(
		data.people.map((person) => ({ value: person.id, label: person.fullName }))
	);

	const unlinkError = $derived(
		form && 'action' in form && form.action === 'unlinkAsset' && 'message' in form
			? form.message
			: undefined
	);

	const replyError = $derived(
		form && 'action' in form && form.action === 'reply' && 'message' in form
			? form.message
			: undefined
	);
</script>

{#snippet failure(action: string)}
	{#if form && 'action' in form && form.action === action && 'message' in form}
		<p class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">{form.message}</p>
	{/if}
{/snippet}

{#snippet detailRow(label: string, body: Snippet)}
	<div class="flex justify-between gap-[var(--space-4)] py-[var(--space-2)] text-sm">
		<dt class="text-[var(--ink-muted)]">{label}</dt>
		<dd class="text-right text-[var(--ink)]">{@render body()}</dd>
	</div>
{/snippet}

<svelte:head>
	<title>{ticket.ticketTag} · {ticket.subject} · {m.app_name()}</title>
</svelte:head>

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
		/>

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
			<dl class="divide-y divide-[var(--border)]">
				{#snippet requester()}{ticket.requesterName}{/snippet}
				{#snippet assignee()}{localAssigneeName ?? m.tickets_no_assignee()}{/snippet}
				{#snippet queue()}{localQueueName}{/snippet}
				{@render detailRow(m.ticket_detail_requester(), requester)}
				{@render detailRow(m.ticket_detail_assignee(), assignee)}
				{@render detailRow(m.ticket_detail_queue(), queue)}
			</dl>
		</WorkPanel>

		<!-- Streamed (#89): `related` is read on the same scoped footing as the
		     ticket itself but nothing above it needs the answer first. -->
		{#await data.related}
			<div
				class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
				role="status"
				aria-live="polite"
			>
				<span class="sr-only">{m.loading_generic()}</span>
				<Skeleton class="h-4 w-32" />
				<div class="mt-[var(--space-3)] space-y-[var(--space-2)]">
					<Skeleton class="h-5 w-full" />
					<Skeleton class="h-5 w-3/4" />
				</div>
			</div>
		{:then relatedGroups}
			<RelationConstellation
				centre={{ kind: 'ticket', tag: ticket.ticketTag }}
				groups={relatedGroups}
			/>
			<RelatedRecords
				groups={relatedGroups}
				unlinkAction={data.canManage ? '?/unlinkAsset' : undefined}
				error={unlinkError}
			/>
		{/await}

		{#if data.canManage}
			{#if statusOptions.length > 0}
				<WorkPanel id="action-status" heading={m.ticket_action_status()}>
					<form
						method="POST"
						action="?/status"
						use:optimisticEnhance={(formData) => {
							const next = formData.get('status');
							const previous = localStatus;
							if (typeof next === 'string') localStatus = next as typeof localStatus;
							return () => {
								localStatus = previous;
							};
						}}
						class="space-y-[var(--space-3)]"
					>
						<SelectField
							label={m.ticket_detail_status()}
							name="status"
							options={statusOptions}
							value={statusOptions[0].value}
						/>
						{@render failure('status')}
						<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
					</form>
				</WorkPanel>
			{/if}

			<WorkPanel heading={m.ticket_action_priority()}>
				<form
					method="POST"
					action="?/priority"
					use:optimisticEnhance={(formData) => {
						const next = formData.get('priority');
						const previous = localPriority;
						if (typeof next === 'string') localPriority = next as typeof localPriority;
						return () => {
							localPriority = previous;
						};
					}}
					class="space-y-[var(--space-3)]"
				>
					<SelectField
						label={m.ticket_detail_priority()}
						name="priority"
						options={priorityOptions}
						value={localPriority}
					/>
					{@render failure('priority')}
					<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
				</form>
			</WorkPanel>

			<WorkPanel heading={m.ticket_action_assign()}>
				<form
					method="POST"
					action="?/assign"
					use:optimisticEnhance={(formData) => {
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
					}}
					class="space-y-[var(--space-3)]"
				>
					<SelectField
						label={m.ticket_detail_assignee()}
						name="personId"
						placeholder={m.ticket_action_unassign()}
						options={peopleOptions}
						value={localAssigneePersonId ?? ''}
					/>
					{@render failure('assign')}
					<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
				</form>
			</WorkPanel>

			<WorkPanel heading={m.ticket_action_queue()}>
				<form
					method="POST"
					action="?/queue"
					use:optimisticEnhance={(formData) => {
						const queueId = formData.get('queueId');
						const previousId = localQueueId;
						const previousName = localQueueName;
						if (typeof queueId === 'string') {
							localQueueId = queueId;
							localQueueName =
								data.queues.find((candidate) => candidate.id === queueId)?.name ?? previousName;
						}
						return () => {
							localQueueId = previousId;
							localQueueName = previousName;
						};
					}}
					class="space-y-[var(--space-3)]"
				>
					<SelectField
						label={m.ticket_detail_queue()}
						name="queueId"
						options={queueOptions}
						value={localQueueId}
					/>
					{@render failure('queue')}
					<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
				</form>
			</WorkPanel>
		{/if}
	{/snippet}
</PageLayout>
