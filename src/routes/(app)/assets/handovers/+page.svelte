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

	let { data, form }: PageProps = $props();

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

	{#if data.canManage}
		<details
			class="mt-[var(--space-6)] rounded-[var(--radius-md)] border border-[var(--border)] p-3"
		>
			<summary class="cursor-pointer text-sm font-medium">{m.handovers_regularise_title()}</summary>
			<form
				method="POST"
				action="?/regularise"
				class="mt-[var(--space-3)] space-y-[var(--space-3)]"
			>
				<p class="text-small text-[var(--ink-muted)]">{m.handovers_regularise_lede()}</p>
				<div class="flex flex-wrap items-end gap-[var(--space-3)]">
					<label class="space-y-1 text-sm">
						<span class="block text-label text-[var(--ink-muted)]"
							>{m.handovers_regularise_person()}</span
						>
						<select name="personId" class={selectClass}>
							<option value="">{m.handovers_regularise_any_person()}</option>
							{#each data.people as person (person.id)}
								<option value={person.id}>{person.fullName}</option>
							{/each}
						</select>
					</label>
					<label class="space-y-1 text-sm">
						<span class="block text-label text-[var(--ink-muted)]"
							>{m.handovers_regularise_category()}</span
						>
						<select name="categoryId" class={selectClass}>
							<option value="">{m.handovers_regularise_any_category()}</option>
							{#each data.categories as category (category.id)}
								<option value={category.id}>{category.name}</option>
							{/each}
						</select>
					</label>
					<Button type="submit">{m.handovers_regularise_submit()}</Button>
				</div>
			</form>
		</details>

		{#if form?.action === 'regularise'}
			<div class="mt-[var(--space-3)] space-y-2 text-sm" role="status">
				{#if 'message' in form}
					<p class="text-[var(--danger)]">{form.message}</p>
				{:else}
					<p>{m.handovers_regularise_done({ count: form.issued.length })}</p>
					{#if form.issued.length > 0}
						<ul class="list-disc pl-5">
							{#each form.issued as item (item.code)}
								<li>
									<a class="underline" href="/assets/handovers/{item.code}">
										{m.handovers_regularise_issued({
											person: item.personName,
											code: item.code,
											count: item.assetCount
										})}
									</a>
								</li>
							{/each}
						</ul>
						<p class="text-small text-[var(--ink-muted)]">{m.handovers_regularise_links()}</p>
					{/if}
					{#if form.skipped.length > 0}
						<p class="font-medium">{m.handovers_regularise_skipped_title()}</p>
						<ul class="list-disc pl-5">
							{#each form.skipped as item (item.personId)}
								<li>
									{item.reason === 'no_template'
										? m.handovers_regularise_skipped_no_template({ person: item.personName })
										: m.handovers_regularise_skipped_no_requirement({ person: item.personName })}
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}

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
