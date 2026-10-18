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
			sidebar:
				'ut-sidebar flex h-full min-h-0 flex-col bg-[var(--surface-2)] p-[var(--space-3)] pl-[max(var(--space-3),env(safe-area-inset-left))]',
			brandbar:
				'ut-brandbar flex shrink-0 items-center justify-between px-[var(--space-2)] py-[var(--space-2)]',
			navItems:
				'ut-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain',
			navSection:
				'ut-nav-label px-[var(--space-2)] pt-[var(--space-3)] pb-[var(--space-1)] text-xs font-semibold tracking-[0.04em] text-[var(--ink-muted)]',
			navItem: [
				'flex min-h-10 items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)]',
				'text-sm leading-5 font-medium text-[var(--ink)] no-underline',
				// Hover raises contrast with an edge: surface-1 on surface-2 is ~1.1:1 on its own (ADR 0019).
				'transition-colors ut-transition-fast hover:bg-[var(--surface-1)] hover:text-[var(--ink)] hover:shadow-[inset_0_0_0_1px_var(--border)]'
			],
			navList: 'flex flex-col gap-0.5',
			navIcon: 'size-[var(--size-icon-sm)] shrink-0',
			navDot: 'size-2 shrink-0 rounded-[var(--radius-full)]',
			railMenuTitle:
				'px-[var(--space-2)] py-[var(--space-1)] text-xs font-semibold text-[var(--ink-muted)]',
			railMenuContent: 'w-56 gap-0 bg-[var(--surface-1)] p-1',
			navChevron: [
				'ut-nav-label ut-nav-chevron ml-auto size-4 shrink-0 text-[var(--ink-muted)]',
				'transition-transform ut-transition-fast'
			],
			navChildren:
				'ut-nav-children mt-0.5 flex-col gap-0.5 pl-[calc(var(--space-2)+var(--size-icon-sm)+var(--space-2))]',
			railMenu: 'flex flex-col gap-0.5',
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
				'flex h-14 shrink-0 items-center gap-[var(--space-3)] border-b border-[var(--border)] bg-[var(--surface-0)] px-[var(--space-6)] pt-[env(safe-area-inset-top)]',
			main: 'ut-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-[var(--space-6)] pb-[max(var(--space-6),env(safe-area-inset-bottom))]'
		},
		variants: {
			active: {
				true: { navItem: 'bg-[var(--brand-soft)] text-[var(--brand)]' }
			},
			group: {
				true: { navItem: 'w-full cursor-pointer text-left' }
			},
			rail: {
				true: {
					sidebar: 'items-center',
					navItem: 'justify-center px-0'
				}
			}
		}
	});
</script>

<script lang="ts">
	import { productName } from '#lib/brand.svelte.js';
	import { onMount, tick, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { goto } from '$app/navigation';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import XIcon from '@lucide/svelte/icons/x';
	import Logo from './Logo.svelte';
	import AppVersion from '../AppVersion.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import KeymapOverlay from './KeymapOverlay.svelte';
	import RollingNumber from './RollingNumber.svelte';
	import { MainScrollRestoration } from './main-scroll-restoration.js';
	import { afterViewTransitionSettles } from '#lib/motion.js';
	import {
		formatKeys,
		isMacPlatform,
		isOverlayOpen,
		isTypingTarget,
		keymapRegistry,
		KeymapRouter,
		activeScope,
		type KeymapScope
	} from '#lib/keymap.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { button } from './Button.svelte';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import {
		groupContainsPath,
		isPathActive,
		navLeaves,
		resolveNavigation,
		type AppShellNavLink,
		type ResolvedNavGroup
	} from './app-shell-nav.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		links: AppShellNavLink[];
		/** Hidden in production, same gate as the dev gallery link (ADR 0013). */
		showSearch?: boolean;
		/**
		 * The *Configuración* link (#123), rendered above the version in the sidebar
		 * and the mobile drawer. The caller passes it only when the viewer can see
		 * at least one Settings section; it is told whether the sidebar is the 64px
		 * rail so the row can centre its icon like every other row.
		 */
		settings?: Snippet<[{ rail: boolean }]>;
		/** The topbar's right-hand side: environment badge, user, sign-out — all route-specific. */
		topbarEnd?: Snippet;
		/** The keymap's permission gate (#88) — same vocabulary `links` is already filtered by. */
		permissions?: readonly string[];
		/** The viewer's own directory record, passed through to the palette's "Asignar a mí". */
		personId?: string | null;
		/**
		 * The path "the current route" means. Defaults to the real URL; the
		 * gallery passes one so a specimen can show a group opened by its
		 * active child without navigating the gallery page itself.
		 */
		currentPath?: string;
		children: Snippet;
	}

	let {
		links,
		showSearch = false,
		settings,
		topbarEnd,
		permissions = [],
		personId = null,
		currentPath,
		children
	}: Props = $props();

	const closeClass = button({ variant: 'ghost', size: 'sm', iconOnly: true });

	const SIDEBAR_STORAGE_KEY = 'unitati:sidebar';
	const GROUPS_STORAGE_KEY = 'unitati:nav-groups';

	/** Distinguishes `aria-controls` ids when several shells share a page (the gallery). */
	const uid = $props.id();

	const pathname = $derived(currentPath ?? page.url.pathname);

	/** Permissions applied and one-child groups flattened (`app-shell-nav.ts`). */
	const items = $derived(resolveNavigation(links, permissions));

	/**
	 * Groups the viewer opened by hand. The first paint does not wait for this:
	 * `app.html` injects a `<style>` for the stored ids before paint, and this
	 * state takes over on mount (see `onMount`). Reading it during init would
	 * hydrate a different DOM than the server rendered.
	 */
	let openGroupIds = $state<string[]>([]);
	/** Only after mount may the rail swap a group's row for its popover (same hydration reason). */
	let mounted = $state(false);
	/** Only after mount: the server cannot know the platform, so SSR and hydration must agree on "Ctrl". */
	const mac = $derived(mounted && isMacPlatform());
	let railOpenId = $state<string | null>(null);

	function readStoredGroups(): string[] {
		try {
			const parsed: unknown = JSON.parse(localStorage.getItem(GROUPS_STORAGE_KEY) ?? '[]');
			return Array.isArray(parsed)
				? parsed.filter((id): id is string => typeof id === 'string')
				: [];
		} catch {
			return [];
		}
	}

	onMount(() => {
		openGroupIds = readStoredGroups();
		mounted = true;
		// The pre-paint style forced the stored groups open; now the component's own
		// state says the same, so the override must go or a group could never close.
		void tick().then(() => document.getElementById('ut-nav-open')?.remove());
	});

	function isGroupOpen(group: ResolvedNavGroup): boolean {
		return groupContainsPath(group.children, pathname) || openGroupIds.includes(group.id);
	}

	/**
	 * The parent row only expands or collapses — it never navigates. A group
	 * holding the current page stays open (its button says so with
	 * `aria-disabled`): collapsing it would hide the very row that says where
	 * the viewer is.
	 */
	function toggleGroup(group: ResolvedNavGroup) {
		if (groupContainsPath(group.children, pathname)) return;
		const next = openGroupIds.includes(group.id)
			? openGroupIds.filter((id) => id !== group.id)
			: [...openGroupIds, group.id];
		openGroupIds = next;
		try {
			// Merge into whatever is stored: another shell on the same page (the
			// gallery) may know groups this one does not.
			const stored = readStoredGroups().filter((id) => id !== group.id);
			const merged = next.includes(group.id) ? [...stored, group.id] : stored;
			if (merged.length) localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(merged));
			else localStorage.removeItem(GROUPS_STORAGE_KEY);
		} catch {
			// Same as the sidebar collapse: works for this load, just not across reloads.
		}
	}

	function onRailMenuKeydown(event: KeyboardEvent) {
		const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		const rows = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('a[href]')];
		if (!rows.length) return;
		event.preventDefault();
		const current = rows.indexOf(document.activeElement as HTMLElement);
		const target =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? rows.length - 1
					: event.key === 'ArrowDown'
						? (current + 1) % rows.length
						: (current - 1 + rows.length) % rows.length;
		rows[target]?.focus();
	}

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
		railOpenId = null;
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
		return isPathActive(href, pathname);
	}

	function openCommandPalette() {
		window.dispatchEvent(new CustomEvent('unitati:command-palette'));
	}

	/** Consecutive items under the same section heading, so each section renders as one list. */
	const navSections = $derived.by(() => {
		const sections: { section: (typeof items)[number]['section']; items: typeof items }[] = [];
		for (const item of items) {
			const last = sections.at(-1);
			if (last && last.section === item.section) last.items.push(item);
			else sections.push({ section: item.section, items: [item] });
		}
		return sections;
	});

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
		const linkHrefs = new Set(navLeaves(items).map((leaf) => leaf.href));
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

{#snippet navList(rail: boolean, scope: string)}
	{@const styles = appShell({ rail })}
	{#if showSearch}
		<ul class={styles.navList()}>
			<li>
				<button
					type="button"
					class={styles.navItem()}
					title={m.nav_search()}
					onclick={openCommandPalette}
				>
					<SearchIcon class={styles.navIcon()} aria-hidden="true" />
					<span class={styles.navLabel()}>{m.nav_search()}</span>
					<span class={styles.kbd()}>{formatKeys(['$mod+k'], mac)}</span>
				</button>
			</li>
		</ul>
	{/if}

	{#each navSections as { section, items: sectionItems }, index (index)}
		{@const labelId = `${uid}-${scope}-section-${index}`}
		{#if section}
			<div id={labelId} class={styles.navSection()}>{SECTION_LABEL[section]()}</div>
		{/if}
		<ul class={styles.navList()} aria-labelledby={section ? labelId : undefined}>
			{#each sectionItems as item (item.kind === 'group' ? `group:${item.id}` : item.href)}
				<li>
					{@render navEntry(item, rail, scope, styles)}
				</li>
			{/each}
		</ul>
	{/each}
{/snippet}

{#snippet navEntry(
	item: (typeof items)[number],
	rail: boolean,
	scope: string,
	styles: ReturnType<typeof appShell>
)}
	{#if item.kind === 'leaf'}
		{@const active = isActive(item.href)}
		<a
			href={item.href}
			aria-current={active ? 'page' : undefined}
			class={appShell({ rail, active }).navItem()}
			title={rail ? item.label : undefined}
		>
			{#if item.accent}
				<span class={styles.navDot()} style:background-color={item.accent} aria-hidden="true"
				></span>
			{/if}
			<item.icon class={styles.navIcon()} aria-hidden="true" />
			<span class={styles.navLabel()}>{item.label}</span>
			{#if item.count !== undefined}
				<span class={styles.navCount()}><RollingNumber value={item.count} /></span>
			{/if}
		</a>
	{:else}
		{@const open = isGroupOpen(item)}
		{@const containsCurrent = groupContainsPath(item.children, pathname)}
		{@const panelId = `${uid}-${scope}-${item.id}`}
		<div data-nav-group={item.id} data-open={open ? '' : undefined}>
			{#if rail && mounted}
				<!--
						Rail: no room for indented children, so the parent icon opens a popover
						with them. Enter/Space open it, arrows move, Escape closes it and puts
						focus back on this icon (bits-ui's popover does the last part).
					-->
				<Popover.Root
					open={railOpenId === item.id}
					onOpenChange={(next) => (railOpenId = next ? item.id : null)}
				>
					<Popover.Trigger
						class={appShell({ rail, active: containsCurrent }).navItem()}
						aria-label={item.label}
						title={item.label}
					>
						<item.icon class={styles.navIcon()} aria-hidden="true" />
					</Popover.Trigger>
					<Popover.Content
						side="right"
						align="start"
						sideOffset={8}
						class={styles.railMenuContent()}
						onkeydown={onRailMenuKeydown}
					>
						<div class={styles.railMenuTitle()}>
							{item.label}
						</div>
						<ul class={styles.railMenu()}>
							{#each item.children as child (child.href)}
								<li>
									<a
										href={child.href}
										aria-current={isActive(child.href) ? 'page' : undefined}
										class={appShell({ active: isActive(child.href) }).navItem()}
									>
										<span class={styles.navLabel()}>{child.label}</span>
										{#if child.count !== undefined}
											<span class={styles.navCount()}><RollingNumber value={child.count} /></span>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					</Popover.Content>
				</Popover.Root>
			{:else}
				<button
					type="button"
					class={appShell({ rail, group: true }).navItem()}
					title={rail ? item.label : undefined}
					aria-expanded={open}
					aria-controls={panelId}
					aria-disabled={containsCurrent ? 'true' : undefined}
					onclick={() => toggleGroup(item)}
				>
					{#if item.accent}
						<span class={styles.navDot()} style:background-color={item.accent} aria-hidden="true"
						></span>
					{/if}
					<item.icon class={styles.navIcon()} aria-hidden="true" />
					<span class={styles.navLabel()}>{item.label}</span>
					<ChevronRightIcon class={styles.navChevron()} aria-hidden="true" />
				</button>
				<div id={panelId} class={styles.navChildren()}>
					{#each item.children as child (child.href)}
						{@const active = isActive(child.href)}
						<a
							href={child.href}
							aria-current={active ? 'page' : undefined}
							class={appShell({ active }).navItem()}
						>
							<span class={styles.navLabel()}>{child.label}</span>
							{#if child.count !== undefined}
								<span class={styles.navCount()}><RollingNumber value={child.count} /></span>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="flex h-dvh overflow-hidden bg-[var(--surface-0)]">
	<a
		href="#main"
		class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--surface-1)] focus:px-[var(--space-3)] focus:py-[var(--space-2)] focus:text-[var(--ink)] focus:outline-2 focus:outline-[var(--focus)]"
		>{m.shell_skip_to_content()}</a
	>
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
			<div class={appShell().brandbar()}>
				<a href="/" class="rounded-[var(--radius-sm)]" aria-label={productName()}>
					<!--
						Both are in the markup and `app.css` shows one by `html[data-sidebar-collapsed]`,
						which `app.html` sets before paint: the server cannot know the stored state, so
						swapping on `collapsed` would flash the lockup on a collapsed reload.
					-->
					<span class="ut-brand-lockup"><Logo variant="lockup" size="sm" /></span>
					<span class="ut-brand-mark"><Logo variant="mark" size="sm" /></span>
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
				{@render navList(collapsed, 'sidebar')}
			</div>

			<div class={appShell().sidebarFooter()}>
				{#if settings}{@render settings({ rail: collapsed })}{/if}
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
				class="ut-transition-fast grid size-8 place-items-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--surface-2)] md:hidden"
				onclick={() => (drawerOpen = true)}
				aria-label={m.nav_open_menu()}
			>
				<MenuIcon class="size-5" aria-hidden="true" />
			</button>

			<a href="/" class="rounded-[var(--radius-sm)] md:hidden" aria-label={productName()}>
				<Logo variant="mark" size="sm" />
			</a>

			<div class="ml-auto flex items-center gap-4">
				{#if topbarEnd}{@render topbarEnd()}{/if}
			</div>
		</header>

		<main
			id="main"
			tabindex="-1"
			bind:this={mainEl}
			class={appShell().main()}
			data-sveltekit-preload-data="hover"
		>
			{@render children()}
		</main>
	</div>
</div>

<Sheet.Root bind:open={drawerOpen}>
	<Sheet.Content
		side="left"
		class="w-[85%] max-w-[300px] bg-[var(--surface-2)] p-[var(--space-3)]"
		showCloseButton={false}
	>
		<nav
			class="flex h-full min-h-0 flex-col"
			aria-label={m.nav_main()}
			data-sveltekit-preload-data="hover"
		>
			<div class={appShell().brandbar()}>
				<Logo variant="lockup" size="sm" />
			</div>
			<div class={appShell().navItems()}>
				{@render navList(false, 'drawer')}
			</div>
			<div class={appShell().sidebarFooter()}>
				{#if settings}{@render settings({ rail: false })}{/if}
				<div class="ut-nav-label px-[var(--space-2)] font-mono text-[11px] text-[var(--ink-muted)]">
					<AppVersion />
				</div>
			</div>
		</nav>
		<Sheet.Close class={closeClass + ' absolute top-3 right-3'} aria-label={m.dialog_close()}>
			<XIcon class="size-4" aria-hidden="true" />
		</Sheet.Close>
	</Sheet.Content>
</Sheet.Root>

<svelte:window onkeydown={onGlobalKeydown} />
<CommandPalette {permissions} {personId} />
<KeymapOverlay bind:open={keymapOverlayOpen} />
