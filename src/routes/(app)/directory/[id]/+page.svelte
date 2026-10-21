<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import HandoversTable from '#lib/components/unitati/HandoversTable.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const person = $derived(data.person);
</script>

<svelte:head>
	<title>{documentTitle(person.fullName)}</title>
</svelte:head>

<PageLayout variant="index">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.person_breadcrumb(), href: '/directory' }, { label: person.fullName }]}
	/>
	<PageHeader title={person.fullName} level="record" />

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

			<section class="space-y-[var(--space-3)]">
				<h2 class="text-title-3 text-[var(--ink)]">{m.person_handovers_title()}</h2>
				<HandoversTable
					rows={data.handovers}
					showPerson={false}
					emptyMessage={m.person_handovers_empty()}
				/>
			</section>
		{/if}
	</div>
</PageLayout>
