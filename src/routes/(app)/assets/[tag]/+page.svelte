<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import { enhance } from '$app/forms';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';
	import AssetsNav from '../AssetsNav.svelte';
	import { options, stateOptions } from '../options';

	let { data, form }: PageProps = $props();

	const asset = $derived(data.asset);
	const stateChoices = stateOptions();
	const personOptions = $derived(options(data.people, (person) => person.fullName));
	const locationOptions = $derived(options(data.locations, (entry) => entry.name));

	const panel =
		'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-5)]';
	const panelTitle = 'text-sm font-semibold text-[var(--ink)]';
</script>

{#snippet failure(action: string)}
	{#if form && 'action' in form && form.action === action && 'message' in form}
		<p class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">{form.message}</p>
	{/if}
{/snippet}

{#snippet detail(label: string, body: Snippet)}
	<div class="flex justify-between gap-[var(--space-4)] py-[var(--space-2)] text-sm">
		<dt class="text-[var(--ink-muted)]">{label}</dt>
		<dd class="text-right text-[var(--ink)]">{@render body()}</dd>
	</div>
{/snippet}

<svelte:head>
	<title>{asset.assetTag} · {asset.name} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
	<div class="flex flex-wrap items-start justify-between gap-[var(--space-4)]">
		<div>
			<p class="font-mono text-xs font-medium text-[var(--ink-muted)]">{asset.assetTag}</p>
			<h1 class="mt-1 font-display text-2xl font-semibold text-[var(--ink)]">{asset.name}</h1>
			{#if asset.visibility === 'full'}
				<div class="mt-[var(--space-2)] flex items-center gap-[var(--space-2)]">
					<StatusBadge status={asset.state} />
					{#if asset.shared}
						<span class="text-xs font-medium text-[var(--ink-muted)]">{m.assets_shared()}</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if data.canManage && asset.visibility === 'full'}
			<Button href="/assets/{encodeURIComponent(asset.assetTag)}/edit" variant="secondary">
				<Pencil class="size-4" aria-hidden="true" />
				{m.asset_detail_edit()}
			</Button>
		{/if}
	</div>

	<AssetsNav showCatalogue={data.canManage} />

	<div
		class="mt-[var(--space-6)] grid gap-[var(--space-6)] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
	>
		<div class="space-y-[var(--space-6)]">
			<section class={panel}>
				<h2 class={panelTitle}>{m.asset_detail_details()}</h2>

				<dl class="mt-[var(--space-3)] divide-y divide-[var(--border)]">
					{#if asset.visibility === 'full'}
						{#snippet serial()}{asset.serial ?? '—'}{/snippet}
						{#snippet model()}{asset.modelName}{/snippet}
						{#snippet manufacturer()}{asset.manufacturerName}{/snippet}
						{#snippet category()}{asset.categoryName}{/snippet}
						{#snippet custodian()}
							{asset.custodianName ?? m.assets_no_custodian()}
						{/snippet}
						{#snippet location()}{asset.locationName ?? m.assets_no_location()}{/snippet}
						{#snippet shared()}
							{asset.shared ? m.asset_detail_yes() : m.asset_detail_no()}
						{/snippet}

						{@render detail(m.asset_detail_serial(), serial)}
						{@render detail(m.asset_detail_model(), model)}
						{@render detail(m.asset_detail_manufacturer(), manufacturer)}
						{@render detail(m.asset_detail_category(), category)}
						{@render detail(m.asset_detail_custodian(), custodian)}
						{@render detail(m.asset_detail_location(), location)}
						{@render detail(m.asset_detail_shared(), shared)}
					{:else}
						{#snippet location()}{asset.locationName ?? m.assets_no_location()}{/snippet}
						{@render detail(m.asset_detail_location(), location)}
					{/if}
				</dl>

				{#if asset.visibility === 'shared'}
					<p class="mt-[var(--space-4)] text-[13px] leading-[18px] text-[var(--ink-muted)]">
						{m.asset_detail_shared_notice()}
					</p>
				{/if}
			</section>

			{#if asset.visibility === 'full' && (data.canCheckout || data.canManage)}
				<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
					{#if data.canCheckout}
						<section class={panel}>
							<h2 class={panelTitle}>{m.action_custody_title()}</h2>
							<p class="mt-1 text-sm text-[var(--ink-muted)]">
								{asset.custodianName
									? m.action_custody_held({ name: asset.custodianName })
									: m.action_custody_free()}
							</p>

							<form
								method="POST"
								action="?/assignCustody"
								use:enhance
								class="mt-[var(--space-4)] space-y-[var(--space-3)]"
							>
								<SelectField
									label={m.action_custody_person()}
									name="personId"
									placeholder={m.action_custody_choose()}
									options={personOptions}
									value=""
									required
								/>
								{@render failure('assignCustody')}
								<Button type="submit" variant="secondary" size="sm">
									{m.action_custody_assign()}
								</Button>
							</form>

							{#if asset.custodianPersonId}
								<form
									method="POST"
									action="?/returnCustody"
									use:enhance
									class="mt-[var(--space-3)]"
								>
									{@render failure('returnCustody')}
									<Button type="submit" variant="ghost" size="sm">
										{m.action_custody_return()}
									</Button>
								</form>
							{/if}
						</section>
					{/if}

					{#if data.canManage}
						<section class={panel}>
							<h2 class={panelTitle}>{m.action_state_title()}</h2>
							<form
								method="POST"
								action="?/changeState"
								use:enhance
								class="mt-[var(--space-4)] space-y-[var(--space-3)]"
							>
								<SelectField
									label={m.asset_detail_state()}
									name="state"
									options={stateChoices}
									value={asset.state}
								/>
								{@render failure('changeState')}
								<Button type="submit" variant="secondary" size="sm">
									{m.action_state_submit()}
								</Button>
							</form>
						</section>

						<section class={panel}>
							<h2 class={panelTitle}>{m.action_location_title()}</h2>
							<form
								method="POST"
								action="?/changeLocation"
								use:enhance
								class="mt-[var(--space-4)] space-y-[var(--space-3)]"
							>
								<SelectField
									label={m.asset_detail_location()}
									name="locationId"
									placeholder={m.asset_form_no_location()}
									options={locationOptions}
									value={asset.locationId ?? ''}
								/>
								{@render failure('changeLocation')}
								<Button type="submit" variant="secondary" size="sm">
									{m.action_location_submit()}
								</Button>
							</form>
						</section>

						<section class={panel}>
							<h2 class={panelTitle}>{m.action_note_title()}</h2>
							<form
								method="POST"
								action="?/addNote"
								use:enhance
								class="mt-[var(--space-4)] space-y-[var(--space-3)]"
							>
								<Field label={m.action_note_label()} name="text" required />
								{@render failure('addNote')}
								<Button type="submit" variant="secondary" size="sm">
									{m.action_note_submit()}
								</Button>
							</form>
						</section>
					{/if}
				</div>
			{/if}
		</div>

		{#if data.timeline}
			<section class={panel}>
				<div class="flex items-baseline justify-between gap-[var(--space-3)]">
					<h2 class={panelTitle}>{m.timeline_title()}</h2>
					<span class="font-mono text-xs text-[var(--ink-muted)]">{asset.assetTag}</span>
				</div>
				<div class="mt-[var(--space-4)]">
					<AssetTimeline entries={data.timeline} />
				</div>
			</section>
		{/if}
	</div>
</div>
