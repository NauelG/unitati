<script lang="ts">
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
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
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import { statusBadge } from '#lib/components/unitati/status.js';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { LINK_TICKET_EVENT, paletteContext } from '#lib/palette-context.svelte.js';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	import AssetFields from '../AssetFields.svelte';
	import CreateModelDialog from '../CreateModelDialog.svelte';
	import DeliverDialog from './DeliverDialog.svelte';
	import { locationOptions, options, stateOptions } from '../options';

	let { data, form }: PageProps = $props();

	const asset = $derived(data.asset);

	const unlinkTicketError = $derived(
		form && 'action' in form && form.action === 'unlinkTicket' && 'message' in form
			? form.message
			: undefined
	);

	// Handing an asset over is a dialog, not a select: the technician must see the link (ADR 0035).
	let deliverOpen = $state(false);
	$effect(() => {
		if (data.canCheckout && location.hash === '#action-custody' && data.deliverable.length > 0) {
			deliverOpen = true;
		}
	});
	const deliverError = $derived(
		form && 'action' in form && form.action === 'deliver' && 'message' in form
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
	const stateChoices = stateOptions().map((choice) => ({
		...choice,
		tone: statusBadge(choice.value as (typeof ASSET_STATES)[number])?.tone
	}));
	const personOptions = $derived(options(data.people, (person) => person.fullName));
	const locationChoices = $derived(locationOptions(data.locations));
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
	let localLocationName = $state(asset.locationPath);
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
		localLocationName = asset.locationPath;
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
	let modelOpen = $state(false);

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
		<FormError>{form.message}</FormError>
	{/if}
{/snippet}

{#snippet custodianRow()}
	{#if data.canCheckout && localCustodianPersonId === null}
		<span id="action-custody" class="flex items-center gap-[var(--space-3)]">
			<span class="text-[var(--ink-muted)]">{m.assets_no_custodian()}</span>
			<Button type="button" size="sm" variant="secondary" onclick={() => (deliverOpen = true)}>
				{m.deliver_button()}
			</Button>
		</span>
	{:else}
		<EditableDetailRow
			kind="select"
			label={m.asset_detail_custodian()}
			value={localCustodianPersonId}
			display={localCustodianName ?? ''}
			placeholder={m.assets_no_custodian()}
			options={personOptions}
			noneLabel={m.asset_custody_nobody()}
			action="?/returnCustody"
			name="personId"
			editable={data.canCheckout}
			openOnHash="action-custody"
			optimistic={(formData) => {
				const personId = formData.get('personId');
				const previousId = localCustodianPersonId;
				const previousName = localCustodianName;
				const person = data.people.find((candidate) => candidate.id === personId);
				// "Nadie" posts an empty id: that clears the custodian. An unknown id changes nothing.
				if (person || personId === '') {
					localCustodianPersonId = person ? person.id : null;
					localCustodianName = person ? person.fullName : null;
				}
				return () => {
					localCustodianPersonId = previousId;
					localCustodianName = previousName;
				};
			}}
		/>
	{/if}
{/snippet}

{#snippet locationRow()}
	<EditableDetailRow
		kind="select"
		label={m.asset_detail_location()}
		value={localLocationId}
		display={localLocationName ?? ''}
		placeholder={m.assets_no_location()}
		options={locationChoices}
		noneLabel={m.asset_form_no_location()}
		action="?/changeLocation"
		name="locationId"
		editable={data.canManage}
		openOnHash="action-location"
		optimistic={(formData) => {
			const next = formData.get('locationId');
			const previousId = localLocationId;
			const previousName = localLocationName;
			const nextId = typeof next === 'string' && next !== '' ? next : null;
			localLocationId = nextId;
			localLocationName = nextId
				? (data.locations.find((candidate) => candidate.id === nextId)?.path ?? previousName)
				: null;
			return () => {
				localLocationId = previousId;
				localLocationName = previousName;
			};
		}}
	/>
{/snippet}

{#snippet noteComposer()}
	<form
		method="POST"
		action="?/addNote"
		use:optimisticEnhance={(formData) => {
			const text = formData.get('text');
			const previous = noteDraft;
			// Clearing the box is the whole feedback: the note itself joins the
			// timeline on reconcile, so there is no second local copy to flip.
			noteDraft = '';
			return () => {
				noteDraft = typeof text === 'string' ? text : previous;
			};
		}}
		class="mb-[var(--space-4)] flex items-end gap-[var(--space-2)]"
	>
		<div class="min-w-0 flex-1">
			<Field label={m.action_note_label()} name="text" required bind:value={noteDraft} />
		</div>
		<Button type="submit" variant="secondary" size="sm">{m.action_note_submit()}</Button>
	</form>
	{@render failure('addNote')}
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
			{#if data.canManage}
				<Button href="/assets/labels?tag={encodeURIComponent(asset.assetTag)}" variant="secondary">
					<Printer class="size-4" aria-hidden="true" />
					{m.labels_print_one()}
				</Button>
			{/if}
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
			<EditableChip
				value={localState}
				options={stateChoices}
				action="?/changeState"
				name="state"
				editable={data.canManage}
				openOnHash="action-state"
				label={m.asset_detail_state()}
				optimistic={(formData) => {
					const next = formData.get('state');
					const previous = localState;
					if (typeof next === 'string') localState = next as typeof localState;
					return () => {
						localState = previous;
					};
				}}
			/>
			{#if asset.shared}
				<span class="text-xs font-medium text-[var(--ink-muted)]">{m.assets_shared()}</span>
			{/if}
		</div>
	{/if}

	<div class="mt-[var(--space-6)] space-y-[var(--space-6)]">
		<WorkPanel heading={m.asset_detail_details()}>
			{#if asset.visibility === 'full'}
				<DescriptionList
					items={[
						{ label: m.asset_detail_serial(), value: asset.serial },
						{ label: m.asset_detail_model(), value: asset.modelName },
						{ label: m.asset_detail_manufacturer(), value: asset.manufacturerName },
						{ label: m.asset_detail_category(), value: asset.categoryName },
						{ label: m.asset_detail_custodian(), value: custodianRow },
						{ label: m.asset_detail_location(), value: locationRow },
						{
							label: m.asset_detail_shared(),
							value: asset.shared ? m.asset_detail_yes() : m.asset_detail_no()
						}
					]}
				/>
			{:else}
				<DescriptionList
					items={[
						{
							label: m.asset_detail_location(),
							value: localLocationName ?? m.assets_no_location()
						}
					]}
				/>
			{/if}

			{#if asset.visibility === 'shared'}
				<p class="mt-[var(--space-4)] text-small text-[var(--ink-muted)]">
					{m.asset_detail_shared_notice()}
				</p>
			{/if}
		</WorkPanel>
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
				{#if data.canManage && asset.visibility === 'full'}{@render noteComposer()}{/if}
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
					{#if data.canManage && asset.visibility === 'full'}{@render noteComposer()}{/if}
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
		form={{
			action: `/assets/${encodeURIComponent(asset.assetTag)}/edit`,
			method: 'POST',
			use: editEnhance
		}}
	>
		{#snippet fields()}
			<AssetFields
				bind:values={$editValues}
				errors={$editErrors}
				modelOptions={editModelOptions}
				tagRequired
				storedTag={asset.assetTag}
				onaddmodel={() => (modelOpen = true)}
			/>
		{/snippet}
		{#snippet footer()}
			<div
				class="flex items-center gap-[var(--space-3)] border-t border-[var(--border)] pt-[var(--space-4)]"
			>
				<Button type="submit" disabled={$editSubmitting}>
					{$editSubmitting ? m.form_saving() : m.asset_form_submit_edit()}
				</Button>
				<Button type="button" variant="ghost" onclick={() => requestClose(false)}>
					{m.form_cancel()}
				</Button>
			</div>
		{/snippet}
	</Sheet>

	{#if asset.visibility === 'full' && data.canCheckout}
		<DeliverDialog
			open={deliverOpen}
			onOpenChange={(next) => (deliverOpen = next)}
			people={personOptions}
			assets={data.deliverable}
			currentId={asset.id}
			error={deliverError}
		/>
	{/if}

	<CreateModelDialog
		open={modelOpen}
		onOpenChange={(next) => (modelOpen = next)}
		action="/assets/{encodeURIComponent(asset.assetTag)}/edit?/createModel"
		form={data.modelForm}
		manufacturers={data.manufacturers}
		categories={data.categories}
		oncreated={(id) => {
			$editValues.assetModelId = id;
			modelOpen = false;
		}}
	/>

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
