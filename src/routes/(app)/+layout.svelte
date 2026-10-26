<script lang="ts">
	import { APP_ENV } from '$app/env/public';
	import PackageIcon from '@lucide/svelte/icons/package';
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import UsersIcon from '@lucide/svelte/icons/users';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import AppShell, { appShell } from '#lib/components/unitati/AppShell.svelte';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { page } from '$app/state';
	import { isPathActive } from '#lib/components/unitati/app-shell-nav.js';
	import { visibleSections } from '#lib/settings/sections.js';
	import type {
		AppShellNavGroup,
		AppShellNavLeaf,
		AppShellNavLink
	} from '#lib/components/unitati/app-shell-nav.js';
	import Tooltip from '#lib/components/unitati/Tooltip.svelte';
	import NotificationBell from '#lib/components/unitati/NotificationBell.svelte';
	import RunningTimer from '#lib/components/unitati/RunningTimer.svelte';
	import UserMenu from '#lib/components/unitati/UserMenu.svelte';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import {
		ASSET_READ_PERMISSIONS,
		PROJECT_READ_PERMISSIONS,
		TICKET_READ_PERMISSIONS,
		TIME_READ_PERMISSIONS
	} from '#lib/domain/access.js';
	import { isProduction } from '#lib/environment.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Permission } from '#lib/server/access/permissions.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The running timer lives on the server: a timer started or stopped on another
	// device shows up here through a read of its own, not by re-running this layout's load.
	// Derived from `data` as a whole, not from `data.timer`: after a start or stop here the load
	// returns a new object even when the timer is `null` again, and that must drop a polled value.
	let timer = $derived.by(() => {
		void data;
		return data.timer;
	});
	$effect(() => {
		const refresh = setInterval(async () => {
			try {
				const response = await fetch('/api/timer');
				if (response.ok && !response.redirected)
					timer = ((await response.json()) as { timer: typeof data.timer }).timer;
			} catch {
				// Offline or mid-deploy: keep showing the last known timer until the next poll.
			}
		}, 60_000);
		return () => clearInterval(refresh);
	});

	/**
	 * The shell's own link types with `permission` narrowed to the real
	 * `Permission` union (not widened to `string`), so a typo'd permission name
	 * fails `npm run check` instead of silently hiding — or always showing — a
	 * link. `AppShell` applies them (`resolveNavigation`), child by child.
	 */
	type Gated = { permission: Permission | readonly Permission[] | null };
	type NavLeafSource = Omit<AppShellNavLeaf, 'permission'> & Gated;
	type NavGroupSource = Omit<AppShellNavGroup, 'children'> & { children: NavLeafSource[] };

	// One colour per domain, as the design system prescribes. Hiding a link is a
	// convenience; every route still guards itself on the server. A module with a
	// single work screen is a one-child group: `AppShell` renders it as a flat row.
	const links = $derived<AppShellNavLink[]>([
		{ href: '/', label: m.nav_overview(), permission: null, icon: HouseIcon },
		{
			id: 'assets',
			label: m.nav_assets(),
			icon: PackageIcon,
			section: 'modules',
			accent: 'var(--asset)',
			children: [
				{
					href: '/assets',
					label: m.nav_inventory(),
					icon: PackageIcon,
					permission: ASSET_READ_PERMISSIONS,
					count: data.counts.assets
				}
			]
		},
		{
			id: 'service-desk',
			label: m.nav_service_desk(),
			icon: TicketIcon,
			section: 'modules',
			accent: 'var(--desk)',
			children: [
				{
					href: '/service-desk',
					label: m.nav_tickets(),
					icon: TicketIcon,
					permission: TICKET_READ_PERMISSIONS,
					count: data.counts.serviceDesk
				}
			]
		},
		{
			id: 'projects',
			label: m.nav_projects(),
			icon: FolderKanbanIcon,
			section: 'modules',
			accent: 'var(--project)',
			children: [
				{
					href: '/projects',
					label: m.nav_projects(),
					icon: FolderKanbanIcon,
					permission: PROJECT_READ_PERMISSIONS,
					count: data.counts.projects
				},
				{
					href: '/tasks',
					label: m.nav_tasks(),
					icon: ListChecksIcon,
					permission: PROJECT_READ_PERMISSIONS,
					count: data.counts.tasks
				}
			]
		},
		{
			id: 'knowledge',
			label: m.nav_knowledge(),
			icon: BookOpenIcon,
			section: 'modules',
			accent: 'var(--knowledge)',
			children: [
				{
					href: '/knowledge',
					label: m.nav_knowledge(),
					icon: BookOpenIcon,
					// Staff only in the app: employees read from the portal (#328).
					permission: 'knowledge.manage'
				}
			]
		},
		// Its own module, not a people screen (#379): a technician's own time, an
		// admin's everybody's. Only while tracking is on (ADR 0052). No accent: time
		// has no domain colour of its own, it cuts across tickets and tasks.
		...(data.timeEnabled
			? [
					{
						id: 'time',
						label: m.nav_time(),
						icon: ClockIcon,
						section: 'modules' as const,
						children: [
							{
								href: '/time',
								label: m.nav_time(),
								icon: ClockIcon,
								permission: TIME_READ_PERMISSIONS
							}
						]
					}
				]
			: []),
		{
			href: '/directory',
			label: m.nav_directory(),
			permission: 'people.view',
			icon: UsersIcon,
			section: 'directory',
			count: data.counts.directory
		},
		// The component gallery, open in every environment but production. The
		// route answers 404 there too, so hiding the entry is a convenience,
		// not the guard.
		...(!isProduction(APP_ENV)
			? [
					{
						href: '/dev/components',
						label: m.nav_components(),
						permission: null,
						icon: LayoutGridIcon
					}
				]
			: [])
	] satisfies (NavLeafSource | NavGroupSource)[]);

	/** The *Configuración* link exists only when at least one registry section is visible. */
	const showSettings = $derived(visibleSections(data.permissions).length > 0);
</script>

{#snippet settingsLink({ rail }: { rail: boolean })}
	{@const active = isPathActive('/settings', page.url.pathname)}
	<Tooltip content={m.nav_settings()} disabled={!rail}>
		{#snippet child({ props })}
			<a
				{...props}
				href="/settings"
				aria-current={active ? 'page' : undefined}
				class={appShell({ rail, active }).navItem()}
				aria-label={rail ? m.nav_settings() : undefined}
			>
				<span class={appShell().navIconBox()}>
					<SettingsIcon class={appShell().navIcon()} aria-hidden="true" />
				</span>
				<span class={appShell().navLabel()}>{m.nav_settings()}</span>
			</a>
		{/snippet}
	</Tooltip>
{/snippet}

<AppShell
	{links}
	permissions={data.permissions}
	personId={data.user.personId}
	settings={showSettings ? settingsLink : undefined}
>
	{#snippet topbarEnd()}
		{#if timer}
			<RunningTimer {...timer} />
		{/if}
		<NotificationBell count={data.unreadNotifications} inboxHref="/notifications" />
		<UserMenu name={data.user.name} email={data.user.email} />
	{/snippet}

	{@render children()}
</AppShell>

<!--
	Outside `<AppShell>`'s children snippet on purpose: that snippet renders
	inside `<main>`, the independent scrollport (#96). A `position: fixed`
	toast still escapes a plain `overflow` ancestor, but sitting outside it
	entirely removes any doubt the portal could end up clipped.
-->
<Toaster position="bottom-center" />
