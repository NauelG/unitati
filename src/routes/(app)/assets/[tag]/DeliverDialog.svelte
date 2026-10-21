<script lang="ts">
	import { untrack } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import SelectField, { type SelectOption } from '#lib/components/unitati/SelectField.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import SigningLinkPanel from '../SigningLinkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		people: SelectOption[];
		/** Assets nobody holds. */
		assets: { id: string; assetTag: string; name: string; requiresHandover: boolean }[];
		/** Preselected: the asset whose page this was opened from. */
		currentId: string;
		/** Holds `assets.handover.waive` (ADR 0035, decision 8): only then is waiving offered. */
		canWaive?: boolean;
		/** The longest waive reason the server accepts; from the server, so the two cannot drift. */
		waiveReasonMax: number;
		/** Coming from a ticket (#279): its code is preset, and its requester is preselected. */
		ticket?: { tag: string; requesterPersonId: string } | null;
		error?: string;
	}

	let {
		open,
		onOpenChange,
		people,
		assets,
		currentId,
		canWaive = false,
		waiveReasonMax,
		ticket = null,
		error
	}: Props = $props();

	// No reset effect: the page mounts this dialog afresh on every open, and an
	// effect here would re-run when a reload swaps `currentId`'s source object,
	// wiping the success view (the link is shown once).
	let personId = $state<string | null>(untrack(() => ticket?.requesterPersonId ?? null));
	let ticketTag = $state(untrack(() => ticket?.tag ?? ''));
	let selected = $state<string[]>([untrack(() => currentId)]);
	let waive = $state(false);
	let waiveReason = $state('');
	let pending = $state(false);
	let done = $state<{
		code: string | null;
		link: string | null;
		qrSvg: string | null;
		waived: boolean;
	} | null>(null);

	const issuing = $derived(assets.some((a) => selected.includes(a.id) && a.requiresHandover));
	// Waiving is only offered when there is a handover to waive; unticking the
	// asset that required one takes the option, and the choice, away.
	const waiving = $derived(canWaive && issuing && waive);
	const reasonValid = $derived(
		waiveReason.trim().length > 0 && waiveReason.trim().length <= waiveReasonMax
	);

	function toggle(id: string, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((other) => other !== id);
	}
</script>

<Dialog
	{open}
	{onOpenChange}
	{pending}
	title={done ? m.deliver_done_title() : m.deliver_title()}
	description={done ? undefined : m.deliver_description()}
>
	{#if done}
		<div class="space-y-[var(--space-4)]">
			{#if done.code && done.link && done.qrSvg}
				<p class="text-sm">{m.deliver_done_code({ code: done.code })}</p>
				<SigningLinkPanel link={done.link} qrSvg={done.qrSvg} />
			{:else if done.waived && done.code}
				<p class="text-sm">{m.deliver_done_waived({ code: done.code })}</p>
			{:else}
				<p class="text-sm">{m.deliver_done_plain()}</p>
			{/if}
			<div class="flex justify-end">
				<Button type="button" onclick={() => onOpenChange(false)}>{m.deliver_close()}</Button>
			</div>
		</div>
	{:else}
		<form
			method="POST"
			action="?/deliver"
			class="space-y-[var(--space-4)]"
			use:enhance={() => {
				pending = true;
				return async ({ result }) => {
					pending = false;
					if (result.type === 'success' && result.data?.action === 'deliver') {
						done = {
							code: (result.data.handoverCode as string | null) ?? null,
							link: (result.data.handoverLink as string | null) ?? null,
							qrSvg: (result.data.qrSvg as string | null) ?? null,
							waived: result.data.handoverWaived === true
						};
						await invalidateAll();
					} else {
						await applyAction(result);
					}
				};
			}}
		>
			<SelectField
				label={m.deliver_person()}
				name="personId"
				placeholder={m.deliver_person_placeholder()}
				options={people}
				bind:value={personId}
				required
			/>

			<Field
				label={m.handover_ticket_field()}
				name="ticketTag"
				hint={m.handover_ticket_hint()}
				bind:value={ticketTag}
				autocomplete="off"
			/>

			<fieldset class="space-y-[var(--space-2)]">
				<legend class="text-sm font-medium">{m.deliver_assets()}</legend>
				<div class="ut-scrollbar max-h-60 space-y-[var(--space-1)] overflow-y-auto">
					{#each assets as asset (asset.id)}
						<label class="flex items-center gap-[var(--space-2)] text-sm">
							<input
								type="checkbox"
								name="assetIds"
								value={asset.id}
								checked={selected.includes(asset.id)}
								onchange={(event) => toggle(asset.id, event.currentTarget.checked)}
							/>
							<span class="font-mono text-xs">{asset.assetTag}</span>
							<span>{asset.name}</span>
							{#if asset.requiresHandover}
								<span class="text-xs text-[var(--ink-muted)]">({m.deliver_requires_badge()})</span>
							{/if}
						</label>
					{/each}
				</div>
			</fieldset>

			{#if canWaive && issuing}
				<label class="flex items-center gap-[var(--space-2)] text-sm">
					<input type="checkbox" name="waive" bind:checked={waive} />
					<span>{m.deliver_waive()}</span>
				</label>
				{#if waive}
					<TextAreaField
						label={m.deliver_waive_reason()}
						name="waiveReason"
						hint={m.deliver_waive_reason_hint()}
						bind:value={waiveReason}
						maxlength={waiveReasonMax}
						required
					/>
				{/if}
			{/if}

			<p class="text-sm text-[var(--ink-muted)]" role="status">
				{waiving
					? m.deliver_will_waive()
					: issuing
						? m.deliver_will_issue()
						: m.deliver_no_handover()}
			</p>

			{#if error}<FormError>{error}</FormError>{/if}

			<div class="flex justify-end gap-[var(--space-3)]">
				<Button type="button" variant="secondary" onclick={() => onOpenChange(false)}>
					{m.deliver_cancel()}
				</Button>
				<Button
					type="submit"
					disabled={pending || !personId || selected.length === 0 || (waiving && !reasonValid)}
				>
					{m.deliver_submit()}
				</Button>
			</div>
		</form>
	{/if}
</Dialog>
