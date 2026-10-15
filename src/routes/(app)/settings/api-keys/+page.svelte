<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { SCOPE_GROUPS, scopeLabel } from '#lib/settings/api-scopes.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dates = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }));
	const input = field().input();

	/** Only the groups that still have something the creator's role holds. */
	const groups = $derived(
		SCOPE_GROUPS.map((group) => ({
			label: group.label(),
			permissions: group.permissions.filter((permission) => data.grantable.includes(permission))
		})).filter((group) => group.permissions.length > 0)
	);

	const expiryOptions = $derived([
		...data.expiryDays.map((days) => ({
			value: String(days),
			label: m.api_keys_expiry_days({ days })
		})),
		...(data.canManageAll ? [{ value: 'never', label: m.api_keys_expiry_never() }] : [])
	]);

	/* ---- Create ------------------------------------------------------------ */

	let creating = $state(false);
	let saving = $state(false);
	let draftName = $state('');
	let draftExpiry = $state<string | null>(null);
	let chosen = $state<string[]>([]);

	function openCreate() {
		draftName = '';
		draftExpiry = String(data.defaultExpiryDays);
		chosen = [];
		creating = true;
	}

	/** This dialog's own refusal, not a stale one from the revoke action. */
	const createFailure = $derived(
		creating && form?.action === 'create' && 'field' in form ? form : null
	);

	/**
	 * The plaintext lives here and nowhere else. It is read off the one response
	 * that carries it, and never reaches `form`, so it cannot outlive the dialog
	 * that shows it.
	 */
	let createdKey = $state<string | null>(null);
	let copied = $state(false);

	async function copy() {
		if (createdKey === null) return;
		await navigator.clipboard.writeText(createdKey);
		copied = true;
	}

	function closeCreated() {
		createdKey = null;
		copied = false;
	}

	/* ---- Revoke ------------------------------------------------------------ */

	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);
	const revokeFailure = $derived(form?.action === 'revoke' ? form.message : null);

	const cell = 'px-[var(--space-3)] py-[var(--space-2)] align-middle';
	const head =
		'px-[var(--space-3)] h-8 text-left align-middle text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)] bg-[var(--surface-2)]';
</script>

<svelte:head>
	<title>{m.api_keys_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.api_keys_title()}>
		{#snippet summary()}{m.api_keys_lede()}{/snippet}
		{#snippet actions()}
			<Button variant="ghost" href="/settings/api-keys/docs">{m.api_keys_docs_link()}</Button>
			<Button onclick={openCreate}>{m.api_keys_create()}</Button>
		{/snippet}
	</PageHeader>

	{#if revokeFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{revokeFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.keys.length === 0}
			<EmptyState description={m.api_keys_empty()} />
		{:else}
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr>
						<th scope="col" class={head}>{m.api_keys_name()}</th>
						<th scope="col" class={head}>{m.api_keys_key()}</th>
						{#if data.canManageAll}
							<th scope="col" class={head}>{m.api_keys_owner()}</th>
						{/if}
						<th scope="col" class={head}>{m.api_keys_scopes()}</th>
						<th scope="col" class={head}>{m.api_keys_created()}</th>
						<th scope="col" class={head}>{m.api_keys_last_used()}</th>
						<th scope="col" class={head}>{m.api_keys_expires()}</th>
						<th scope="col" class="{head} text-right">{m.api_keys_actions()}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--border)]">
					{#each data.keys as key (key.id)}
						{@const listed = key.scopes.map(scopeLabel).join(', ')}
						<tr>
							<th scope="row" class="{cell} text-left font-medium text-[var(--ink)]">
								{key.name}
							</th>
							<td class="{cell} font-mono text-[var(--ink-muted)]">unt_{key.start}…</td>
							{#if data.canManageAll}
								<td class={cell}>{key.ownerName}</td>
							{/if}
							<td class={cell}>
								<!-- The tooltip is for the pointer; the list is also in the text, for everyone else. -->
								<span title={listed} class="cursor-help underline decoration-dotted">
									{key.scopes.length === 1
										? m.api_keys_scopes_count_one()
										: m.api_keys_scopes_count_other({ count: key.scopes.length })}
									<span class="sr-only">: {listed}</span>
								</span>
							</td>
							<td class="{cell} text-[var(--ink-muted)]">{dates.format(key.createdAt)}</td>
							<td class="{cell} text-[var(--ink-muted)]">
								{key.lastUsedAt ? dates.format(key.lastUsedAt) : m.api_keys_last_used_never()}
							</td>
							<td class="{cell} text-[var(--ink-muted)]">
								{key.expiresAt ? dates.format(key.expiresAt) : m.api_keys_expires_never()}
							</td>
							<td class={cell}>
								<div class="flex items-center justify-end">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={() => (confirmingId = key.id)}
									>
										{m.api_keys_revoke()}
									</Button>
								</div>

								<ConfirmDialog
									open={confirmingId === key.id}
									onOpenChange={(next) => {
										if (!next) confirmingId = null;
									}}
									title={m.api_keys_revoke_title({ name: key.name })}
									description={m.api_keys_revoke_ask()}
									confirmLabel={m.api_keys_revoke()}
									pending={pendingId === key.id}
								>
									{#snippet action(confirm)}
										<form
											method="POST"
											action="?/revoke"
											use:enhance={confirmSubmit({
												onPending: (pending) => (pendingId = pending ? key.id : null),
												onSettled: () => (confirmingId = null)
											})}
										>
											<input type="hidden" name="id" value={key.id} />
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

	<Dialog
		open={creating}
		onOpenChange={(next) => {
			if (!next) creating = false;
		}}
		title={m.api_keys_create_title()}
		pending={saving}
	>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') {
						const key = (result.data as { key?: unknown } | undefined)?.key;
						if (typeof key === 'string') createdKey = key;
						creating = false;
						await invalidateAll();
						return;
					}
					await update({ reset: false });
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">{m.api_keys_name()}</span>
				<input
					name="name"
					bind:value={draftName}
					class={input}
					maxlength="80"
					required
					aria-invalid={createFailure?.field === 'name' || undefined}
				/>
				{#if createFailure?.field === 'name'}
					<span class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">
						{createFailure.message}
					</span>
				{/if}
			</label>

			<SelectField
				label={m.api_keys_expiry()}
				name="expiresInDays"
				options={expiryOptions}
				bind:value={draftExpiry}
				error={createFailure?.field === 'expiresInDays' ? createFailure.message : undefined}
				required
			/>

			<fieldset class="space-y-[var(--space-3)]">
				<legend class="text-[13px] leading-4 font-medium text-[var(--ink)]">
					{m.api_keys_scopes_legend()}
				</legend>
				<p class="text-[13px] leading-[18px] text-[var(--ink-muted)]">{m.api_keys_scopes_hint()}</p>
				{#each groups as group (group.label)}
					<div class="space-y-[var(--space-1)]">
						<p class="text-xs font-semibold tracking-[0.04em] text-[var(--ink-muted)]">
							{group.label}
						</p>
						{#each group.permissions as permission (permission)}
							<label class="flex items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
								<input
									type="checkbox"
									name="scopes"
									value={permission}
									bind:group={chosen}
									class="size-4 accent-[var(--action)]"
								/>
								{scopeLabel(permission)}
								<span class="font-mono text-xs text-[var(--ink-muted)]">{permission}</span>
							</label>
						{/each}
					</div>
				{/each}
				{#if createFailure?.field === 'scopes'}
					<p class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">
						{createFailure.message}
					</p>
				{/if}
			</fieldset>

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={() => (creating = false)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={saving} disabled={chosen.length === 0}>
					{m.api_keys_submit()}
				</Button>
			</div>
		</form>
	</Dialog>

	<Dialog
		open={createdKey !== null}
		onOpenChange={(next) => {
			if (!next) closeCreated();
		}}
		title={m.api_keys_created_title()}
	>
		<div class="space-y-[var(--space-4)]">
			<Alert tone="warning">{m.api_keys_created_warning()}</Alert>
			<div class="flex items-center gap-[var(--space-2)]">
				<input
					readonly
					value={createdKey ?? ''}
					aria-label={m.api_keys_key_label()}
					class="{input} font-mono"
					onfocus={(event) => event.currentTarget.select()}
				/>
				<Button type="button" variant="secondary" size="sm" onclick={copy}>
					{copied ? m.api_keys_copied() : m.api_keys_copy()}
				</Button>
			</div>
			<div class="flex justify-end">
				<Button type="button" size="sm" onclick={closeCreated}>{m.api_keys_done()}</Button>
			</div>
		</div>
	</Dialog>
</PageLayout>
