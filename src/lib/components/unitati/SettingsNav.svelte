<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export interface SettingsNavGroup {
		label: string;
		items: { href: string; label: string }[];
	}

	/**
	 * The Settings area's secondary navigation (ADR 0015 addendum, #123): one
	 * heading per module, the module's catalogues beneath it.
	 *
	 * Below `md` it is a compact strip above the content that scrolls sideways,
	 * headings inline; from `md` it is a 224px side list. One markup for both, so
	 * there is no native `<select>` and no second component to keep in step.
	 */
	export const settingsNav = tv({
		slots: {
			root: [
				'flex gap-[var(--space-4)] overflow-x-auto pb-[var(--space-2)]',
				'md:w-56 md:shrink-0 md:flex-col md:gap-[var(--space-5)] md:overflow-visible md:pb-0'
			],
			group: 'flex shrink-0 items-center gap-[var(--space-1)] md:flex-col md:items-stretch',
			heading: [
				'px-[var(--space-2)] text-xs font-semibold tracking-[0.04em] whitespace-nowrap',
				'text-[var(--ink-muted)] md:pb-[var(--space-1)]'
			],
			item: [
				'flex min-h-10 items-center rounded-[var(--radius-md)] px-[var(--space-2)] whitespace-nowrap',
				'text-sm leading-5 font-medium text-[var(--ink)] no-underline',
				'transition-colors ut-transition-fast hover:bg-[var(--surface-2)]'
			]
		},
		variants: {
			active: { true: { item: 'bg-[var(--brand-soft)] text-[var(--brand)]' } }
		}
	});
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { isPathActive } from './app-shell-nav.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		groups: SettingsNavGroup[];
		/** Defaults to the real URL; the gallery passes one to show an active row. */
		currentPath?: string;
		class?: string;
	}

	let { groups, currentPath, class: className }: Props = $props();

	const pathname = $derived(currentPath ?? page.url.pathname);
	const styles = settingsNav();
</script>

<nav aria-label={m.settings_nav_label()} class={styles.root({ class: className })}>
	{#each groups as group (group.label)}
		<div class={styles.group()} role="group" aria-label={group.label}>
			<span class={styles.heading()} aria-hidden="true">{group.label}</span>
			{#each group.items as item (item.href)}
				{@const active = isPathActive(item.href, pathname)}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class={settingsNav({ active }).item()}
				>
					{item.label}
				</a>
			{/each}
		</div>
	{/each}
</nav>
