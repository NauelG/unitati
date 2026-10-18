<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { formatKeys, isMacPlatform, keymapRegistry, type KeymapEntry } from '#lib/keymap.js';
	import { m } from '#lib/paraglide/messages.js';
	import { dialog } from './Dialog.svelte';
	import CloseButton from './CloseButton.svelte';

	/**
	 * The `?` overlay (#88): rendered **from the keymap module**, never
	 * hand-maintained — every entry any page has registered with
	 * `keymapRegistry` at the moment this opens shows up here, grouped by
	 * `entry.group`. Adding a shortcut means adding its entry; this component
	 * has no list of its own to keep in sync.
	 */

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const mac = isMacPlatform();
	const entries = keymapRegistry.list;

	const grouped = $derived.by(() => {
		const byGroup: Record<string, KeymapEntry[]> = {};
		for (const entry of $entries) {
			(byGroup[entry.group] ??= []).push(entry);
		}
		return Object.entries(byGroup);
	});

	const styles = dialog();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class={styles.content({ class: 'max-w-[480px]' })} showCloseButton={false}>
		<Dialog.Header>
			<Dialog.Title class={styles.title()}>{m.keymap_overlay_title()}</Dialog.Title>
			<Dialog.Description class={styles.description()}>
				{m.keymap_overlay_description()}
			</Dialog.Description>
		</Dialog.Header>

		<div class="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]">
			{#each grouped as [group, items] (group)}
				<div>
					<p
						class="mb-[var(--space-2)] text-xs font-semibold tracking-[0.04em] text-[var(--ink-muted)] uppercase"
					>
						{group}
					</p>
					<ul class="flex flex-col gap-[var(--space-1)]">
						{#each items as entry (entry.id)}
							<li class="flex items-center justify-between gap-[var(--space-3)] text-sm">
								<span class="text-[var(--ink)]">{entry.label}</span>
								<span class="ut-kbd">{formatKeys(entry.keys, mac)}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<CloseButton kind="dialog" class="absolute top-2 right-2" />
	</Dialog.Content>
</Dialog.Root>
