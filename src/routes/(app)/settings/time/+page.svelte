<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import StarIcon from '@lucide/svelte/icons/star';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import { catalogueDialog } from '#lib/components/unitati/catalogue-dialog.svelte.js';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Switch from '#lib/components/unitati/Switch.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	interface Row {
		id: string;
		name: string;
		isDefault: boolean;
		archived: boolean;
		entryCount: number;
	}

	const input = field().input();
	const dialog = catalogueDialog<Row>({ createAction: 'create', editAction: 'rename' });
	let draftName = $state('');
	let saving = $state(false);

	function openCreate() {
		draftName = '';
		dialog.openCreate();
	}

	function openEdit(row: Row) {
		draftName = row.name;
		dialog.openEdit(row);
	}

	const dialogFailure = $derived(dialog.failureFrom(form));

	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);

	/** Refusals of the row actions stay on the page, as an `Alert`. */
	const rowFailure = $derived(
		form && ['reorder', 'makeDefault', 'delete'].includes(form.action) ? form.message : null
	);

	const cell = 'px-[var(--space-3)] py-[var(--space-2)] align-middle';
	const head =
		'px-[var(--space-3)] h-8 text-left align-middle text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)] bg-[var(--surface-2)]';
	const active = $derived(data.types.filter((type) => !type.archived));
</script>

<svelte:head>
	<title>{documentTitle(m.time_settings_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.time_settings_title()}>
		{#snippet summary()}{m.time_settings_lede()}{/snippet}
		{#snippet actions()}
			{#if data.enabled}
				<Button onclick={openCreate}>{m.time_settings_create()}</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/toggle"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') toast.success(m.time_settings_saved());
			}}
		class="mt-[var(--space-6)] flex items-start justify-between gap-[var(--space-4)]"
	>
		<input type="hidden" name="enabled" value={String(!data.enabled)} />
		<div class="space-y-[var(--space-1)]">
			<p id="time-enabled-label" class="text-sm font-semibold text-[var(--ink)]">
				{m.time_settings_toggle_label()}
			</p>
			<p class="text-sm text-[var(--ink-muted)]">{m.time_settings_toggle_hint()}</p>
		</div>
		<Switch
			type="submit"
			checked={data.enabled}
			label={m.time_settings_toggle_label()}
			aria-describedby="time-enabled-label"
		/>
	</form>

	{#if data.enabled}
		{#if rowFailure}
			<Alert tone="danger" class="mt-[var(--space-6)]">{rowFailure}</Alert>
		{/if}

		<h2 class="mt-[var(--space-8)] text-base font-semibold text-[var(--ink)]">
			{m.time_settings_types()}
		</h2>
		<div
			class="mt-[var(--space-3)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
		>
			{#if data.types.length === 0}
				<EmptyState description={m.time_settings_empty()} />
			{:else}
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr>
							<th scope="col" class={head}>{m.time_settings_name()}</th>
							<th scope="col" class={head}>{m.time_settings_status()}</th>
							<th scope="col" class="{head} text-right">{m.time_settings_entries()}</th>
							<th scope="col" class={head}>{m.time_settings_order()}</th>
							<th scope="col" class="{head} text-right">{m.time_settings_actions()}</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[var(--border)]">
						{#each data.types as row (row.id)}
							<tr>
								<th scope="row" class="{cell} text-left font-medium text-[var(--ink)]">
									{row.name}
								</th>
								<td class={cell}>
									{#if row.isDefault}
										<span class="text-[var(--ink)]">{m.time_settings_default()}</span>
									{:else if row.archived}
										<span class="text-[var(--ink-muted)]">{m.time_settings_archived()}</span>
									{/if}
								</td>
								<td class="{cell} text-right font-mono text-[var(--ink-muted)] tabular-nums">
									{row.entryCount}
								</td>
								<td class={cell}>
									{#if !row.archived}
										<div class="flex items-center gap-[var(--space-1)]">
											{#each ['up', 'down'] as const as direction (direction)}
												<form method="POST" action="?/reorder" use:enhance>
													<input type="hidden" name="id" value={row.id} />
													<input type="hidden" name="direction" value={direction} />
													<Button
														type="submit"
														variant="ghost"
														iconOnly
														size="sm"
														disabled={direction === 'up'
															? active[0]?.id === row.id
															: active.at(-1)?.id === row.id}
														aria-label={direction === 'up'
															? m.time_settings_move_up({ name: row.name })
															: m.time_settings_move_down({ name: row.name })}
													>
														{#if direction === 'up'}
															<ArrowUpIcon class="size-4" aria-hidden="true" />
														{:else}
															<ArrowDownIcon class="size-4" aria-hidden="true" />
														{/if}
													</Button>
												</form>
											{/each}
										</div>
									{/if}
								</td>
								<td class={cell}>
									<div class="flex items-center justify-end gap-[var(--space-2)]">
										{#if !row.archived && !row.isDefault}
											<form method="POST" action="?/makeDefault" use:enhance>
												<input type="hidden" name="id" value={row.id} />
												<Button
													type="submit"
													variant="ghost"
													size="sm"
													iconOnly
													title={m.time_settings_make_default()}
													aria-label={m.time_settings_make_default_title({ name: row.name })}
												>
													<StarIcon class="size-4" aria-hidden="true" />
												</Button>
											</form>
										{/if}
										{#if !row.archived}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												iconOnly
												title={m.catalogue_edit()}
												aria-label={m.catalogue_edit_title({ name: row.name })}
												onclick={() => openEdit(row)}
											>
												<PencilIcon class="size-4" aria-hidden="true" />
											</Button>
										{/if}
										{#if !row.isDefault}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												iconOnly
												class="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
												title={m.catalogue_delete()}
												aria-label={m.catalogue_delete_title({ name: row.name })}
												onclick={() => (confirmingId = row.id)}
											>
												<Trash2Icon class="size-4" aria-hidden="true" />
											</Button>
										{/if}
									</div>

									<ConfirmDialog
										open={confirmingId === row.id}
										onOpenChange={(next) => {
											if (!next) confirmingId = null;
										}}
										title={m.catalogue_delete_title({ name: row.name })}
										description={row.entryCount > 0
											? m.time_settings_delete_archives()
											: m.catalogue_delete_ask()}
										confirmLabel={row.entryCount > 0
											? m.time_settings_archive()
											: m.catalogue_delete()}
										pending={pendingId === row.id}
									>
										{#snippet action(confirm)}
											<form
												method="POST"
												action="?/delete"
												use:enhance={confirmSubmit({
													onPending: (pending) => (pendingId = pending ? row.id : null),
													onSettled: () => (confirmingId = null)
												})}
											>
												<input type="hidden" name="id" value={row.id} />
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
	{/if}

	<Dialog
		open={dialog.open}
		onOpenChange={(next) => {
			if (!next) dialog.close();
		}}
		title={dialog.editingId
			? m.catalogue_edit_title({ name: dialog.editing?.name ?? draftName })
			: m.time_settings_create()}
	>
		<form
			method="POST"
			action={dialog.editingId ? '?/rename' : '?/create'}
			use:enhance={() => {
				saving = true;
				return async ({ result: submitResult, update }) => {
					await update();
					saving = false;
					if (submitResult.type === 'success') dialog.close();
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if dialog.editingId}
				<input type="hidden" name="id" value={dialog.editingId} />
			{/if}
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class="text-label text-[var(--ink)]">{m.time_settings_name()}</span>
				<input name="name" bind:value={draftName} class={input} required />
			</label>

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
</PageLayout>
