<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-shell` family: sidebar, nav rows, section headings and the
	 * top bar around every `(app)` page. See `docs/adr/0015-appshell-and-responsive-navigation.md`.
	 *
	 * Row height is `--size-row-compact` (32px), not `--size-row` (40px, the
	 * **table** row token) — the issue's own drift report (#83) is exactly this
	 * mix-up, and the fix is to read the token that already means "compact",
	 * not invent a new one.
	 */
	export const appShell = tv({
		slots: {
			sidebar: 'ut-sidebar flex shrink-0 flex-col gap-0.5 bg-[var(--surface-2)] p-[var(--space-3)]',
			brandbar: 'mb-[var(--space-2)] flex h-10 items-center px-[var(--space-2)]',
			navSection:
				'ut-nav-label px-[var(--space-2)] pt-[var(--space-3)] pb-[var(--space-1)] text-xs font-semibold tracking-[0.04em] text-[var(--ink-muted)]',
			navItem: [
				'flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)]',
				'text-[13px] leading-4 font-medium text-[var(--ink)] no-underline transition-colors',
				'hover:bg-[var(--surface-1)]'
			],
			navIcon: 'size-[var(--size-icon-sm)] shrink-0',
			navDot: 'size-2 shrink-0 rounded-[var(--radius-full)]',
			navLabel: 'ut-nav-label truncate',
			navCount: 'ut-nav-label ml-auto font-mono text-[11px] text-[var(--ink-muted)]',
			kbd: [
				'ut-nav-label ml-auto rounded-[var(--radius-sm)] border border-[var(--border)]',
				'px-[6px] font-mono text-[11px] text-[var(--ink-muted)]'
			],
			sidebarFooter: 'mt-auto flex flex-col gap-0.5 pt-[var(--space-2)]',
			topbar:
				'flex h-14 shrink-0 items-center gap-[var(--space-3)] border-b border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-6)]',
			main: 'flex-1 p-[var(--space-6)]'
		},
		variants: {
			active: {
				true: { navItem: 'bg-[var(--brand-soft)] text-[var(--brand)]' }
			},
			rail: {
				true: { sidebar: 'items-center', navItem: 'justify-center px-0' }
			}
		}
	});

	export interface AppShellNavLink {
		href: string;
		label: string;
		icon: LucideIcon;
		/**
		 * Which `.ut-nav-section` heading this row falls under. Rows with no
		 * section (Overview, the dev gallery link) render on their own, outside
		 * either heading — `AppShell` inserts "MODULES" / "DIRECTORY" the first
		 * time it sees a row ask for it, so the layout never builds the heading
		 * itself.
		 */
		section?: 'modules' | 'directory';
		/** The domain dot (`--asset` / `--desk` / `--project`); absent outside `modules`. */
		accent?: string;
		/** Absent — not zero — when the viewer holds no permission to count it. */
		count?: number;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Logo from './Logo.svelte';
	import AppVersion from '../AppVersion.svelte';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		links: AppShellNavLink[];
		/** Hidden in production, same gate as the dev gallery link (ADR 0013). */
		showSearch?: boolean;
		/** Reserved for a future settings screen (#83 scope: no route exists yet). */
		settings?: Snippet;
		/** The topbar's right-hand side: environment badge, user, sign-out — all route-specific. */
		topbarEnd?: Snippet;
		children: Snippet;
	}

	let { links, showSearch = false, settings, topbarEnd, children }: Props = $props();

	const SIDEBAR_STORAGE_KEY = 'unitati:sidebar';

	/**
	 * Visual-only: the width and the nav labels are driven by the
	 * `data-sidebar-collapsed` attribute on `<html>` and a plain CSS selector
	 * (`src/app.css`), set before paint by `app.html`'s inline script. This
	 * state exists only so the toggle button itself can show the right icon and
	 * label — a one-frame mismatch on a single icon, not the page's layout.
	 */
	let collapsed = $state(
		browser && document.documentElement.hasAttribute('data-sidebar-collapsed')
	);
	let drawerOpen = $state(false);

	function toggleCollapsed() {
		collapsed = !collapsed;
		document.documentElement.toggleAttribute('data-sidebar-collapsed', collapsed);
		try {
			if (collapsed) localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed');
			else localStorage.removeItem(SIDEBAR_STORAGE_KEY);
		} catch {
			// Private browsing and the like: the toggle still works for this load,
			// it just will not survive a reload.
		}
	}

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	/** Phase 7 (#P7) owns the palette; until then this only no-ops with a tooltip. */
	function openCommandPalette() {
		window.dispatchEvent(new CustomEvent('unitati:command-palette'));
	}

	const SECTION_LABEL = {
		modules: () => m.nav_modules_section(),
		directory: () => m.nav_directory_section()
	} as const;
</script>

{#snippet navList(rail: boolean)}
	{@const styles = appShell({ rail })}
	{#if showSearch}
		<button
			type="button"
			class={styles.navItem()}
			title={m.nav_search_soon()}
			onclick={openCommandPalette}
		>
			<SearchIcon class={styles.navIcon()} aria-hidden="true" />
			<span class={styles.navLabel()}>{m.nav_search()}</span>
			<span class={styles.kbd()}>⌘K</span>
		</button>
	{/if}

	{#each links as link, index (link.href)}
		{@const previousSection = links[index - 1]?.section}
		{#if link.section && link.section !== previousSection}
			<div class={styles.navSection()}>{SECTION_LABEL[link.section]()}</div>
		{/if}
		{@const active = isActive(link.href)}
		<a
			href={link.href}
			aria-current={active ? 'page' : undefined}
			class={appShell({ rail, active }).navItem()}
			title={rail ? link.label : undefined}
		>
			{#if link.accent}
				<span class={styles.navDot()} style:background-color={link.accent} aria-hidden="true"
				></span>
			{/if}
			<link.icon class={styles.navIcon()} aria-hidden="true" />
			<span class={styles.navLabel()}>{link.label}</span>
			{#if link.count !== undefined}
				<span class={styles.navCount()}>{link.count}</span>
			{/if}
		</a>
	{/each}
{/snippet}

<div class="flex min-h-screen bg-[var(--surface-0)]">
	<aside
		class="hidden shrink-0 border-r border-[var(--border)] md:block"
		style:width="var(--size-sidebar-current)"
	>
		<nav class={appShell().sidebar()} aria-label={m.nav_main()}>
			<div class={appShell().brandbar()}>
				<a href="/" class="rounded-[var(--radius-sm)]" aria-label={m.app_name()}>
					<Logo variant={collapsed ? 'mark' : 'lockup'} size="sm" />
				</a>
			</div>

			{@render navList(collapsed)}

			<div class={appShell().sidebarFooter()}>
				{#if settings}{@render settings()}{/if}
				<button
					type="button"
					class={appShell({ rail: collapsed }).navItem()}
					onclick={toggleCollapsed}
					aria-pressed={collapsed}
					title={collapsed ? m.nav_expand_sidebar() : m.nav_collapse_sidebar()}
				>
					<PanelLeftIcon class={appShell().navIcon()} aria-hidden="true" />
					<span class={appShell().navLabel()}>
						{collapsed ? m.nav_expand_sidebar() : m.nav_collapse_sidebar()}
					</span>
				</button>
				<div class="ut-nav-label px-[var(--space-2)] font-mono text-[11px] text-[var(--ink-muted)]">
					<AppVersion />
				</div>
			</div>
		</nav>
	</aside>

	<div class="flex min-w-0 flex-1 flex-col">
		<header class={appShell().topbar()}>
			<button
				type="button"
				class="grid size-8 place-items-center rounded-[var(--radius-md)] hover:bg-[var(--surface-2)] md:hidden"
				onclick={() => (drawerOpen = true)}
				aria-label={m.nav_open_menu()}
			>
				<MenuIcon class="size-5" aria-hidden="true" />
			</button>

			<a href="/" class="rounded-[var(--radius-sm)] md:hidden" aria-label={m.app_name()}>
				<Logo variant="mark" size="sm" />
			</a>

			<div class="ml-auto flex items-center gap-4">
				{#if topbarEnd}{@render topbarEnd()}{/if}
			</div>
		</header>

		<main class={appShell().main()}>
			{@render children()}
		</main>
	</div>
</div>

<Sheet.Root bind:open={drawerOpen}>
	<Sheet.Content side="left" class="w-[85%] max-w-[300px] bg-[var(--surface-2)] p-[var(--space-3)]">
		<nav class="flex h-full flex-col gap-0.5" aria-label={m.nav_main()}>
			<div class={appShell().brandbar()}>
				<Logo variant="lockup" size="sm" />
			</div>
			{@render navList(false)}
		</nav>
	</Sheet.Content>
</Sheet.Root>
