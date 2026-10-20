<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import SelectField, { type SelectOption } from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		people: SelectOption[];
		/** Assets nobody holds. */
		assets: { id: string; assetTag: string; name: string; requiresHandover: boolean }[];
		/** Preselected: the asset whose page this was opened from. */
		currentId: string;
		error?: string;
	}

	let { open, onOpenChange, people, assets, currentId, error }: Props = $props();

	let personId = $state<string | null>(null);
	let selected = $state<string[]>([]);
	let pending = $state(false);
	let done = $state<{ code: string | null; link: string | null } | null>(null);
	let copied = $state(false);

	// A fresh dialog each time it opens, with the current asset ticked.
	$effect(() => {
		if (open) {
			personId = null;
			selected = [currentId];
			done = null;
			copied = false;
		}
	});

	const issuing = $derived(assets.some((a) => selected.includes(a.id) && a.requiresHandover));

	function toggle(id: string, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((other) => other !== id);
	}

	async function copy(link: string) {
		await navigator.clipboard.writeText(link);
		copied = true;
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
			{#if done.code && done.link}
				<p class="text-sm">{m.deliver_done_code({ code: done.code })}</p>
				<label class="block space-y-[var(--space-1)] text-sm">
					<span>{m.deliver_link_label()}</span>
					<input
						readonly
						value={done.link}
						class="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-xs"
						onfocus={(event) => event.currentTarget.select()}
					/>
				</label>
				<p class="text-sm text-[var(--ink-muted)]">{m.deliver_link_once()}</p>
				<Button type="button" variant="secondary" onclick={() => copy(done!.link!)}>
					{copied ? m.deliver_copied() : m.deliver_copy()}
				</Button>
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
							link: (result.data.handoverLink as string | null) ?? null
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

			<p class="text-sm text-[var(--ink-muted)]" role="status">
				{issuing ? m.deliver_will_issue() : m.deliver_no_handover()}
			</p>

			{#if error}<FormError>{error}</FormError>{/if}

			<div class="flex justify-end gap-[var(--space-3)]">
				<Button type="button" variant="secondary" onclick={() => onOpenChange(false)}>
					{m.deliver_cancel()}
				</Button>
				<Button type="submit" disabled={pending || !personId || selected.length === 0}>
					{m.deliver_submit()}
				</Button>
			</div>
		</form>
	{/if}
</Dialog>
