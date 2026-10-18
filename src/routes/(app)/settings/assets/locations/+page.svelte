<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import { deleteFailureFrom } from '#lib/components/unitati/catalogue-dialog.svelte.js';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { locationOptions } from '../../../assets/options';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Entry = PageProps['data']['locations'][number];

	const EMPTY = {
		name: '',
		parentId: '',
		code: '',
		address: '',
		notes: '',
		latitude: '',
		longitude: ''
	};
	type Draft = typeof EMPTY;

	/** `null` is "creating"; an entry is "editing it". One Sheet serves both (ADR 0027). */
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

	function open(entry: Entry | null) {
		editing = entry;
		initial = entry
			? {
					name: entry.name,
					parentId: entry.parentId ?? '',
					code: entry.code ?? '',
					address: entry.address ?? '',
					notes: entry.notes ?? '',
					latitude: entry.latitude === null ? '' : String(entry.latitude),
					longitude: entry.longitude === null ? '' : String(entry.longitude)
				}
			: { ...EMPTY };
		draft = { ...initial };
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

	/** The location itself and everything below it cannot be its parent. */
	const parentChoices = $derived.by(() => {
		const excluded: string[] = [];
		if (editing) {
			excluded.push(editing.id);
			// The list is tree-ordered, so one pass finds every descendant.
			for (const entry of data.locations) {
				if (entry.parentId && excluded.includes(entry.parentId)) excluded.push(entry.id);
			}
		}
		return locationOptions(data.locations.filter((entry) => !excluded.includes(entry.id)));
	});

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

	function coordinates(entry: Entry): string {
		return entry.latitude === null || entry.longitude === null
			? '—'
			: `${entry.latitude.toFixed(5)}, ${entry.longitude.toFixed(5)}`;
	}

	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);
	const deleteFailure = $derived(deleteFailureFrom(form, confirmingId));
</script>

<svelte:head>
	<title>{documentTitle(m.locations_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.locations_title()}>
		{#snippet summary()}{m.locations_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={() => open(null)}>{m.locations_new()}</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.locations.length === 0}
			<EmptyState description={m.locations_empty()} />
		{:else}
			<table class="w-full text-left text-sm">
				<thead class="border-b border-[var(--border)] text-small text-[var(--ink-muted)]">
					<tr>
						<th scope="col" class="p-[var(--space-3)] font-medium">{m.locations_column_name()}</th>
						<th scope="col" class="p-[var(--space-3)] font-medium">{m.locations_column_code()}</th>
						<th scope="col" class="p-[var(--space-3)] font-medium">
							{m.locations_column_address()}
						</th>
						<th scope="col" class="p-[var(--space-3)] font-medium">
							{m.locations_column_coordinates()}
						</th>
						<th scope="col" class="p-[var(--space-3)] text-right font-medium">
							{m.locations_column_assets()}
						</th>
						<th scope="col" class="p-[var(--space-3)]"><span class="sr-only">&nbsp;</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--border)]">
					{#each data.locations as entry (entry.id)}
						<tr>
							<th
								scope="row"
								class="p-[var(--space-3)] font-medium text-[var(--ink)]"
								style:padding-left="calc(var(--space-3) + {entry.depth} * var(--space-5))"
								title={entry.path}
							>
								{entry.name}
							</th>
							<td class="p-[var(--space-3)] text-[var(--ink-muted)]">{entry.code ?? '—'}</td>
							<td class="max-w-[260px] truncate p-[var(--space-3)] text-[var(--ink-muted)]">
								{entry.address ?? '—'}
							</td>
							<td class="p-[var(--space-3)] whitespace-nowrap text-[var(--ink-muted)] tabular-nums">
								{coordinates(entry)}
							</td>
							<td class="p-[var(--space-3)] text-right text-[var(--ink-muted)] tabular-nums">
								{entry.assets}
							</td>
							<td class="p-[var(--space-3)]">
								<div class="flex items-center justify-end gap-[var(--space-2)]">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										iconOnly
										title={m.catalogue_edit()}
										aria-label={m.catalogue_edit_title({ name: entry.path })}
										onclick={() => open(entry)}
									>
										<PencilIcon class="size-4" aria-hidden="true" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										iconOnly
										class="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
										title={m.catalogue_delete()}
										aria-label={m.catalogue_delete_title({ name: entry.path })}
										onclick={() => (confirmingId = entry.id)}
									>
										<Trash2Icon class="size-4" aria-hidden="true" />
									</Button>
								</div>

								<ConfirmDialog
									open={confirmingId === entry.id}
									onOpenChange={(next) => {
										if (!next) confirmingId = null;
									}}
									title={m.catalogue_delete_title({ name: entry.path })}
									description={entry.people === 0
										? m.catalogue_delete_ask()
										: `${m.catalogue_delete_ask()} ${
												entry.people === 1
													? m.locations_delete_people_one()
													: m.locations_delete_people_other({ count: entry.people })
											}`}
									confirmLabel={m.catalogue_delete()}
									pending={pendingId === entry.id}
									error={confirmingId === entry.id && form?.id === entry.id ? form.message : null}
								>
									{#snippet action(confirm)}
										<form
											method="POST"
											action="?/delete"
											use:enhance={confirmSubmit({
												onPending: (pending) => (pendingId = pending ? entry.id : null),
												onSettled: (succeeded) => {
													if (succeeded) confirmingId = null;
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
		title={editing ? m.locations_edit_title({ name: editing.name }) : m.locations_new()}
	>
		<form
			method="POST"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
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
				label={m.locations_field_name()}
				name="name"
				bind:value={draft.name}
				error={errors.name}
				required
			/>
			<SelectField
				label={m.locations_field_parent()}
				name="parentId"
				placeholder={m.locations_no_parent()}
				options={parentChoices}
				bind:value={draft.parentId}
				error={errors.parentId}
			/>
			<Field
				label={m.locations_field_code()}
				name="code"
				bind:value={draft.code}
				hint={m.locations_field_code_hint()}
				error={errors.code}
			/>
			<Field
				label={m.locations_field_address()}
				name="address"
				bind:value={draft.address}
				error={errors.address}
			/>
			<TextAreaField
				label={m.locations_field_notes()}
				name="notes"
				bind:value={draft.notes}
				error={errors.notes}
			/>

			<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
				<Field
					label={m.locations_field_latitude()}
					name="latitude"
					inputmode="decimal"
					autocomplete="off"
					bind:value={draft.latitude}
					error={errors.latitude}
				/>
				<Field
					label={m.locations_field_longitude()}
					name="longitude"
					inputmode="decimal"
					autocomplete="off"
					bind:value={draft.longitude}
					error={errors.longitude}
				/>
			</div>
			<p class="text-small text-[var(--ink-muted)]">
				{m.locations_field_coordinates_hint()}
			</p>

			{#if sheetFailure?.message}
				<FormError>{sheetFailure.message}</FormError>
			{/if}

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={() => requestClose(false)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={saving}>{m.catalogue_save()}</Button>
			</div>
		</form>
	</Sheet>

	<ConfirmDialog
		open={confirmDiscard}
		onOpenChange={(next) => {
			if (!next) confirmDiscard = false;
		}}
		title={m.locations_discard_title()}
		description={m.locations_discard_ask()}
		confirmLabel={m.locations_discard_confirm()}
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
