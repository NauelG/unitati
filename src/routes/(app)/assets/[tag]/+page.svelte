<script lang="ts">
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Printer from '@lucide/svelte/icons/printer';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { superForm } from 'sveltekit-superforms';
	import CommentsCard from '#lib/components/unitati/CommentsCard.svelte';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { ASSET_STATES } from '#lib/domain/status.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import HandoversTable from '#lib/components/unitati/HandoversTable.svelte';
	import HandoverStateBadge from '#lib/components/unitati/HandoverStateBadge.svelte';
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import { statusBadge } from '#lib/components/unitati/status.js';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
	import RecordAttachments from '#lib/components/unitati/RecordAttachments.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { LINK_TICKET_EVENT, paletteContext } from '#lib/palette-context.svelte.js';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	import AssetFields from '../AssetFields.svelte';
	import CreateModelDialog from '../CreateModelDialog.svelte';
	import DeliverDialog from './DeliverDialog.svelte';
	import TakeBackDialog from '../TakeBackDialog.svelte';
	import { locationOptions, options, stateOptions } from '../options';

	let { data, form }: PageProps = $props();

	const asset = $derived(data.asset);
	const archived = $derived(asset.visibility === 'full' && asset.archivedAt !== null);
	let archiveOpen = $state(false);
	let archiving = $state(false);

	const unlinkTicketError = $derived(
		form && 'action' in form && form.action === 'unlinkTicket' && 'message' in form
			? form.message
			: undefined
	);

	const failureFor = (action: string) =>
		form && 'action' in form && form.action === action && 'message' in form
			? form.message
			: undefined;

	// Handing an asset over is a dialog, not a select: the technician must see the link (ADR 0035).
	let deliverOpen = $state(false);
	let takeBackOpen = $state(false);
	$effect(() => {
		if (
			data.may.deliver &&
			(location.hash === '#action-custody' || data.context.fromTicket) &&
			data.choices.deliverable.length > 0
		) {
			deliverOpen = true;
		}
	});
	const deliverError = $derived(
		form && 'action' in form && form.action === 'deliver' && 'message' in form
			? form.message
			: undefined
	);
	const takeBackError = $derived(
		form && 'action' in form && form.action === 'takeBack' && 'message' in form
			? form.message
			: undefined
	);

	// The palette's "Vincular ticket" opens the panel's own dialog (#168).
	let linkOpen = $state(false);
	$effect(() => {
		if (!data.may.linkTickets) return;
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
	const personOptions = $derived(options(data.choices.people, (person) => person.fullName));
	const locationChoices = $derived(locationOptions(data.choices.locations));
	const editModelOptions = $derived(
		options(data.choices.models, (entry) => `${entry.manufacturerName} · ${entry.name}`)
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
			},
			// A successful save answers with `redirect(303)` to this same page, and
			// Superforms fires neither `onUpdated` nor an untaint for a redirect:
			// the sheet would stay open and then ask to discard what was just saved.
			onResult({ result }) {
				if (result.type !== 'redirect') return;
				untaintEdit();
				editOpen = false;
			}
		}
	);
	const {
		form: editValues,
		errors: editErrors,
		enhance: editEnhance,
		submitting: editSubmitting
	} = edit;

	function untaintEdit() {
		edit.tainted.set(undefined);
	}

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

{#snippet custodianRow()}
	{#if data.may.deliver}
		<span id="action-custody" class="flex items-center gap-[var(--space-3)]">
			<span class="text-[var(--ink-muted)]">{m.assets_no_custodian()}</span>
			<Button type="button" size="sm" variant="secondary" onclick={() => (deliverOpen = true)}>
				{m.deliver_button()}
			</Button>
		</span>
	{:else}
		<span id="action-custody" class="flex items-center gap-[var(--space-3)]">
			<span class="text-[var(--ink-muted)]">{localCustodianName ?? m.assets_no_custodian()}</span>
			{#if data.may.takeBack}
				<Button type="button" size="sm" variant="secondary" onclick={() => (takeBackOpen = true)}>
					{m.take_back_button()}
				</Button>
			{/if}
		</span>
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
		editable={data.may.changeLocation}
		openOnHash="action-location"
		optimistic={(formData) => {
			const next = formData.get('locationId');
			const previousId = localLocationId;
			const previousName = localLocationName;
			const nextId = typeof next === 'string' && next !== '' ? next : null;
			localLocationId = nextId;
			localLocationName = nextId
				? (data.choices.locations.find((candidate) => candidate.id === nextId)?.path ??
					previousName)
				: null;
			return () => {
				localLocationId = previousId;
				localLocationName = previousName;
			};
		}}
	/>
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
			{#if data.may.printLabel}
				<Button href="/assets/labels?tag={encodeURIComponent(asset.assetTag)}" variant="secondary">
					<Printer class="size-4" aria-hidden="true" />
					{m.labels_print_one()}
				</Button>
			{/if}
			{#if data.may.edit}
				<Button
					href="/assets/{encodeURIComponent(asset.assetTag)}/edit"
					variant="secondary"
					onclick={openEdit}
				>
					<Pencil class="size-4" aria-hidden="true" />
					{m.asset_detail_edit()}
				</Button>
			{/if}
			{#if data.may.archive || data.may.unarchive}
				{#if archived}
					<form method="POST" action="?/unarchive" use:enhance>
						<Button type="submit" variant="secondary">
							<ArchiveRestore class="size-4" aria-hidden="true" />
							{m.asset_unarchive_button()}
						</Button>
					</form>
				{:else}
					<Button type="button" variant="secondary" onclick={() => (archiveOpen = true)}>
						<Archive class="size-4" aria-hidden="true" />
						{m.asset_archive_button()}
					</Button>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	{#if archived}
		<p class="mt-[var(--space-3)] text-sm text-[var(--ink-muted)]" role="status">
			{m.asset_archived_notice()}
		</p>
	{/if}

	{#if asset.visibility === 'full'}
		<div class="mt-[var(--space-2)] flex items-center gap-[var(--space-2)]">
			<EditableChip
				value={localState}
				options={stateChoices}
				action="?/changeState"
				name="state"
				editable={data.may.changeState}
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

		{#if data.attachments}
			<RecordAttachments
				items={data.attachments}
				downloadBase="/asset-attachments"
				canManage={data.may.attach}
				uploadError={failureFor('addAttachments')}
				removeError={failureFor('removeAttachment')}
			/>
		{/if}

		{#if data.handovers && data.custody}
			<WorkPanel heading={m.asset_handovers_title()} id="handovers">
				<p class="mb-[var(--space-3)] flex items-center gap-[var(--space-2)] text-sm">
					<span class="text-[var(--ink-muted)]">{m.handover_custody_label()}</span>
					{#if data.custody.kind === 'handover'}
						<a
							href="/assets/handovers/{encodeURIComponent(data.custody.code)}"
							class="font-mono text-xs hover:underline">{data.custody.code}</a
						>
						<HandoverStateBadge state={data.custody.state} />
					{:else}
						<span>{m.handover_custody_none_required()}</span>
					{/if}
				</p>
				<HandoversTable rows={data.handovers} emptyMessage={m.asset_handovers_empty()} />
			</WorkPanel>
		{/if}

		{#if data.comments}
			<CommentsCard
				id="comments"
				comments={data.comments}
				action="?/addComment"
				canComment={data.may.comment}
				error={form && 'action' in form && form.action === 'addComment' && 'message' in form
					? form.message
					: undefined}
			/>
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
		{#await data.rail}
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
					{#if data.may.linkTickets || ticketGroups.length > 0}
						<RelatedRecords
							groups={ticketGroups}
							unlinkAction={data.may.linkTickets ? '?/unlinkTicket' : undefined}
							error={unlinkTicketError}
							linkAction={data.may.linkTickets ? '?/linkTickets' : undefined}
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

{#if data.may.edit}
	<Sheet
		open={editOpen}
		onOpenChange={requestClose}
		pending={$editSubmitting}
		title={m.asset_edit_title({ tag: asset.assetTag })}
		description={m.asset_edit_lede()}
		form={{
			action: `/assets/${encodeURIComponent(asset.assetTag)}/edit?/save`,
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

	<CreateModelDialog
		open={modelOpen}
		onOpenChange={(next) => (modelOpen = next)}
		action="/assets/{encodeURIComponent(asset.assetTag)}/edit?/createModel"
		form={data.modelForm}
		manufacturers={data.choices.catalogues.manufacturers}
		categories={data.choices.catalogues.categories}
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

{#if data.may.archive}
	<ConfirmDialog
		open={archiveOpen}
		onOpenChange={(next) => (archiveOpen = next)}
		title={m.asset_archive_title()}
		description={m.asset_archive_ask({ tag: asset.assetTag })}
		confirmLabel={m.asset_archive_confirm()}
		pending={archiving}
		error={failureFor('archive')}
	>
		{#snippet action(confirm)}
			<form
				method="POST"
				action="?/archive"
				use:enhance={() => {
					archiving = true;
					return async ({ result, update }) => {
						archiving = false;
						if (result.type === 'success') archiveOpen = false;
						await update();
					};
				}}
			>
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}

{#if asset.visibility === 'full' && data.may.deliver && deliverOpen}
	<DeliverDialog
		open={deliverOpen}
		onOpenChange={(next) => (deliverOpen = next)}
		people={personOptions}
		assets={data.choices.deliverable}
		currentId={asset.id}
		canWaive={data.may.waiveHandover}
		waiveReasonMax={data.waiveReasonMax}
		ticket={data.context.fromTicket}
		error={deliverError}
	/>
{/if}

{#if asset.visibility === 'full' && data.may.takeBack && takeBackOpen && localCustodianPersonId}
	<TakeBackDialog
		open={takeBackOpen}
		onOpenChange={(next) => (takeBackOpen = next)}
		person={{ id: localCustodianPersonId, fullName: localCustodianName ?? '' }}
		assets={data.choices.heldAssets}
		currentId={asset.id}
		action="?/takeBack"
		ticket={data.context.fromTicket}
		error={takeBackError}
	/>
{/if}
