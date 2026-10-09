<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import TicketThread from '#lib/components/unitati/TicketThread.svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { PRIORITIES } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const ticket = $derived(data.ticket);

	const panel =
		'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]';
	const panelTitle = 'text-sm font-semibold text-[var(--ink)]';

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
	<TicketDetailLayout
		ticketTag={ticket.ticketTag}
		subject={ticket.subject}
		status={ticket.status}
		priority={ticket.priority}
		{provenance}
	/>

	<TicketThread items={data.thread} attachmentHref={(id) => `/attachments/${id}`} />

	<TicketComposer
		action="?/reply"
		allowInternal={data.canInternal}
		error={replyError}
		placeholder={m.composer_placeholder_reply({ name: ticket.requesterName })}
	/>

	{#snippet side()}
		<section class={panel}>
			<h2 class={panelTitle}>{m.ticket_detail_details()}</h2>
			<dl class="mt-[var(--space-2)] divide-y divide-[var(--border)]">
				{#snippet requester()}{ticket.requesterName}{/snippet}
				{#snippet assignee()}{ticket.assigneeName ?? m.tickets_no_assignee()}{/snippet}
				{#snippet queue()}{ticket.queueName}{/snippet}
				{@render detailRow(m.ticket_detail_requester(), requester)}
				{@render detailRow(m.ticket_detail_assignee(), assignee)}
				{@render detailRow(m.ticket_detail_queue(), queue)}
			</dl>
		</section>

		<RelatedRecords
			groups={data.related}
			unlinkAction={data.canManage ? '?/unlinkAsset' : undefined}
			error={unlinkError}
		/>

		{#if data.canManage}
			{#if statusOptions.length > 0}
				<section class={panel}>
					<h2 class={panelTitle}>{m.ticket_action_status()}</h2>
					<form
						method="POST"
						action="?/status"
						use:enhance
						class="mt-[var(--space-3)] space-y-[var(--space-3)]"
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
				</section>
			{/if}

			<section class={panel}>
				<h2 class={panelTitle}>{m.ticket_action_priority()}</h2>
				<form
					method="POST"
					action="?/priority"
					use:enhance
					class="mt-[var(--space-3)] space-y-[var(--space-3)]"
				>
					<SelectField
						label={m.ticket_detail_priority()}
						name="priority"
						options={priorityOptions}
						value={ticket.priority}
					/>
					{@render failure('priority')}
					<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
				</form>
			</section>

			<section class={panel}>
				<h2 class={panelTitle}>{m.ticket_action_assign()}</h2>
				<form
					method="POST"
					action="?/assign"
					use:enhance
					class="mt-[var(--space-3)] space-y-[var(--space-3)]"
				>
					<SelectField
						label={m.ticket_detail_assignee()}
						name="personId"
						placeholder={m.ticket_action_unassign()}
						options={peopleOptions}
						value={ticket.assigneePersonId ?? ''}
					/>
					{@render failure('assign')}
					<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
				</form>
			</section>

			<section class={panel}>
				<h2 class={panelTitle}>{m.ticket_action_queue()}</h2>
				<form
					method="POST"
					action="?/queue"
					use:enhance
					class="mt-[var(--space-3)] space-y-[var(--space-3)]"
				>
					<SelectField
						label={m.ticket_detail_queue()}
						name="queueId"
						options={queueOptions}
						value={ticket.queueId}
					/>
					{@render failure('queue')}
					<Button type="submit" variant="secondary" size="sm">{m.ticket_action_submit()}</Button>
				</form>
			</section>
		{/if}
	{/snippet}
</PageLayout>
