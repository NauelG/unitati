<script lang="ts">
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import TicketComposer from '#lib/components/unitati/TicketComposer.svelte';
	import TicketThread from '#lib/components/unitati/TicketThread.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const ticket = $derived(data.ticket);
	const replyError = $derived(
		form && 'action' in form && form.action === 'reply' && 'message' in form
			? form.message
			: undefined
	);
</script>

<svelte:head>
	<title>{ticket.ticketTag} · {ticket.subject} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<a href="/portal" class="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
		← {m.portal_back()}
	</a>

	<div class="mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)]">
		<span class="font-mono text-xs font-medium text-[var(--ink-muted)]">{ticket.ticketTag}</span>
		<StatusBadge status={ticket.status} />
		<StatusBadge status={ticket.priority} />
	</div>
	<h1 class="mt-1 font-display text-lg font-semibold text-[var(--ink)]">{ticket.subject}</h1>

	{#if data.related.length > 0}
		<div class="mt-[var(--space-6)]">
			<RelatedRecords groups={data.related} />
		</div>
	{/if}

	<div class="mt-[var(--space-6)]">
		<TicketThread items={data.thread} attachmentHref={(id) => `/attachments/${id}`} />
	</div>

	<section class="mt-[var(--space-5)]">
		<h2 class="mb-[var(--space-2)] text-sm font-semibold text-[var(--ink)]">
			{m.portal_reply_title()}
		</h2>
		<TicketComposer
			action="?/reply"
			error={replyError}
			placeholder={m.composer_placeholder_portal()}
		/>
	</section>
</PageLayout>
