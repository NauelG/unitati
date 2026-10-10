<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { get } from 'svelte/store';
	import { superForm } from 'sveltekit-superforms';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';
	import AssetFields from '../AssetFields.svelte';
	import AssetsNav from '../AssetsNav.svelte';
	import { options, stateOptions } from '../options';

	let { data, form }: PageProps = $props();

	const asset = $derived(data.asset);
	const stateChoices = stateOptions();
	const personOptions = $derived(options(data.people, (person) => person.fullName));
	const locationOptions = $derived(options(data.locations, (entry) => entry.name));
	const editModelOptions = $derived(
		options(data.editModels, (entry) => `${entry.manufacturerName} · ${entry.name}`)
	);

	const panel =
		'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-5)]';
	const panelTitle = 'text-sm font-semibold text-[var(--ink)]';

	/**
	 * ADR 0020: a `Sheet` contextual edit over the same `/assets/[tag]/edit`
	 * form and POST action, instead of navigating away from the record the
	 * visitor already had open. Without JS, `edit`'s own `href` still
	 * navigates there — this is progressive enhancement on top of it, never
	 * a second copy of the validation or the action.
	 */
	let editOpen = $state(false);
	let confirmDiscard = $state(false);

	// Called unconditionally, same rule `$state`/`$derived` already follow: a
	// store Svelte must auto-subscribe to (`$editValues` etc. below) has to
	// come from a top-level call, not one gated behind `{#if ...}`.
	// `data.editForm` is always present (the server's `load` runs
	// `superValidate` unconditionally — see its own comment for why a
	// client-side fallback built from the raw schema isn't an option here).
	const edit = superForm(
		untrack(() => data.editForm),
		{
			id: 'asset-edit-sheet',
			resetForm: false,
			onUpdated({ form: updated }) {
				if (updated.valid) editOpen = false;
			}
		}
	);
	const {
		form: editValues,
		errors: editErrors,
		enhance: editEnhance,
		submitting: editSubmitting
	} = edit;

	function openEdit(event: Event) {
		event.preventDefault();
		editOpen = true;
	}

	/** Escape, overlay or the Cancel button: only close straight away if nothing changed. */
	function requestClose(next: boolean) {
		if (next) {
			editOpen = true;
			return;
		}
		// `tainted` is a store: `get()` reads its current snapshot without
		// needing its own `$`-subscribed top-level binding just for this check.
		const taintedFields = get(edit.tainted);
		const dirty = Boolean(taintedFields && Object.values(taintedFields).some(Boolean));
		if (dirty) {
			confirmDiscard = true;
			return;
		}
		editOpen = false;
	}
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

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.assets_nav_assets(), href: '/assets' }, { label: asset.assetTag }]}
	/>

	<PageHeader title={asset.name} code={asset.assetTag}>
		{#snippet actions()}
			{#if data.canManage && asset.visibility === 'full'}
				<Button
					href="/assets/{encodeURIComponent(asset.assetTag)}/edit"
					variant="secondary"
					onclick={openEdit}
				>
					<Pencil class="size-4" aria-hidden="true" />
					{m.asset_detail_edit()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if asset.visibility === 'full'}
		<div class="mt-[var(--space-2)] flex items-center gap-[var(--space-2)]">
			<StatusBadge status={asset.state} />
			{#if asset.shared}
				<span class="text-xs font-medium text-[var(--ink-muted)]">{m.assets_shared()}</span>
			{/if}
		</div>
	{/if}

	<AssetsNav showCatalogue={data.canManage} />

	<div class="mt-[var(--space-6)] space-y-[var(--space-6)]">
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
							<form method="POST" action="?/returnCustody" use:enhance class="mt-[var(--space-3)]">
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

	{#snippet side()}
		{#if data.timeline}
			<section class={panel}>
				<div class="flex items-baseline justify-between gap-[var(--space-3)]">
					<h2 class={panelTitle}>{m.timeline_title()}</h2>
					<span class="font-mono text-xs text-[var(--ink-muted)]">{asset.assetTag}</span>
				</div>
				{#if data.recentTickets > 0}
					<p class="mt-[var(--space-1)] text-sm font-medium text-[var(--ink)]">
						{data.recentTickets === 1
							? m.asset_tickets_recent_one({ months: data.recentMonths })
							: m.asset_tickets_recent_other({
									count: data.recentTickets,
									months: data.recentMonths
								})}
					</p>
				{/if}
				<div class="mt-[var(--space-4)]">
					<AssetTimeline items={data.timeline} />
				</div>
			</section>
		{/if}
	{/snippet}
</PageLayout>

{#if data.canManage && asset.visibility === 'full'}
	<Sheet
		open={editOpen}
		onOpenChange={requestClose}
		pending={$editSubmitting}
		title={m.asset_edit_title({ tag: asset.assetTag })}
		description={m.asset_edit_lede()}
	>
		<form
			method="POST"
			action="/assets/{encodeURIComponent(asset.assetTag)}/edit"
			use:editEnhance
			class="flex h-full min-h-0 flex-col"
		>
			<div class="min-h-0 flex-1 space-y-[var(--space-5)] overflow-y-auto">
				<AssetFields
					bind:values={$editValues}
					errors={$editErrors}
					modelOptions={editModelOptions}
					tagRequired
				/>
			</div>

			<div
				class="mt-[var(--space-4)] flex shrink-0 items-center gap-[var(--space-3)] border-t border-[var(--border)] pt-[var(--space-4)]"
			>
				<Button type="submit" disabled={$editSubmitting}>
					{$editSubmitting ? m.form_saving() : m.asset_form_submit_edit()}
				</Button>
				<Button type="button" variant="ghost" onclick={() => requestClose(false)}>
					{m.form_cancel()}
				</Button>
			</div>
		</form>
	</Sheet>

	<ConfirmDialog
		open={confirmDiscard}
		onOpenChange={(next) => {
			if (!next) confirmDiscard = false;
		}}
		title={m.asset_edit_discard_title()}
		description={m.asset_edit_discard_ask()}
		confirmLabel={m.asset_edit_discard_confirm()}
		danger={false}
	>
		{#snippet action(confirm)}
			<form
				onsubmit={(event) => {
					event.preventDefault();
					confirmDiscard = false;
					editOpen = false;
				}}
			>
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}
