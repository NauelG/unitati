<script lang="ts">
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { THEME_MODES, type ThemeMode } from '#lib/theme.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	/**
	 * One row per mode, built from `THEME_MODES` so the menu cannot drift from
	 * the vocabulary the rest of the app reads. Labels are message *functions*,
	 * called in the template — resolving them here would freeze the locale at
	 * module scope, the same trap `components/unitati/status.ts` documents.
	 */
	const OPTIONS = {
		light: { icon: SunIcon, label: m.theme_light },
		dark: { icon: MoonIcon, label: m.theme_dark },
		system: { icon: MonitorIcon, label: m.theme_system }
	} as const satisfies Record<ThemeMode, { icon: unknown; label: () => string }>;

	/**
	 * The trigger shows the mode the user *chose*, not the one being painted:
	 * somebody on "Sistema" at night should see the monitor icon, because that
	 * is the answer they gave. Showing the moon there would misreport their
	 * setting as "Oscuro" and leave no way to tell the two apart.
	 */
	const chosen = $derived(userPrefersMode.current);
	const TriggerIcon = $derived(OPTIONS[chosen].icon);
</script>

<!--
	The theme switch (#90, D9). Three explicit choices rather than a two-state
	flip: with a bare toggle there is no way back to "follow the system" once it
	has been touched, and following the system is the default the decision asks
	for.

	A `RadioGroup`, not three plain items, because these are three values of one
	setting — bits-ui gives the group `role="radiogroup"` and each row
	`role="menuitemradio"` with `aria-checked`, so a screen reader announces
	which theme is active instead of reading three equal-sounding commands.

	`userPrefersMode` is read directly rather than mirrored into local state:
	it is already a rune-backed store, so the checkmark follows a change made
	anywhere — including another tab, which mode-watcher syncs through
	`localStorage`.
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="ut-transition-fast grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] {className ??
			''}"
		aria-label="{m.theme_label()}: {OPTIONS[chosen].label()}"
		title={m.theme_label()}
	>
		<TriggerIcon class="size-[var(--size-icon-sm)]" aria-hidden="true" />
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="min-w-44">
		<DropdownMenu.Label>{m.theme_label()}</DropdownMenu.Label>
		<DropdownMenu.RadioGroup value={chosen} onValueChange={(value) => setMode(value as ThemeMode)}>
			{#each THEME_MODES as option (option)}
				{@const Icon = OPTIONS[option].icon}
				<DropdownMenu.RadioItem value={option} closeOnSelect>
					<Icon class="size-[var(--size-icon-sm)] text-[var(--ink-muted)]" aria-hidden="true" />
					{OPTIONS[option].label()}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
