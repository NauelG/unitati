<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { superForm } from 'sveltekit-superforms';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { ASSET_STATES } from '#lib/domain/status.js';
	import Field from '#lib/components/unitati/Field.svelte';
	import { toViewTransitionName } from '#lib/motion.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { focusFirstField } from '#lib/keymap.js';
	import { LINK_TICKET_EVENT, paletteContext } from '#lib/palette-context.svelte.js';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';
	import AssetFields from '../AssetFields.svelte';
	import { options, stateOptions } from '../options';

	let { data, form }: PageProps = $props();

	/**
	 * The keymap's row verbs (#88: `a`/`e`/`l` on the assets list) land here
	 * with a `#action-custody`/`#action-state`/`#action-location` hash — the
	 * jump target, not a style hook. Focusing the panel's first field is what
	 * "open the existing edit controls" means once there is no list-row Sheet
	 * trigger to open instead.
	 */
	$effect(() => {
		if (!location.hash) return;
		focusFirstField(document.querySelector(location.hash));
	});

	const asset = $derived(data.asset);

	const unlinkTicketError = $derived(
		form && 'action' in form && form.action === 'unlinkTicket' && 'message' in form
			? form.message
			: undefined
	);

	// The palette's "Vincular ticket" opens the panel's own dialog (#168).
	let linkOpen = $state(false);
	$effect(() => {
		if (!data.canLinkTickets) return;
		const open = () => (linkOpen = true);
		paletteContext.linkableAssetTag = asset.assetTag;
		window.addEventListener(LINK_TICKET_EVENT, open);
		return () => {
			paletteContext.linkableAssetTag = null;
			window.removeEventListener(LINK_TICKET_EVENT, open);
		};
	});
	const stateChoices = stateOptions();
	const personOptions = $derived(options(data.people, (person) => person.fullName));
	const locationOptions = $derived(options(data.locations, (entry) => entry.name));
	const editModelOptions = $derived(
		options(data.editModels, (entry) => `${entry.manufacturerName} · ${entry.name}`)
	);

	/**
	 * Optimistic mirrors (#89): each of these five action forms flips one of
	 * these on submit, before the server answers, and rolls back to the
	 * snapshot taken right before the flip on `failure`/`error` — see
	 * `optimisticEnhance` (`#lib/optimistic.ts`). Resynced from the authoritative
	 * `asset` whenever it changes (a reconciled success, a navigation to a
	 * different tag) so a stale optimistic value never survives past the data
	 * that actually backs it.
	 */
	// `asset` is `FullAssetView | SharedAssetView`: everything below only
	// renders inside an existing `visibility === 'full'` guard, but the
	// mirrors still need an initial value of the right type for the
	// `visibility === 'shared'` branch, which never displays them. `state`
	// alone isn't nullable, so its placeholder is the first real `AssetState`
	// rather than `null`.
	let localState = $state(asset.visibility === 'full' ? asset.state : ASSET_STATES[0]);
	let localLocationId = $state(asset.visibility === 'full' ? asset.locationId : null);
	let localLocationName = $state(asset.locationName);
	let localCustodianPersonId = $state(asset.visibility === 'full' ? asset.custodianPersonId : null);
	let localCustodianName = $state(asset.visibility === 'full' ? asset.custodianName : null);
	/** `addNote` has no display value of its own to flip — clearing the box is the feedback; see the form below. */
	let noteDraft = $state('');

	$effect(() => {
		if (asset.visibility === 'full') {
			localState = asset.state;
			localLocationId = asset.locationId;
			localCustodianPersonId = asset.custodianPersonId;
			localCustodianName = asset.custodianName;
		}
		localLocationName = asset.locationName;
	});

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
	<title>{documentTitle(asset.assetTag, asset.name)}</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.assets_nav_assets(), href: '/assets' }, { label: asset.assetTag }]}
	/>

	<PageHeader
		title={asset.name}
		code={asset.assetTag}
		codeViewTransitionName={toViewTransitionName('record', asset.assetTag)}
	>
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
			<StatusBadge status={localState} />
			{#if asset.shared}
				<span class="text-xs font-medium text-[var(--ink-muted)]">{m.assets_shared()}</span>
			{/if}
		</div>
	{/if}

	<div class="mt-[var(--space-6)] space-y-[var(--space-6)]">
		<WorkPanel heading={m.asset_detail_details()}>
			<dl class="divide-y divide-[var(--border)]">
				{#if asset.visibility === 'full'}
					{#snippet serial()}{asset.serial ?? '—'}{/snippet}
					{#snippet model()}{asset.modelName}{/snippet}
					{#snippet manufacturer()}{asset.manufacturerName}{/snippet}
					{#snippet category()}{asset.categoryName}{/snippet}
					{#snippet custodian()}
						{localCustodianName ?? m.assets_no_custodian()}
					{/snippet}
					{#snippet location()}{localLocationName ?? m.assets_no_location()}{/snippet}
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
					{#snippet location()}{localLocationName ?? m.assets_no_location()}{/snippet}
					{@render detail(m.asset_detail_location(), location)}
				{/if}
			</dl>

			{#if asset.visibility === 'shared'}
				<p class="mt-[var(--space-4)] text-[13px] leading-[18px] text-[var(--ink-muted)]">
					{m.asset_detail_shared_notice()}
				</p>
			{/if}
		</WorkPanel>

		{#if asset.visibility === 'full' && (data.canCheckout || data.canManage)}
			<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
				{#if data.canCheckout}
					<WorkPanel id="action-custody" heading={m.action_custody_title()}>
						<p class="text-sm text-[var(--ink-muted)]">
							{localCustodianName
								? m.action_custody_held({ name: localCustodianName })
								: m.action_custody_free()}
						</p>

						<form
							method="POST"
							action="?/assignCustody"
							use:optimisticEnhance={(formData) => {
								const personId = formData.get('personId');
								const person = data.people.find((candidate) => candidate.id === personId);
								const previousId = localCustodianPersonId;
								const previousName = localCustodianName;
								if (typeof personId === 'string' && person) {
									localCustodianPersonId = personId;
									localCustodianName = person.fullName;
								}
								return () => {
									localCustodianPersonId = previousId;
									localCustodianName = previousName;
								};
							}}
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

						{#if localCustodianPersonId}
							<form
								method="POST"
								action="?/returnCustody"
								use:optimisticEnhance={() => {
									const previousId = localCustodianPersonId;
									const previousName = localCustodianName;
									localCustodianPersonId = null;
									localCustodianName = null;
									return () => {
										localCustodianPersonId = previousId;
										localCustodianName = previousName;
									};
								}}
								class="mt-[var(--space-3)]"
							>
								{@render failure('returnCustody')}
								<Button type="submit" variant="ghost" size="sm">
									{m.action_custody_return()}
								</Button>
							</form>
						{/if}
					</WorkPanel>
				{/if}

				{#if data.canManage}
					<WorkPanel id="action-state" heading={m.action_state_title()}>
						<form
							method="POST"
							action="?/changeState"
							use:optimisticEnhance={(formData) => {
								const next = formData.get('state');
								const previous = localState;
								if (typeof next === 'string') localState = next as typeof localState;
								return () => {
									localState = previous;
								};
							}}
							class="space-y-[var(--space-3)]"
						>
							<SelectField
								label={m.asset_detail_state()}
								name="state"
								options={stateChoices}
								value={localState}
							/>
							{@render failure('changeState')}
							<Button type="submit" variant="secondary" size="sm">
								{m.action_state_submit()}
							</Button>
						</form>
					</WorkPanel>

					<WorkPanel id="action-location" heading={m.action_location_title()}>
						<form
							method="POST"
							action="?/changeLocation"
							use:optimisticEnhance={(formData) => {
								const next = formData.get('locationId');
								const previousId = localLocationId;
								const previousName = localLocationName;
								const nextId = typeof next === 'string' && next !== '' ? next : null;
								localLocationId = nextId;
								localLocationName = nextId
									? (data.locations.find((candidate) => candidate.id === nextId)?.name ??
										previousName)
									: null;
								return () => {
									localLocationId = previousId;
									localLocationName = previousName;
								};
							}}
							class="space-y-[var(--space-3)]"
						>
							<SelectField
								label={m.asset_detail_location()}
								name="locationId"
								placeholder={m.asset_form_no_location()}
								options={locationOptions}
								value={localLocationId ?? ''}
							/>
							{@render failure('changeLocation')}
							<Button type="submit" variant="secondary" size="sm">
								{m.action_location_submit()}
							</Button>
						</form>
					</WorkPanel>

					<WorkPanel heading={m.action_note_title()}>
						<form
							method="POST"
							action="?/addNote"
							use:optimisticEnhance={(formData) => {
								const text = formData.get('text');
								const previous = noteDraft;
								// Clearing the box is the whole feedback: the note itself
								// joins the activity timeline on reconcile, same as any
								// other entry there — there is no second local copy of it
								// to flip.
								noteDraft = '';
								return () => {
									noteDraft = typeof text === 'string' ? text : previous;
								};
							}}
							class="space-y-[var(--space-3)]"
						>
							<Field label={m.action_note_label()} name="text" required bind:value={noteDraft} />
							{@render failure('addNote')}
							<Button type="submit" variant="secondary" size="sm">
								{m.action_note_submit()}
							</Button>
						</form>
					</WorkPanel>
				{/if}
			</div>
		{/if}
	</div>

	{#snippet side()}
		{#snippet timelineTag()}
			<span class="font-mono text-xs text-[var(--ink-muted)]">{asset.assetTag}</span>
		{/snippet}
		<!--
			Streamed (#89): the timeline/related-tickets read is the slowest half
			of this page and nothing else on it depends on the result, so it
			paints after the header and the action panels above, behind a
			skeleton sized to match the real rail exactly (no CLS when it swaps).
		-->
		{#await data.timelineRail}
			{#if asset.visibility === 'full'}
				<!-- Same box as the related-tickets panel it stands in for: title, one row, no shift. -->
				<div
					class="mb-[var(--space-4)] space-y-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
					aria-hidden="true"
				>
					<Skeleton class="h-5 w-40" />
					<Skeleton class="h-8 w-full" />
				</div>
			{/if}
			<WorkPanel heading={m.timeline_title()} actions={timelineTag}>
				<TimelineSkeleton />
			</WorkPanel>
		{:then rail}
			{#if rail.timeline}
				{#if asset.visibility === 'full'}
					{@const ticketGroups = rail.related.filter((group) => group.relation === 'affected_by')}
					{#if data.canLinkTickets || ticketGroups.length > 0}
						<RelatedRecords
							groups={ticketGroups}
							unlinkAction={data.canLinkTickets ? '?/unlinkTicket' : undefined}
							error={unlinkTicketError}
							linkAction={data.canLinkTickets ? '?/linkTickets' : undefined}
							linkLabel={m.related_link_ticket()}
							linkDescription={m.related_link_ticket_lede()}
							linkFieldLabel={m.related_link_ticket_field()}
							linkPlaceholder={m.related_link_ticket_placeholder()}
							linkSearchUrl="/assets/{encodeURIComponent(asset.assetTag)}/tickets"
							linkSubmitLabel={(count) =>
								count === 0
									? m.related_link_ticket_submit_none()
									: count === 1
										? m.related_link_ticket_submit_one({ count })
										: m.related_link_ticket_submit_other({ count })}
							linkedIds={ticketGroups.flatMap((group) => group.items.map((item) => item.ref.id))}
							bind:linkOpen
							class="mb-[var(--space-4)]"
						/>
					{/if}
				{/if}
				<RelationConstellation
					centre={{ kind: 'asset', tag: asset.assetTag }}
					groups={rail.related}
					class="mb-[var(--space-4)]"
				/>
				<WorkPanel heading={m.timeline_title()} actions={timelineTag}>
					{#if rail.recentTickets > 0}
						<p class="text-sm font-medium text-[var(--ink)]">
							{rail.recentTickets === 1
								? m.asset_tickets_recent_one({ months: data.recentMonths })
								: m.asset_tickets_recent_other({
										count: rail.recentTickets,
										months: data.recentMonths
									})}
						</p>
					{/if}
					<div class={rail.recentTickets > 0 ? 'mt-[var(--space-4)]' : ''}>
						<AssetTimeline items={rail.timeline} />
					</div>
				</WorkPanel>
			{/if}
		{/await}
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
