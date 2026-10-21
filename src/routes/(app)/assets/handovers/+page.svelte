<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { navigating, page } from '$app/state';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import { handoverStateBadge } from '#lib/components/unitati/handover-state.js';
	import HandoversTable from '#lib/components/unitati/HandoversTable.svelte';
	import ListToolbar from '#lib/components/unitati/ListToolbar.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { HANDOVER_STATES } from '#lib/domain/handover.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const selectClass =
		'h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-2 text-sm';
</script>

<svelte:head>
	<title>{documentTitle(m.handovers_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.assets_nav_assets(), href: '/assets' }, { label: m.handovers_nav() }]}
	/>
	<PageHeader title={m.handovers_title()}>
		{#snippet summary()}{m.handovers_lede()}{/snippet}
	</PageHeader>

	<div class="mt-[var(--space-6)]">
		<ListToolbar>
			<fieldset class="flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-1">
				<legend class="mb-1 text-label text-[var(--ink-muted)]">{m.handovers_filter_state()}</legend
				>
				{#each HANDOVER_STATES as state (state)}
					<label class="flex items-center gap-1 text-sm">
						<input
							type="checkbox"
							name="state"
							value={state}
							checked={data.states.includes(state)}
						/>
						{handoverStateBadge(state).label}
					</label>
				{/each}
			</fieldset>

			<label class="space-y-1 text-sm">
				<span class="block text-label text-[var(--ink-muted)]"
					>{m.handovers_filter_direction()}</span
				>
				<select name="direction" class={selectClass}>
					<option value="" selected={data.direction === ''}
						>{m.handovers_filter_any_direction()}</option
					>
					<option value="delivery" selected={data.direction === 'delivery'}>
						{m.handover_direction_delivery()}
					</option>
					<option value="return" selected={data.direction === 'return'}>
						{m.handover_direction_return()}
					</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="block text-label text-[var(--ink-muted)]">{m.handovers_filter_person()}</span>
				<select name="person" class={selectClass}>
					<option value="" selected={data.personId === ''}>{m.handovers_filter_any_person()}</option
					>
					{#each data.people as person (person.id)}
						<option value={person.id} selected={data.personId === person.id}>
							{person.fullName}
						</option>
					{/each}
				</select>
			</label>

			<Button type="submit">{m.handovers_filter_apply()}</Button>
			{#if data.filtered}
				<Button href="/assets/handovers" variant="secondary">{m.handovers_filter_reset()}</Button>
			{/if}
		</ListToolbar>

		<HandoversTable
			rows={data.rows}
			loading={navigating.to?.route.id === page.route.id}
			emptyMessage={data.filtered ? m.handovers_empty_filtered() : m.handovers_empty()}
			class="rounded-t-none"
		/>
	</div>

	{#if data.rows.length >= data.limit}
		<p class="mt-[var(--space-3)] text-small text-[var(--ink-muted)]">
			{m.handovers_limit_note({ count: data.limit })}
		</p>
	{/if}
</PageLayout>
