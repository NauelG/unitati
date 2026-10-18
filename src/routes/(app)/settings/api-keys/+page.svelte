<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle, productName } from '#lib/brand.svelte.js';
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
	import { badge } from '#lib/components/unitati/StatusBadge.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { SCOPE_GROUPS, scopeLabel } from '#lib/settings/api-scopes.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dates = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }));
	const input = field().input();

	/**
	 * Set while the dialog creates a key for a service account: the same dialog,
	 * posting to another action and offering the *account's* scopes.
	 */
	let creatingFor = $state<{ id: string; name: string; grantable: string[] } | null>(null);
	const grantable = $derived(creatingFor?.grantable ?? data.grantable);

	/** Only the groups that still have something the key's role holds. */
	const groups = $derived(
		SCOPE_GROUPS.map((group) => ({
			label: group.label(),
			permissions: group.permissions.filter((permission) => grantable.includes(permission))
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

	function openCreate(account: typeof creatingFor = null) {
		creatingFor = account;
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

	/* ---- Service accounts --------------------------------------------------- */

	const roleLabel = (role: string) =>
		role === 'technician'
			? m.service_accounts_role_technician()
			: m.service_accounts_role_employee();

	let creatingAccount = $state(false);
	let savingAccount = $state(false);
	let draftAccountName = $state('');
	let draftAccountRole = $state<string | null>('technician');

	function openAccount() {
		draftAccountName = '';
		draftAccountRole = 'technician';
		creatingAccount = true;
	}

	const accountFailure = $derived(
		creatingAccount && form?.action === 'createAccount' && 'field' in form ? form : null
	);

	let togglingId: string | null = $state(null);
	let pendingToggleId: string | null = $state(null);
	const accountToggleFailure = $derived(
		form?.action === 'setAccountDisabled' ? form.message : null
	);

	const cell = 'px-[var(--space-3)] py-[var(--space-2)] align-middle';
	const head =
		'px-[var(--space-3)] h-8 text-left align-middle text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)] bg-[var(--surface-2)]';
</script>

<svelte:head>
	<title>{documentTitle(m.api_keys_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.api_keys_title()}>
		{#snippet summary()}{m.api_keys_lede({ name: productName() })}{/snippet}
		{#snippet actions()}
			<Button variant="ghost" href="/settings/api-keys/docs">{m.api_keys_docs_link()}</Button>
			<Button onclick={() => openCreate()}>{m.api_keys_create()}</Button>
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
								<td class={cell}>
									{key.ownerName}
									{#if key.isServiceAccount}
										<span class={badge({ tone: 'neutral', plain: true })}>
											{m.service_accounts_tag()}
										</span>
									{/if}
								</td>
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
		title={creatingFor
			? m.service_accounts_new_key_title({ name: creatingFor.name })
			: m.api_keys_create_title()}
		pending={saving}
	>
		<form
			method="POST"
			action={creatingFor ? '?/createAccountKey' : '?/create'}
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
			{#if creatingFor}
				<input type="hidden" name="serviceAccountId" value={creatingFor.id} />
			{/if}
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class="text-label text-[var(--ink)]">{m.api_keys_name()}</span>
				<input
					name="name"
					bind:value={draftName}
					class={input}
					maxlength="80"
					required
					aria-invalid={createFailure?.field === 'name' || undefined}
				/>
			</label>
			{#if createFailure?.field === 'name'}
				<FormError>{createFailure.message}</FormError>
			{/if}

			<SelectField
				label={m.api_keys_expiry()}
				name="expiresInDays"
				options={expiryOptions}
				bind:value={draftExpiry}
				error={createFailure?.field === 'expiresInDays' ? createFailure.message : undefined}
				required
			/>

			<fieldset class="space-y-[var(--space-3)]">
				<legend class="text-label text-[var(--ink)]">
					{m.api_keys_scopes_legend()}
				</legend>
				<p class="text-small text-[var(--ink-muted)]">
					{creatingFor ? m.service_accounts_scopes_hint() : m.api_keys_scopes_hint()}
				</p>
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
					<FormError>{createFailure.message}</FormError>
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

	{#if data.canManageAll}
		<section class="mt-[var(--space-8)]" aria-labelledby="service-accounts-title">
			<div class="flex flex-wrap items-start justify-between gap-[var(--space-4)]">
				<div class="min-w-0 space-y-[var(--space-1)]">
					<h2 id="service-accounts-title" class="text-lg leading-6 font-semibold text-[var(--ink)]">
						{m.service_accounts_title()}
					</h2>
					<p class="max-w-prose text-sm text-[var(--ink-muted)]">{m.service_accounts_lede()}</p>
				</div>
				<Button onclick={openAccount}>{m.service_accounts_create()}</Button>
			</div>

			{#if accountToggleFailure}
				<Alert tone="danger" class="mt-[var(--space-6)]">{accountToggleFailure}</Alert>
			{/if}

			<div
				class="mt-[var(--space-6)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
			>
				{#if data.serviceAccounts.length === 0}
					<EmptyState description={m.service_accounts_empty()} />
				{:else}
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr>
								<th scope="col" class={head}>{m.api_keys_name()}</th>
								<th scope="col" class={head}>{m.service_accounts_role()}</th>
								<th scope="col" class={head}>{m.service_accounts_keys()}</th>
								<th scope="col" class={head}>{m.service_accounts_created_by()}</th>
								<th scope="col" class={head}>{m.service_accounts_status()}</th>
								<th scope="col" class="{head} text-right">{m.api_keys_actions()}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-[var(--border)]">
							{#each data.serviceAccounts as account (account.id)}
								<tr>
									<th scope="row" class="{cell} text-left font-medium text-[var(--ink)]">
										{account.name}
									</th>
									<td class={cell}>{roleLabel(account.role)}</td>
									<td class={cell}>{account.activeKeys}</td>
									<td class="{cell} text-[var(--ink-muted)]">{account.createdByName ?? '—'}</td>
									<td class={cell}>
										<span class={badge({ tone: account.disabled ? 'neutral' : 'success' })}>
											{account.disabled
												? m.service_accounts_status_disabled()
												: m.service_accounts_status_active()}
										</span>
									</td>
									<td class={cell}>
										<div class="flex items-center justify-end gap-[var(--space-2)]">
											{#if !account.disabled}
												<Button
													type="button"
													variant="secondary"
													size="sm"
													onclick={() => openCreate(account)}
												>
													{m.service_accounts_new_key()}
												</Button>
											{/if}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onclick={() => (togglingId = account.id)}
											>
												{account.disabled
													? m.service_accounts_enable()
													: m.service_accounts_disable()}
											</Button>
										</div>

										<ConfirmDialog
											open={togglingId === account.id}
											onOpenChange={(next) => {
												if (!next) togglingId = null;
											}}
											title={account.disabled
												? m.service_accounts_enable_title({ name: account.name })
												: m.service_accounts_disable_title({ name: account.name })}
											description={account.disabled
												? m.service_accounts_enable_ask()
												: m.service_accounts_disable_ask()}
											confirmLabel={account.disabled
												? m.service_accounts_enable()
												: m.service_accounts_disable()}
											pending={pendingToggleId === account.id}
										>
											{#snippet action(confirm)}
												<form
													method="POST"
													action="?/setAccountDisabled"
													use:enhance={confirmSubmit({
														onPending: (pending) => (pendingToggleId = pending ? account.id : null),
														onSettled: () => (togglingId = null)
													})}
												>
													<input type="hidden" name="id" value={account.id} />
													<input type="hidden" name="disabled" value={String(!account.disabled)} />
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
		</section>

		<Dialog
			open={creatingAccount}
			onOpenChange={(next) => {
				if (!next) creatingAccount = false;
			}}
			title={m.service_accounts_create_title()}
			pending={savingAccount}
		>
			<form
				method="POST"
				action="?/createAccount"
				use:enhance={() => {
					savingAccount = true;
					return async ({ result, update }) => {
						savingAccount = false;
						if (result.type === 'success') creatingAccount = false;
						await update({ reset: false });
					};
				}}
				class="space-y-[var(--space-4)]"
			>
				<label class="flex flex-col gap-[var(--space-1)]">
					<span class="text-label text-[var(--ink)]">
						{m.api_keys_name()}
					</span>
					<input
						name="name"
						bind:value={draftAccountName}
						class={input}
						maxlength="80"
						required
						aria-invalid={accountFailure?.field === 'name' || undefined}
					/>
				</label>
				{#if accountFailure?.field === 'name'}
					<FormError>{accountFailure.message}</FormError>
				{/if}

				<SelectField
					label={m.service_accounts_role()}
					name="role"
					options={data.serviceAccountRoles.map((role) => ({
						value: role,
						label: roleLabel(role)
					}))}
					bind:value={draftAccountRole}
					error={accountFailure?.field === 'role' ? accountFailure.message : undefined}
					required
				/>

				<div class="flex justify-end gap-[var(--space-2)]">
					<Button type="button" variant="ghost" size="sm" onclick={() => (creatingAccount = false)}>
						{m.form_cancel()}
					</Button>
					<Button type="submit" size="sm" busy={savingAccount}>
						{m.service_accounts_submit()}
					</Button>
				</div>
			</form>
		</Dialog>
	{/if}

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
