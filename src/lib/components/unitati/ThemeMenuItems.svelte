<script lang="ts">
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { THEME_MODES, type ThemeMode } from '#lib/theme.js';
	import { m } from '#lib/paraglide/messages.js';

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
	 * The mode the user *chose*, not the one being painted: somebody on
	 * "Sistema" at night must see "Sistema" checked, because that is the answer
	 * they gave. `userPrefersMode` is a rune-backed store, so the checkmark also
	 * follows a change made in another tab.
	 */
	const chosen = $derived(userPrefersMode.current);
</script>

<!--
	The theme switch (#90, D9), as the body of a dropdown menu. Three explicit
	choices rather than a two-state flip: with a bare toggle there is no way back
	to "follow the system" once it has been touched.

	A `RadioGroup`, not three plain items, because these are three values of one
	setting — bits-ui gives the group `role="radiogroup"` and each row
	`role="menuitemradio"` with `aria-checked`, so a screen reader announces
	which theme is active.

	Rendered inside a `DropdownMenu.Content` owned by the caller (`UserMenu`).
-->
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
