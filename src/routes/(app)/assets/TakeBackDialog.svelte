<script lang="ts">
	import { untrack } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { MAX_CONDITION_NOTES, type HandoverCondition } from '#lib/domain/handover.js';
	import { m } from '#lib/paraglide/messages.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import SigningLinkPanel from './SigningLinkPanel.svelte';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		person: { id: string; fullName: string };
		assets: { id: string; assetTag: string; name: string; requiresHandover: boolean }[];
		/** The page's named action; the same component lives on asset and person surfaces. */
		action: string;
		/** The asset page preselects the asset whose page was opened. */
		currentId?: string;
		/** Coming from a ticket (#279): its code is preset. */
		ticket?: { tag: string } | null;
		error?: string;
	}
	let {
		open,
		onOpenChange,
		person,
		assets,
		action,
		currentId,
		ticket = null,
		error
	}: Props = $props();
	let ticketTag = $state(untrack(() => ticket?.tag ?? ''));
	let selected = $state<string[]>(untrack(() => (currentId ? [currentId] : [])));
	let conditions = $state<Record<string, HandoverCondition>>({});
	let pending = $state(false);
	let done = $state<{ code: string | null; link: string | null; qrSvg: string | null } | null>(
		null
	);
	const issuing = $derived(assets.some((a) => selected.includes(a.id) && a.requiresHandover));
	const needsNotes = $derived(selected.some((id) => conditions[id] && conditions[id] !== 'good'));

	function toggle(id: string, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((other) => other !== id);
	}
</script>

<Dialog
	{open}
	{onOpenChange}
	{pending}
	title={done ? m.take_back_done_title() : m.take_back_title()}
	description={done ? undefined : m.take_back_description()}
>
	{#if done}
		<div class="space-y-[var(--space-4)]">
			{#if done.code && done.link && done.qrSvg}
				<p class="text-sm">{m.take_back_done_code({ code: done.code })}</p>
				<SigningLinkPanel link={done.link} qrSvg={done.qrSvg} />
			{:else}
				<p class="text-sm">{m.take_back_done_plain()}</p>
			{/if}
			<div class="flex justify-end">
				<Button type="button" onclick={() => onOpenChange(false)}>{m.deliver_close()}</Button>
			</div>
		</div>
	{:else}
		<form
			method="POST"
			{action}
			class="space-y-[var(--space-4)]"
			use:enhance={() => {
				pending = true;
				return async ({ result }) => {
					pending = false;
					if (result.type === 'success' && result.data?.action === 'takeBack') {
						done = {
							code: (result.data.handoverCode as string | null) ?? null,
							link: (result.data.handoverLink as string | null) ?? null,
							qrSvg: (result.data.qrSvg as string | null) ?? null
						};
						await invalidateAll();
					} else {
						await applyAction(result);
					}
				};
			}}
		>
			<input type="hidden" name="personId" value={person.id} />
			<p class="text-sm">
				<span class="font-medium">{m.take_back_person()}:</span>
				{person.fullName}
			</p>
			<Field
				label={m.handover_ticket_field()}
				name="ticketTag"
				hint={m.handover_ticket_hint()}
				bind:value={ticketTag}
				autocomplete="off"
			/>
			<fieldset class="space-y-[var(--space-2)]">
				<legend class="text-sm font-medium">{m.take_back_assets()}</legend>
				{#if assets.length === 0}
					<p class="text-sm text-[var(--ink-muted)]">{m.take_back_none_held()}</p>
				{:else}
					<div class="ut-scrollbar max-h-72 space-y-[var(--space-3)] overflow-y-auto">
						{#each assets as asset (asset.id)}
							<div
								class="space-y-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--border)] p-[var(--space-3)]"
							>
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
										<span class="text-xs text-[var(--ink-muted)]"
											>({m.deliver_requires_badge()})</span
										>
									{/if}
								</label>
								{#if selected.includes(asset.id)}
									<label class="block space-y-[var(--space-1)] text-sm">
										<span>{m.take_back_condition({ tag: asset.assetTag })}</span>
										<select
											name={`condition:${asset.id}`}
											required
											value={conditions[asset.id] ?? ''}
											onchange={(event) =>
												(conditions[asset.id] = event.currentTarget.value as HandoverCondition)}
											class="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2"
										>
											<option value="" disabled
												>{m.take_back_condition({ tag: asset.assetTag })}</option
											>
											<option value="good">{m.handover_condition_good()}</option>
											<option value="damaged">{m.handover_condition_damaged()}</option>
											<option value="incomplete">{m.handover_condition_incomplete()}</option>
										</select>
									</label>
									<label class="block space-y-[var(--space-1)] text-sm">
										<span>{m.take_back_notes({ tag: asset.assetTag })}</span>
										<textarea
											name={`notes:${asset.id}`}
											maxlength={MAX_CONDITION_NOTES}
											required={conditions[asset.id] !== undefined &&
												conditions[asset.id] !== 'good'}
											rows="2"
											class="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2"
										></textarea>
										<span class="block text-xs text-[var(--ink-muted)]">
											{conditions[asset.id] && conditions[asset.id] !== 'good'
												? m.take_back_notes_required()
												: m.take_back_notes_optional()}
										</span>
									</label>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</fieldset>
			<p class="text-sm text-[var(--ink-muted)]" role="status">
				{issuing ? m.take_back_will_issue() : m.take_back_no_handover()}
			</p>
			{#if error}<FormError>{error}</FormError>{/if}
			<div class="flex justify-end gap-[var(--space-3)]">
				<Button type="button" variant="secondary" onclick={() => onOpenChange(false)}>
					{m.deliver_cancel()}
				</Button>
				<Button
					type="submit"
					disabled={pending ||
						selected.length === 0 ||
						(needsNotes && selected.some((id) => !conditions[id]))}
				>
					{m.take_back_submit()}
				</Button>
			</div>
		</form>
	{/if}
</Dialog>
