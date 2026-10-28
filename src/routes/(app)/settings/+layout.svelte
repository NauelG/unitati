<script lang="ts">
	import SettingsNav from '#lib/components/unitati/SettingsNav.svelte';
	import { groupByModule, MODULE_LABELS, visibleSections } from '#lib/settings/sections.js';
	import type { LayoutProps } from './$types';

	// `data.permissions` comes from the `(app)` layout; the server layout beside
	// this one has already refused a viewer with no visible section.
	let { data, children }: LayoutProps = $props();

	const groups = $derived(
		groupByModule(visibleSections(data.permissions, undefined, data.features)).map((group) => ({
			label: MODULE_LABELS[group.module](),
			items: group.sections.map((section) => ({ href: section.href, label: section.label() }))
		}))
	);
</script>

<div
	class="mx-auto flex w-full max-w-[var(--size-page-max)] flex-col gap-[var(--space-6)] md:flex-row"
>
	<SettingsNav {groups} />
	<div class="min-w-0 flex-1">{@render children()}</div>
</div>
