<script lang="ts" module>
	/** What the dialogs need to know about a person; the directory row and the person page both fit it. */
	export interface DialogPerson {
		id: string;
		fullName: string;
		email: string;
		departmentId: string | null;
		locationId: string | null;
		role: string | null;
	}

	/** The confirmation's subject with what they still hold (`?deactivate=`). */
	export interface Deactivating {
		id: string;
		fullName: string;
		assets: number;
		tickets: number;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Every dialog the people actions open, once: the directory table and the
	 * person page (#298) render this and call the exported openers from their own
	 * menus. The forms post to `?/<action>`, which both pages export from
	 * `person-actions.ts`.
	 */
	interface Props {
		/** The page's `form`, narrowed here by action name. */
		form: unknown;
		departments: { value: string; label: string }[];
		locations: { value: string; label: string }[];
		/** Who is awaiting a deactivation confirmation, from the URL; null when none. */
		deactivating?: Deactivating | null;
		/** The page clears `?deactivate=` (and may stay or move on). */
		onDeactivateClose: () => void;
		openCreate?: boolean;
	}

	let {
		form: rawForm,
		departments,
		locations,
		deactivating = null,
		onDeactivateClose,
		openCreate: startCreating = false
	}: Props = $props();

	type Outcome = { action: string; message?: string | null; id?: string | null };
	const form = $derived(rawForm as Outcome | null | undefined);

	/** The person being edited, or `'new'` for the create dialog; one dialog serves both. */
	let editing = $state<DialogPerson | 'new' | null>(startCreating ? 'new' : null);
	let draftName = $state('');
	let draftEmail = $state('');
	let draftDepartmentId = $state<string | null>(null);
	let draftLocationId = $state<string | null>(null);
	let saving = $state(false);

	const roleOptions = [
		{ value: 'employee', label: m.role_employee() },
		{ value: 'technician', label: m.role_technician() },
		{ value: 'admin', label: m.role_admin() }
	];

	/** Access flows: the dialog being filled in, and the one-time result. */
	let granting = $state<{ person: DialogPerson; mode: 'grant' | 'role' } | null>(null);
	let draftRole = $state('employee');
	let accessPending = $state(false);
	let revoking = $state<DialogPerson | null>(null);
	let revokePending = $state(false);
	let revealed = $state<{ name: string; password: string } | null>(null);
	let copied = $state(false);

	/** A reset has no question to ask: it posts straight and shows the result. */
	let resetForm: HTMLFormElement | undefined = $state();
	let resetId = $state('');
	let resetName = '';

	/** Reactivating asks nothing either: one hidden form, filled with whoever was picked. */
	let reactivateForm: HTMLFormElement | undefined = $state();
	let reactivateId = $state('');

	let deactivatePending = $state(false);

	export function create() {
		draftName = '';
		draftEmail = '';
		draftDepartmentId = null;
		draftLocationId = null;
		editing = 'new';
	}

	export function edit(target: DialogPerson) {
		draftName = target.fullName;
		draftEmail = target.email;
		draftDepartmentId = target.departmentId;
		draftLocationId = target.locationId;
		editing = target;
	}

	export function access(target: DialogPerson, mode: 'grant' | 'role') {
		draftRole = mode === 'role' && target.role ? target.role : 'employee';
		granting = { person: target, mode };
	}

	export function revoke(target: DialogPerson) {
		revoking = target;
	}

	export async function reset(target: DialogPerson) {
		resetId = target.id;
		resetName = target.fullName;
		await tick();
		resetForm?.requestSubmit();
	}

	export async function reactivate(target: DialogPerson) {
		reactivateId = target.id;
		await tick();
		reactivateForm?.requestSubmit();
	}

	function reveal(name: string, password: string) {
		copied = false;
		revealed = { name, password };
	}

	async function copyPassword() {
		if (!revealed) return;
		await navigator.clipboard.writeText(revealed.password);
		copied = true;
	}

	const person = $derived(editing && editing !== 'new' ? editing : null);

	function close() {
		editing = null;
	}

	const failure = $derived(
		form?.message
			? form.action === 'createPerson' && editing === 'new'
				? form.message
				: form.action === 'updatePerson' && person && form.id === person.id
					? form.message
					: null
			: null
	);

	/** The dialog's refusal that belongs under the email field. */
	const emailFailure = $derived(
		failure === m.directory_error_duplicate_email() ? failure : undefined
	);
	const dialogFailure = $derived(emailFailure ? null : failure);

	function holdings(counts: Deactivating): string {
		const parts = [
			counts.assets > 0
				? counts.assets === 1
					? m.directory_holds_assets_one()
					: m.directory_holds_assets_other({ count: counts.assets })
				: null,
			counts.tickets > 0
				? counts.tickets === 1
					? m.directory_holds_tickets_one()
					: m.directory_holds_tickets_other({ count: counts.tickets })
				: null
		].filter((part) => part !== null);
		if (parts.length === 0) return m.directory_deactivate_ask();
		const held =
			parts.length === 2
				? m.directory_holds_both({ assets: parts[0], tickets: parts[1] })
				: parts[0];
		return `${m.directory_holds_summary({ holds: held })} ${m.directory_deactivate_ask()}`;
	}
</script>

{#if form?.message && ['reactivatePerson', 'deactivatePerson', 'resetPassword', 'revokeAccess'].includes(form.action) && !deactivating}
	<FormError class="mt-[var(--space-4)]">{form.message}</FormError>
{/if}

<form
	bind:this={reactivateForm}
	method="POST"
	action="?/reactivatePerson"
	use:enhance
	class="hidden"
>
	<input type="hidden" name="id" value={reactivateId} />
</form>

<Dialog
	open={editing !== null}
	onOpenChange={(next) => {
		if (!next) close();
	}}
	title={person ? m.directory_edit_title({ name: person.fullName }) : m.directory_new_title()}
	pending={saving}
>
	{#if editing}
		<form
			method="POST"
			action={person ? '?/updatePerson' : '?/createPerson'}
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') close();
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if person}
				<input type="hidden" name="id" value={person.id} />
			{/if}
			<Field
				label={m.directory_field_name()}
				name="fullName"
				bind:value={draftName}
				maxlength={120}
				required
			/>
			<Field
				label={m.directory_field_email()}
				name="email"
				type="email"
				bind:value={draftEmail}
				error={emailFailure}
				required
			/>
			<SelectField
				label={m.directory_field_department()}
				name="departmentId"
				options={departments}
				bind:value={draftDepartmentId}
				placeholder={m.directory_no_department()}
			/>
			<SearchSelectField
				label={m.directory_location_field()}
				name="locationId"
				options={locations}
				bind:value={draftLocationId}
				placeholder={m.directory_location_none()}
				noneText={m.directory_location_none()}
				clearable
			/>

			{#if dialogFailure}
				<FormError>{dialogFailure}</FormError>
			{/if}

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={close}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={saving}>{m.catalogue_save()}</Button>
			</div>
		</form>
	{/if}
</Dialog>

<form
	bind:this={resetForm}
	method="POST"
	action="?/resetPassword"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.temporaryPassword === 'string') {
				reveal(resetName, result.data.temporaryPassword);
			}
			await update({ reset: false });
		};
	}}
	class="hidden"
>
	<input type="hidden" name="id" value={resetId} />
</form>

<Dialog
	open={granting !== null}
	onOpenChange={(next) => {
		if (!next) granting = null;
	}}
	title={granting
		? granting.mode === 'grant'
			? m.directory_grant_title({ name: granting.person.fullName })
			: m.directory_change_role_title({ name: granting.person.fullName })
		: ''}
	pending={accessPending}
>
	{#if granting}
		{@const target = granting}
		<form
			method="POST"
			action={target.mode === 'grant' ? '?/grantAccess' : '?/changeRole'}
			use:enhance={() => {
				accessPending = true;
				// `target` is a lazy `{@const}`: once `granting` is cleared it reads null.
				const { fullName } = target.person;
				return async ({ result, update }) => {
					accessPending = false;
					if (result.type === 'success') {
						granting = null;
						if (typeof result.data?.temporaryPassword === 'string') {
							reveal(fullName, result.data.temporaryPassword);
						}
					}
					await update({ reset: false });
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			<input type="hidden" name="id" value={target.person.id} />
			{#if target.mode === 'grant'}
				<p class="text-sm text-[var(--ink-muted)]">{m.directory_grant_lede()}</p>
			{/if}
			<SelectField
				label={m.directory_field_role()}
				name="role"
				options={roleOptions}
				bind:value={draftRole}
				required
			/>

			{#if form?.message && ['grantAccess', 'changeRole'].includes(form.action) && form.id === target.person.id}
				<FormError>{form.message}</FormError>
			{/if}

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={() => (granting = null)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={accessPending}>
					{target.mode === 'grant' ? m.directory_grant_access() : m.catalogue_save()}
				</Button>
			</div>
		</form>
	{/if}
</Dialog>

<!-- Shown once: closing it drops the password from memory, and nothing stores it. -->
<Dialog
	open={revealed !== null}
	onOpenChange={(next) => {
		if (!next) revealed = null;
	}}
	title={revealed ? m.directory_temporary_password_title({ name: revealed.name }) : ''}
>
	{#if revealed}
		<div class="space-y-[var(--space-4)]">
			<p class="text-sm text-[var(--ink-muted)]">{m.directory_temporary_password_lede()}</p>
			<div class="flex items-center gap-[var(--space-2)]">
				<code
					aria-label={m.directory_temporary_password_label()}
					class="flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-[var(--space-3)] py-[var(--space-2)] font-mono text-base tracking-wide select-all"
				>
					{revealed.password}
				</code>
				<Button type="button" variant="ghost" size="sm" onclick={copyPassword}>
					{copied ? m.directory_copied() : m.directory_copy()}
				</Button>
			</div>
			<p class="text-sm font-medium text-[var(--danger)]" role="note">
				{m.directory_temporary_password_warning()}
			</p>
			<div class="flex justify-end">
				<Button type="button" size="sm" onclick={() => (revealed = null)}>
					{m.directory_done()}
				</Button>
			</div>
		</div>
	{/if}
</Dialog>

<ConfirmDialog
	open={revoking !== null}
	onOpenChange={(next) => {
		if (!next) revoking = null;
	}}
	title={m.directory_revoke_title({ name: revoking?.fullName ?? '' })}
	description={m.directory_revoke_ask()}
	confirmLabel={m.directory_revoke_access()}
	pending={revokePending}
	error={revoking && form?.action === 'revokeAccess' && form.id === revoking.id
		? form.message
		: null}
>
	{#snippet action(confirm)}
		<form
			method="POST"
			action="?/revokeAccess"
			use:enhance={confirmSubmit({
				onPending: (value) => (revokePending = value),
				onSettled: (succeeded) => {
					if (succeeded) revoking = null;
				}
			})}
		>
			<input type="hidden" name="id" value={revoking?.id ?? ''} />
			{@render confirm()}
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	open={deactivating !== null}
	onOpenChange={(next) => {
		if (!next) onDeactivateClose();
	}}
	title={m.directory_deactivate_title({ name: deactivating?.fullName ?? '' })}
	description={deactivating ? holdings(deactivating) : ''}
	confirmLabel={m.directory_deactivate()}
	pending={deactivatePending}
	error={deactivating && form?.action === 'deactivatePerson' && form.id === deactivating.id
		? form.message
		: null}
>
	{#snippet action(confirm)}
		<form
			method="POST"
			action="?/deactivatePerson"
			use:enhance={confirmSubmit({
				onPending: (value) => (deactivatePending = value),
				onSettled: (succeeded) => {
					if (succeeded) onDeactivateClose();
				}
			})}
		>
			<input type="hidden" name="id" value={deactivating?.id ?? ''} />
			{@render confirm()}
		</form>
	{/snippet}
</ConfirmDialog>
