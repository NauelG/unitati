<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Circle from '@lucide/svelte/icons/circle';
	import { scale } from 'svelte/transition';
	import RollingText from '#lib/components/unitati/RollingText.svelte';
	import { countToken } from '#lib/rolling.js';
	import { springIn } from '#lib/motion.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import KpiCard from '#lib/components/unitati/KpiCard.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RecordRef from '#lib/components/unitati/RecordRef.svelte';
	import Sparkline from '#lib/components/unitati/Sparkline.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { activitySentence } from '#lib/components/unitati/activity.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Every step, in a fixed order, each with the one route that completes it.
	 * "Add a person" points at `/directory` rather than a dedicated form: the
	 * directory has no self-serve create screen yet (#84 does not add one),
	 * so the list is the closest real destination today.
	 */
	const steps = $derived([
		{
			key: 'registerAsset' as const,
			title: m.overview_checklist_register_asset_title(),
			description: m.overview_checklist_register_asset_description(),
			action: m.overview_checklist_register_asset_action(),
			href: '/assets/new',
			done: data.checklist.registerAsset
		},
		{
			key: 'defineQueue' as const,
			title: m.overview_checklist_define_queue_title(),
			description: m.overview_checklist_define_queue_description(),
			action: m.overview_checklist_define_queue_action(),
			href: '/service-desk/queues',
			done: data.checklist.defineQueue
		},
		{
			key: 'openPortal' as const,
			title: m.overview_checklist_open_portal_title(),
			description: m.overview_checklist_open_portal_description(),
			action: m.overview_checklist_open_portal_action(),
			href: '/portal',
			done: data.checklist.openPortal
		},
		{
			key: 'addPerson' as const,
			title: m.overview_checklist_add_person_title(),
			description: m.overview_checklist_add_person_description(),
			action: m.overview_checklist_add_person_action(),
			href: '/directory',
			done: data.checklist.addPerson
		}
	]);

	const remainingSteps = $derived(steps.filter((step) => !step.done));
	const doneCount = $derived(steps.length - remainingSteps.length);

	const formatter = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
	);
</script>

{#snippet checklist(items: typeof steps)}
	<ol class="m-0 list-none p-0">
		{#each items as step (step.key)}
			<li
				class="flex items-start gap-[var(--space-3)] border-b border-[var(--border)] py-[var(--space-3)] last:border-0"
			>
				{#if step.done}
					<!--
						S2 (#91): a spring only when the step completes while the page is
						open. A local transition does not play for what is already there on
						load, so a finished checklist does not replay its checks on every
						visit; reduced-motion collapses it in the global layer.
					-->
					<span class="mt-0.5 shrink-0 text-[var(--success)]" in:scale={springIn()}>
						<CircleCheck class="size-5" aria-hidden="true" />
					</span>
				{:else}
					<Circle class="mt-0.5 size-5 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold text-[var(--ink)]">{step.title}</p>
					<p class="mt-0.5 text-sm text-[var(--ink-muted)]">{step.description}</p>
				</div>
				{#if !step.done}
					<Button href={step.href} variant="secondary" size="sm">{step.action}</Button>
				{/if}
			</li>
		{/each}
	</ol>
{/snippet}

{#snippet progress()}
	<span class="text-xs text-[var(--ink-muted)]">
		<RollingText
			text={m.overview_checklist_progress({ done: countToken(0), total: countToken(1) })}
			counts={[doneCount, steps.length]}
		/>
	</span>
{/snippet}

<svelte:head>
	<title>{m.overview_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index" class="pb-[var(--space-12)]">
	<PageHeader title={m.overview_greeting({ name: data.user.name })}>
		{#snippet summary()}
			{data.mode === 'empty' ? m.overview_checklist_lede() : m.overview_pending()}
		{/snippet}
	</PageHeader>

	{#if data.mode === 'empty'}
		<WorkPanel
			heading={m.overview_checklist_title()}
			actions={progress}
			class="mt-[var(--space-5)]"
		>
			{@render checklist(steps)}
		</WorkPanel>
	{:else}
		{#if data.mode === 'partial'}
			<WorkPanel
				heading={m.overview_checklist_remaining_title()}
				actions={progress}
				class="mt-[var(--space-5)]"
			>
				{@render checklist(remainingSteps)}
			</WorkPanel>
		{/if}

		<!--
			The KPI grid (#84), now with trend lines and destinations (#90).

			`href` is what earns the hover lift: each of these four numbers has one
			obvious place to go and look at the rows behind it, so the card is a
			link and the depth language is telling the truth. A card with no
			destination would stay flat — see `KpiCard`'s own note.

			Only the two *counting* cards carry a sparkline. "Waiting on user" and
			"unassigned" are standing states, not events: there is no "number of
			assets that were unassigned on Tuesday" to plot, and inventing one from
			today's rows would draw a line of a quantity nobody recorded.
		-->
		<div class="mt-[var(--space-5)] grid grid-cols-2 gap-[var(--space-3)] sm:grid-cols-4">
			{#if data.tickets}
				<KpiCard label={m.overview_kpi_open()} value={data.tickets.open} href="/service-desk">
					{#snippet sparkline()}
						{#if data.ticketTrend}
							<Sparkline
								points={data.ticketTrend}
								tone="desk"
								label={m.chart_tickets_opened_7d()}
							/>
						{/if}
					{/snippet}
				</KpiCard>
				<KpiCard
					label={m.overview_kpi_waiting()}
					value={data.tickets.waitingOnUser}
					tone={data.tickets.waitingOnUser > 0 ? 'warning' : 'neutral'}
					href="/service-desk"
				/>
			{/if}
			{#if data.assets}
				<KpiCard
					label={m.overview_kpi_assets_active()}
					value={data.assets.inService}
					href="/assets"
				>
					{#snippet sparkline()}
						{#if data.assetTrend}
							<Sparkline
								points={data.assetTrend}
								tone="asset"
								label={m.chart_assets_registered_30d()}
							/>
						{/if}
					{/snippet}
				</KpiCard>
				<KpiCard
					label={m.overview_kpi_assets_unassigned()}
					value={data.assets.unassigned}
					tone={data.assets.unassigned > 0 ? 'warning' : 'neutral'}
					href="/assets"
				/>
			{/if}
		</div>

		<div class="mt-[var(--space-5)] grid gap-[var(--space-5)] lg:grid-cols-2">
			<WorkPanel heading={m.overview_section_your_work()}>
				{#if data.myTickets.length === 0}
					<p class="text-sm text-[var(--ink-muted)]">{m.overview_your_work_empty()}</p>
				{:else}
					<ol class="m-0 list-none space-y-[var(--space-2)] p-0">
						{#each data.myTickets as ticket (ticket.id)}
							<li class="flex flex-wrap items-center gap-[var(--space-2)]">
								<RecordRef
									record={{
										kind: 'ticket',
										tag: ticket.ticketTag,
										title: ticket.subject,
										href: `/service-desk/${ticket.ticketTag}`
									}}
								/>
								<StatusBadge status={ticket.status} />
								<StatusBadge status={ticket.priority} />
							</li>
						{/each}
					</ol>
				{/if}
			</WorkPanel>

			<WorkPanel heading={m.overview_section_activity()}>
				{#if data.activity.length === 0}
					<p class="text-sm text-[var(--ink-muted)]">{m.overview_activity_empty()}</p>
				{:else}
					<ol class="m-0 list-none space-y-[var(--space-3)] p-0">
						{#each data.activity as entry (entry.id)}
							<li>
								<p class="text-sm leading-5 text-[var(--ink)]">
									{activitySentence(entry)}
									{#if entry.actorName}
										<span class="font-normal text-[var(--ink-muted)]">
											{m.timeline_by({ name: entry.actorName })}
										</span>
									{/if}
								</p>
								<div class="mt-[var(--space-1)] flex items-center gap-[var(--space-2)]">
									{#if entry.record}
										<RecordRef record={entry.record} />
									{/if}
									<time
										class="text-xs text-[var(--ink-muted)]"
										datetime={entry.occurredAt.toISOString()}
									>
										{formatter.format(entry.occurredAt)}
									</time>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</WorkPanel>
		</div>
	{/if}
</PageLayout>
