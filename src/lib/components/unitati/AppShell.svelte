<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-shell` family: sidebar, nav rows, section headings and the
	 * top bar around every `(app)` page. See `docs/adr/0015-appshell-and-responsive-navigation.md`
	 * and its post-merge addendum (issue #96) for the viewport-height shell,
	 * independently scrolling `nav`/`main` and the brand-row collapse control.
	 *
	 * Row height is `--size-row-compact` (32px), not `--size-row` (40px, the
	 * **table** row token) — the issue's own drift report (#83) is exactly this
	 * mix-up, and the fix is to read the token that already means "compact",
	 * not invent a new one. The *hit area* is taller than that (40px, #96): a
	 * row can paint 32px tall while still offering a 40px click/tap target
	 * through padding, the same distinction a table cell and its interactive
	 * control already keep separate elsewhere in the design system.
	 */
	export const appShell = tv({
		slots: {
			sidebar: 'ut-sidebar flex h-full min-h-0 flex-col bg-[var(--surface-2)] p-[var(--space-3)]',
			brandbar:
				'flex shrink-0 items-center justify-between px-[var(--space-2)] py-[var(--space-2)]',
			navItems:
				'ut-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain',
			navSection:
				'ut-nav-label px-[var(--space-2)] pt-[var(--space-3)] pb-[var(--space-1)] text-xs font-semibold tracking-[0.04em] text-[var(--ink-muted)]',
			navItem: [
				'flex min-h-10 items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)]',
				'text-sm leading-5 font-medium text-[var(--ink)] no-underline',
				'transition-colors ut-transition-fast hover:bg-[var(--surface-1)]'
			],
			navIcon: 'size-[var(--size-icon-sm)] shrink-0',
			navDot: 'size-2 shrink-0 rounded-[var(--radius-full)]',
			navLabel: 'ut-nav-label truncate',
			navCount: 'ut-nav-label ml-auto font-mono text-xs tabular-nums text-[var(--ink-muted)]',
			kbd: 'ut-kbd ut-nav-label ml-auto',
			sidebarFooter: 'mt-auto flex shrink-0 flex-col gap-0.5 pt-[var(--space-2)]',
			collapseButton: [
				'grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)]',
				'text-[var(--ink-muted)] transition-colors ut-transition-fast',
				'hover:bg-[var(--surface-1)] hover:text-[var(--ink)]'
			],
			topbar:
				'flex h-14 shrink-0 items-center gap-[var(--space-3)] border-b border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-6)]',
			main: 'ut-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-[var(--space-6)]'
		},
		variants: {
			active: {
				true: { navItem: 'bg-[var(--brand-soft)] text-[var(--brand)]' }
			},
			rail: {
				true: {
					sidebar: 'items-center',
					brandbar: 'flex-col gap-[var(--space-1)]',
					navItem: 'justify-center px-0'
				}
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
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { goto } from '$app/navigation';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Logo from './Logo.svelte';
	import AppVersion from '../AppVersion.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import KeymapOverlay from './KeymapOverlay.svelte';
	import RollingNumber from './RollingNumber.svelte';
	import { MainScrollRestoration } from './main-scroll-restoration.js';
	import { afterViewTransitionSettles } from '#lib/motion.js';
	import {
		isOverlayOpen,
		isTypingTarget,
		keymapRegistry,
		KeymapRouter,
		activeScope,
		type KeymapScope
	} from '#lib/keymap.js';
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
		/** The keymap's permission gate (#88) — same vocabulary `links` is already filtered by. */
		permissions?: readonly string[];
		/** The viewer's own directory record, passed through to the palette's "Asignar a mí". */
		personId?: string | null;
		children: Snippet;
	}

	let {
		links,
		showSearch = false,
		settings,
		topbarEnd,
		permissions = [],
		personId = null,
		children
	}: Props = $props();

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

	/**
	 * `<main>`, not the document, owns vertical scroll now (ADR 0015
	 * addendum, #96). SvelteKit's built-in scroll restoration only targets
	 * `window`, so a minimal route-keyed replacement lives here: remember
	 * `<main>`'s `scrollTop` before leaving a route, restore it only when the
	 * user came back via Back/Forward (`popstate`); every other navigation
	 * starts the new route at the top, same as `window`'s own default.
	 */
	let mainEl: HTMLElement | undefined;
	const scrollRestoration = new MainScrollRestoration();

	beforeNavigate(({ from }) => {
		if (from && mainEl) scrollRestoration.remember(from.url.pathname, mainEl.scrollTop);
	});

	afterNavigate(({ to, type }) => {
		drawerOpen = false;
		if (!to || !mainEl) return;
		// Deferred past any in-flight View Transition (#87): a scroll jump
		// applied while the browser is still animating the old-vs-new crossfade
		// would land inside the "new" snapshot it already captured, instead of
		// after the morph settles. `afterViewTransitionSettles` is a same-tick
		// no-op when there is nothing to wait for.
		const target = scrollRestoration.resolve(to.url.pathname, type);
		afterViewTransitionSettles(() => {
			if (mainEl) mainEl.scrollTop = target;
		});
	});

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

	function openCommandPalette() {
		window.dispatchEvent(new CustomEvent('unitati:command-palette'));
	}

	const SECTION_LABEL = {
		modules: () => m.nav_modules_section(),
		directory: () => m.nav_directory_section()
	} as const;

	/**
	 * The keymap layer (#88). `AppShell` is the one place every `(app)` route
	 * passes through, so it is the one place that installs the listener and
	 * the global entries every page shares (`g`-prefix navigation, `/`, `?`).
	 * Row-level verbs, `n`-in-context and anything else that depends on a
	 * specific page's own state register themselves into the same
	 * `keymapRegistry` from that page instead.
	 */
	let keymapOverlayOpen = $state(false);

	const router = new KeymapRouter(() => keymapRegistry.snapshot());

	function onGlobalKeydown(event: KeyboardEvent) {
		router.handle(event, {
			scope: currentScope(),
			permissions,
			overlayOpen: isOverlayOpen(browser ? document : undefined),
			typingTarget: isTypingTarget(event.target)
		});
	}

	let scopeValue: KeymapScope = 'global';
	$effect(() => activeScope.subscribe((value) => (scopeValue = value)));
	function currentScope(): KeymapScope {
		return scopeValue;
	}

	/** `g a` / `g s` / `g d` / `g o`: one sequence entry per nav link that carries one of these targets. */
	const NAV_SHORTCUTS = $derived([
		{ href: '/assets', key: 'a', label: m.keymap_entry_go_assets() },
		{ href: '/service-desk', key: 's', label: m.keymap_entry_go_service_desk() },
		{ href: '/directory', key: 'd', label: m.keymap_entry_go_directory() },
		{ href: '/', key: 'o', label: m.keymap_entry_go_overview() }
	]);

	$effect(() => {
		const linkHrefs = new Set(links.map((link) => link.href));
		const unregisters = NAV_SHORTCUTS.filter((shortcut) => linkHrefs.has(shortcut.href)).map(
			(shortcut) =>
				keymapRegistry.register({
					id: `global.nav.${shortcut.href}`,
					keys: ['g', shortcut.key],
					scope: 'global',
					group: m.keymap_group_navigation(),
					label: shortcut.label,
					run: () => goto(shortcut.href)
				})
		);
		return () => unregisters.forEach((unregister) => unregister());
	});

	$effect(() => {
		return keymapRegistry.register({
			id: 'global.focus-filter',
			keys: ['/'],
			scope: 'global',
			group: m.keymap_group_general(),
			label: m.keymap_entry_focus_filter(),
			run: () => {
				const field = document.querySelector<HTMLInputElement>('input[name="q"]');
				field?.focus();
				field?.select();
			}
		});
	});

	$effect(() => {
		return keymapRegistry.register({
			id: 'global.keymap-overlay',
			keys: ['?'],
			scope: 'global',
			group: m.keymap_group_general(),
			label: m.keymap_entry_open_overlay(),
			run: () => (keymapOverlayOpen = true)
		});
	});
</script>

{#snippet navList(rail: boolean)}
	{@const styles = appShell({ rail })}
	{#if showSearch}
		<button
			type="button"
			class={styles.navItem()}
			title={m.nav_search()}
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
				<span class={styles.navCount()}><RollingNumber value={link.count} /></span>
			{/if}
		</a>
	{/each}
{/snippet}

<div class="flex h-dvh overflow-hidden bg-[var(--surface-0)]">
	<aside
		class="hidden h-full shrink-0 border-r border-[var(--border)] md:block"
		style:width="var(--size-sidebar-current)"
		style:view-transition-name="shell-sidebar"
	>
		<!--
			Perceived speed (#89): hover warms the target route's data before the
			click lands. Set once here rather than per-`<a>` — SvelteKit's
			`data-sveltekit-preload-data` inherits down the DOM — so it reaches
			every nav row without a per-link opt-in, and `<main>` below (content
			links: breadcrumbs, table rows, `RelatedRecords`) the same way.
		-->
		<nav class={appShell().sidebar()} aria-label={m.nav_main()} data-sveltekit-preload-data="hover">
			<div class={appShell({ rail: collapsed }).brandbar()}>
				<a href="/" class="rounded-[var(--radius-sm)]" aria-label={m.app_name()}>
					<Logo variant={collapsed ? 'mark' : 'lockup'} size="sm" />
				</a>
				<button
					type="button"
					class={appShell().collapseButton()}
					onclick={toggleCollapsed}
					aria-expanded={!collapsed}
					title={collapsed ? m.nav_expand_sidebar() : m.nav_collapse_sidebar()}
				>
					<PanelLeftIcon class={appShell().navIcon()} aria-hidden="true" />
					<span class="sr-only">
						{collapsed ? m.nav_expand_sidebar() : m.nav_collapse_sidebar()}
					</span>
				</button>
			</div>

			<div class={appShell().navItems()}>
				{@render navList(collapsed)}
			</div>

			<div class={appShell().sidebarFooter()}>
				{#if settings}{@render settings()}{/if}
				<div class="ut-nav-label px-[var(--space-2)] font-mono text-[11px] text-[var(--ink-muted)]">
					<AppVersion />
				</div>
			</div>
		</nav>
	</aside>

	<div class="flex h-full min-h-0 min-w-0 flex-1 flex-col">
		<header class={appShell().topbar()} style:view-transition-name="shell-topbar">
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

		<main bind:this={mainEl} class={appShell().main()} data-sveltekit-preload-data="hover">
			{@render children()}
		</main>
	</div>
</div>

<Sheet.Root bind:open={drawerOpen}>
	<Sheet.Content side="left" class="w-[85%] max-w-[300px] bg-[var(--surface-2)] p-[var(--space-3)]">
		<nav
			class="flex h-full min-h-0 flex-col"
			aria-label={m.nav_main()}
			data-sveltekit-preload-data="hover"
		>
			<div class={appShell().brandbar()}>
				<Logo variant="lockup" size="sm" />
			</div>
			<div class={appShell().navItems()}>
				{@render navList(false)}
			</div>
			<div class={appShell().sidebarFooter()}>
				<div class="ut-nav-label px-[var(--space-2)] font-mono text-[11px] text-[var(--ink-muted)]">
					<AppVersion />
				</div>
			</div>
		</nav>
	</Sheet.Content>
</Sheet.Root>

<svelte:window onkeydown={onGlobalKeydown} />
<CommandPalette {permissions} {personId} />
<KeymapOverlay bind:open={keymapOverlayOpen} />
