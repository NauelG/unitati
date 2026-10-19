<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { enhance } from '$app/forms';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import {
		catalogueDialog,
		deleteFailureFrom
	} from '#lib/components/unitati/catalogue-dialog.svelte.js';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Entry = PageProps['data']['departments'][number];

	const columns: DataTableColumn<Entry>[] = [
		{ key: 'name', header: m.departments_column_name(), cell: nameCell },
		{ key: 'people', header: m.departments_column_people(), align: 'end', cell: peopleCell },
		{ key: 'actions', header: m.departments_column_actions(), kind: 'actions', cell: actionsCell }
	];

	/** One `Dialog` serves "new" and "rename": one field, one action (ADR 0020). */
	const dialog = catalogueDialog<Entry>({ createAction: 'create', editAction: 'rename' });
	let name = $state('');
	let saving = $state(false);
	const dialogFailure = $derived(dialog.failureFrom(form));

	function openCreate() {
		name = '';
		dialog.openCreate();
	}

	function openRename(entry: Entry) {
		name = entry.name;
		dialog.openEdit(entry);
	}

	/** The department asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	let pending = $state(false);
	const confirming = $derived(data.departments.find((entry) => entry.id === confirmingId) ?? null);
	const deleteFailure = $derived(deleteFailureFrom(form, confirmingId));
</script>

{#snippet nameCell(entry: Entry)}{entry.name}{/snippet}
{#snippet peopleCell(entry: Entry)}{entry.peopleCount}{/snippet}
{#snippet actionsCell(entry: Entry)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="ut-transition-fast grid size-8 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
			aria-label={m.departments_actions_label({ name: entry.name })}
		>
			<EllipsisIcon class="size-4" aria-hidden="true" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-40">
			<DropdownMenu.Item onSelect={() => openRename(entry)}>
				<PencilIcon class="size-4" aria-hidden="true" />
				{m.departments_rename()}
			</DropdownMenu.Item>
			<DropdownMenu.Item
				class="text-[var(--danger)]"
				onSelect={() => {
					confirmingId = entry.id;
				}}
			>
				<Trash2Icon class="size-4" aria-hidden="true" />
				{m.catalogue_delete()}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<svelte:head>
	<title>{documentTitle(m.departments_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.departments_title()}>
		{#snippet summary()}{m.departments_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate}>{m.departments_new()}</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<DataTable
		class="mt-[var(--space-6)]"
		{columns}
		rows={data.departments}
		rowKey={(entry) => entry.id}
		emptyMessage={m.departments_empty()}
	/>

	<Dialog
		open={dialog.open}
		onOpenChange={(next) => {
			if (!next) dialog.close();
		}}
		pending={saving}
		title={dialog.editing
			? m.departments_rename_title({ name: dialog.editing.name })
			: m.departments_new()}
	>
		<form
			method="POST"
			action={dialog.editingId ? '?/rename' : '?/create'}
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') dialog.close();
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if dialog.editingId}
				<input type="hidden" name="id" value={dialog.editingId} />
			{/if}
			<Field
				label={m.departments_field_name()}
				name="name"
				bind:value={name}
				maxlength={80}
				required
			/>

			{#if dialogFailure}
				<FormError>{dialogFailure}</FormError>
			{/if}

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={dialog.close}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={saving}>{m.catalogue_save()}</Button>
			</div>
		</form>
	</Dialog>

	<ConfirmDialog
		open={confirming !== null}
		onOpenChange={(next) => {
			if (!next) confirmingId = null;
		}}
		title={m.departments_delete_title({ name: confirming?.name ?? '' })}
		description={confirming && confirming.peopleCount > 0
			? confirming.peopleCount === 1
				? m.departments_in_use_one()
				: m.departments_in_use_other({ count: confirming.peopleCount })
			: m.catalogue_delete_ask()}
		confirmLabel={m.catalogue_delete()}
		{pending}
		error={confirming && form?.action === 'delete' && form.id === confirming.id
			? form.message
			: null}
	>
		{#snippet action(confirm)}
			<form
				method="POST"
				action="?/delete"
				use:enhance={confirmSubmit({
					onPending: (value) => (pending = value),
					onSettled: (succeeded) => {
						if (succeeded) confirmingId = null;
					}
				})}
			>
				<input type="hidden" name="id" value={confirming?.id ?? ''} />
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>
</PageLayout>
