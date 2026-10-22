<script lang="ts">
	import { enhance } from '$app/forms';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import { SPACE_ICON_COMPONENTS } from '#lib/components/unitati/space-icons.js';
	import SpaceColourPicker from '#lib/components/unitati/SpaceColourPicker.svelte';
	import SpaceIconPicker from '#lib/components/unitati/SpaceIconPicker.svelte';
	import { badge } from '#lib/components/unitati/StatusBadge.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import {
		DEFAULT_SPACE_COLOUR,
		DEFAULT_SPACE_ICON,
		SPACE_DESCRIPTION_MAX,
		SPACE_NAME_MAX,
		spaceColourVar,
		type SpaceAudience,
		type SpaceColour,
		type SpaceIcon
	} from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Entry = PageProps['data']['spaces'][number];

	type Draft = {
		name: string;
		description: string;
		icon: SpaceIcon;
		colour: SpaceColour;
		audience: SpaceAudience;
	};

	const EMPTY: Draft = {
		name: '',
		description: '',
		icon: DEFAULT_SPACE_ICON,
		colour: DEFAULT_SPACE_COLOUR,
		audience: 'staff'
	};

	/** `null` is "creating"; an entry is "editing it". One Sheet serves both (ADR 0027 §8). */
	let sheetOpen = $state(false);
	let editing = $state<Entry | null>(null);
	let draft: Draft = $state({ ...EMPTY });
	let initial: Draft = $state({ ...EMPTY });
	let saving = $state(false);
	let confirmDiscard = $state(false);

	const editingId = $derived(editing?.id ?? null);
	const dirty = $derived(
		(Object.keys(EMPTY) as (keyof Draft)[]).some((k) => draft[k] !== initial[k])
	);
	const audienceChanged = $derived(editing !== null && draft.audience !== initial.audience);

	function open(entry: Entry | null) {
		editing = entry;
		initial = entry
			? {
					name: entry.name,
					description: entry.description ?? '',
					icon: entry.icon,
					colour: entry.colour,
					audience: entry.audience
				}
			: { ...EMPTY };
		draft = { ...initial };
		audienceCount = null;
		sheetOpen = true;
	}

	/** A dirty form asks before it is thrown away (ADR 0020 §Sheet). */
	function requestClose(next: boolean) {
		if (next) return;
		if (saving) return;
		if (dirty) {
			confirmDiscard = true;
			return;
		}
		sheetOpen = false;
	}

	/** Only this Sheet's own failure: never a stale one from another row or action. */
	const sheetFailure = $derived(
		sheetOpen &&
			form &&
			form.action === (editingId ? 'update' : 'create') &&
			(form.id ?? null) === editingId
			? form
			: null
	);
	const errors = $derived(sheetFailure?.errors ?? {});

	// The audience confirmation: the exact count comes from `?/preview`, and the
	// confirmed save carries it back so the domain can refuse a stale one.
	let audienceCount = $state<number | null>(null);
	let confirmingAudience = $derived(audienceCount !== null);
	let audiencePending = $state(false);

	function pages(count: number): string {
		return count === 1 ? m.knowledge_pages_one() : m.knowledge_pages_other({ count });
	}

	const audienceAsk = $derived(
		audienceCount === null
			? ''
			: draft.audience === 'portal'
				? m.knowledge_space_audience_to_portal({ pages: pages(audienceCount) })
				: m.knowledge_space_audience_to_staff({ pages: pages(audienceCount) })
	);

	let archivingId: string | null = $state(null);
	let deletingId: string | null = $state(null);
	let pendingId: string | null = $state(null);

	const rowFailure = $derived(
		form && (form.action === 'archive' || form.action === 'delete') && form.message ? form : null
	);

	const audienceLabel = (audience: SpaceAudience) =>
		audience === 'portal' ? m.knowledge_audience_portal() : m.knowledge_audience_staff();

	const archivedHref = $derived(data.showArchived ? '?' : '?archived=1');
</script>

<svelte:head>
	<title>{documentTitle(m.knowledge_spaces_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.knowledge_spaces_title()}>
		{#snippet summary()}{m.knowledge_spaces_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={() => open(null)}>{m.knowledge_spaces_new()}</Button>
		{/snippet}
	</PageHeader>

	{#if rowFailure?.message}
		<Alert tone="danger" class="mt-[var(--space-6)]">{rowFailure.message}</Alert>
	{/if}

	<div class="mt-[var(--space-6)] flex justify-end">
		<a
			href={archivedHref}
			data-sveltekit-noscroll
			class="text-small text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
		>
			{data.showArchived ? m.knowledge_spaces_hide_archived() : m.knowledge_spaces_show_archived()}
		</a>
	</div>

	<div
		class="mt-[var(--space-2)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.spaces.length === 0}
			<EmptyState description={m.knowledge_spaces_empty()} />
		{:else}
			<table class="w-full text-left text-sm">
				<thead class="border-b border-[var(--border)] text-small text-[var(--ink-muted)]">
					<tr>
						<th scope="col" class="p-[var(--space-3)] font-medium">
							{m.knowledge_spaces_column_name()}
						</th>
						<th scope="col" class="p-[var(--space-3)] font-medium">
							{m.knowledge_spaces_column_audience()}
						</th>
						<th scope="col" class="p-[var(--space-3)] text-right font-medium">
							{m.knowledge_spaces_column_pages()}
						</th>
						<th scope="col" class="p-[var(--space-3)]"><span class="sr-only">&nbsp;</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--border)]">
					{#each data.spaces as entry (entry.id)}
						{@const Icon = SPACE_ICON_COMPONENTS[entry.icon]}
						<tr class={entry.archivedAt ? 'opacity-60' : ''}>
							<th scope="row" class="p-[var(--space-3)] font-medium text-[var(--ink)]">
								<span class="flex items-center gap-[var(--space-3)]">
									<span
										class="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--on-brand)]"
										style:background-color={spaceColourVar(entry.colour)}
										aria-hidden="true"
									>
										<Icon class="size-4" />
									</span>
									<span class="min-w-0">
										<span class="block truncate">{entry.name}</span>
										{#if entry.description}
											<span
												class="block max-w-[420px] truncate text-small font-normal text-[var(--ink-muted)]"
											>
												{entry.description}
											</span>
										{/if}
									</span>
								</span>
							</th>
							<td class="p-[var(--space-3)]">
								<span class="flex flex-wrap gap-[var(--space-1)]">
									<span
										class={badge({
											tone: entry.audience === 'portal' ? 'brand' : 'neutral',
											plain: true
										})}
									>
										{audienceLabel(entry.audience)}
									</span>
									{#if entry.archivedAt}
										<span class={badge({ tone: 'warning', plain: true })}>
											{m.knowledge_spaces_archived_badge()}
										</span>
									{/if}
								</span>
							</td>
							<td class="p-[var(--space-3)] text-right text-[var(--ink-muted)] tabular-nums">
								{entry.pageCount}
							</td>
							<td class="p-[var(--space-3)]">
								<div class="flex items-center justify-end gap-[var(--space-2)]">
									{#if !entry.archivedAt}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											iconOnly
											title={m.catalogue_edit()}
											aria-label={m.knowledge_spaces_edit_title({ name: entry.name })}
											onclick={() => open(entry)}
										>
											<PencilIcon class="size-4" aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											iconOnly
											title={m.knowledge_space_archive()}
											aria-label={m.knowledge_space_archive_title({ name: entry.name })}
											onclick={() => (archivingId = entry.id)}
										>
											<ArchiveIcon class="size-4" aria-hidden="true" />
										</Button>
									{/if}
									{#if entry.totalPageCount === 0}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											iconOnly
											class="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
											title={m.knowledge_space_delete()}
											aria-label={m.knowledge_space_delete_title({ name: entry.name })}
											onclick={() => (deletingId = entry.id)}
										>
											<Trash2Icon class="size-4" aria-hidden="true" />
										</Button>
									{/if}
								</div>

								<ConfirmDialog
									open={archivingId === entry.id}
									onOpenChange={(next) => {
										if (!next) archivingId = null;
									}}
									title={m.knowledge_space_archive_title({ name: entry.name })}
									description={m.knowledge_space_archive_ask({ pages: pages(entry.pageCount) })}
									confirmLabel={m.knowledge_space_archive()}
									pending={pendingId === entry.id}
									error={archivingId === entry.id && form?.id === entry.id ? form.message : null}
								>
									{#snippet action(confirm)}
										<form
											method="POST"
											action="?/archive"
											use:enhance={confirmSubmit({
												onPending: (pending) => (pendingId = pending ? entry.id : null),
												onSettled: (succeeded) => {
													if (succeeded) archivingId = null;
												}
											})}
										>
											<input type="hidden" name="id" value={entry.id} />
											{@render confirm()}
										</form>
									{/snippet}
								</ConfirmDialog>

								<ConfirmDialog
									open={deletingId === entry.id}
									onOpenChange={(next) => {
										if (!next) deletingId = null;
									}}
									title={m.knowledge_space_delete_title({ name: entry.name })}
									description={m.knowledge_space_delete_ask()}
									confirmLabel={m.knowledge_space_delete()}
									pending={pendingId === entry.id}
									error={deletingId === entry.id && form?.id === entry.id ? form.message : null}
								>
									{#snippet action(confirm)}
										<form
											method="POST"
											action="?/delete"
											use:enhance={confirmSubmit({
												onPending: (pending) => (pendingId = pending ? entry.id : null),
												onSettled: (succeeded) => {
													if (succeeded) deletingId = null;
												}
											})}
										>
											<input type="hidden" name="id" value={entry.id} />
											{@render confirm()}
										</form>
									{/snippet}
								</ConfirmDialog>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<Sheet
		open={sheetOpen}
		onOpenChange={requestClose}
		pending={saving}
		title={editing
			? m.knowledge_spaces_edit_title({ name: editing.name })
			: m.knowledge_spaces_new()}
	>
		<form
			method="POST"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				saving = true;
				return async ({ result, update, action }) => {
					// An audience change is confirmed before it is saved: the preview
					// answers the exact count and nothing is written yet.
					if (action.search.startsWith('?/preview')) {
						saving = false;
						if (result.type === 'success' && typeof result.data?.count === 'number') {
							audienceCount = result.data.count;
						} else {
							await update({ reset: false });
						}
						return;
					}
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') sheetOpen = false;
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<Field
				label={m.knowledge_space_field_name()}
				name="name"
				maxlength={SPACE_NAME_MAX}
				bind:value={draft.name}
				error={errors.name}
				required
			/>
			<TextAreaField
				label={m.knowledge_space_field_description()}
				name="description"
				maxlength={SPACE_DESCRIPTION_MAX}
				bind:value={draft.description}
				error={errors.description}
			/>
			<SpaceIconPicker name="icon" bind:value={draft.icon} error={errors.icon} />
			<SpaceColourPicker name="colour" bind:value={draft.colour} error={errors.colour} />

			<!-- When editing, the audience is not posted from here: a change goes through the confirmation. -->
			<fieldset class="min-w-0 space-y-[var(--space-2)]">
				<legend class="text-label text-[var(--ink)]">{m.knowledge_space_field_audience()}</legend>
				{#each ['staff', 'portal'] as const as option (option)}
					<label class="flex items-start gap-[var(--space-2)] text-sm">
						<input
							type="radio"
							name={editingId ? undefined : 'audience'}
							value={option}
							bind:group={draft.audience}
							class="mt-1"
						/>
						<span>
							<span class="block font-medium text-[var(--ink)]">{audienceLabel(option)}</span>
							<span class="block text-small text-[var(--ink-muted)]">
								{option === 'portal'
									? m.knowledge_audience_portal_hint()
									: m.knowledge_audience_staff_hint()}
							</span>
						</span>
					</label>
				{/each}
				{#if errors.audience}
					<p class="text-small text-[var(--danger)]" role="alert">{errors.audience}</p>
				{/if}
			</fieldset>

			{#if sheetFailure?.message}
				<FormError>{sheetFailure.message}</FormError>
			{/if}

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={() => requestClose(false)}>
					{m.form_cancel()}
				</Button>
				<Button
					type="submit"
					size="sm"
					busy={saving}
					formaction={audienceChanged ? '?/preview' : undefined}
				>
					{m.knowledge_space_save()}
				</Button>
			</div>
		</form>
	</Sheet>

	<ConfirmDialog
		open={confirmingAudience}
		onOpenChange={(next) => {
			if (!next) audienceCount = null;
		}}
		title={m.knowledge_space_audience_title({ name: editing?.name ?? '' })}
		description={audienceAsk}
		confirmLabel={m.knowledge_space_audience_confirm()}
		pending={audiencePending}
		danger={false}
		error={sheetFailure?.message}
	>
		{#snippet action(confirm)}
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					audiencePending = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						audiencePending = false;
						audienceCount = null;
						if (result.type === 'success') sheetOpen = false;
					};
				}}
			>
				<input type="hidden" name="id" value={editingId ?? ''} />
				<input type="hidden" name="name" value={draft.name} />
				<input type="hidden" name="description" value={draft.description} />
				<input type="hidden" name="icon" value={draft.icon} />
				<input type="hidden" name="colour" value={draft.colour} />
				<input type="hidden" name="audience" value={draft.audience} />
				<input type="hidden" name="confirmedCount" value={audienceCount ?? ''} />
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>

	<ConfirmDialog
		open={confirmDiscard}
		onOpenChange={(next) => {
			if (!next) confirmDiscard = false;
		}}
		title={m.knowledge_space_discard_title()}
		description={m.knowledge_space_discard_ask()}
		confirmLabel={m.knowledge_space_discard_confirm()}
		danger={false}
	>
		{#snippet action(confirm)}
			<form
				onsubmit={(event) => {
					event.preventDefault();
					confirmDiscard = false;
					sheetOpen = false;
				}}
			>
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>
</PageLayout>
