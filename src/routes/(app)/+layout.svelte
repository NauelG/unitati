<script lang="ts">
	import { APP_ENV } from '$app/env/public';
	import PackageIcon from '@lucide/svelte/icons/package';
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import UsersIcon from '@lucide/svelte/icons/users';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import AppShell, { type AppShellNavLink } from '#lib/components/unitati/AppShell.svelte';
	import EnvironmentBadge from '#lib/components/unitati/EnvironmentBadge.svelte';
	import ThemeToggle from '#lib/components/unitati/ThemeToggle.svelte';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { ASSET_READ_PERMISSIONS, TICKET_READ_PERMISSIONS } from '#lib/domain/access.js';
	import { isProduction } from '#lib/environment.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Permission } from '#lib/server/access/permissions.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/**
	 * `AppShellNavLink` plus the one field the component itself never sees:
	 * which permission shows the row at all. Kept a real `Permission` union
	 * (not widened to `string`) so a typo'd permission name fails `npm run
	 * check` instead of silently hiding — or always showing — a link.
	 */
	interface NavLinkSource extends AppShellNavLink {
		permission: Permission | readonly Permission[] | null;
	}

	// One colour per domain, as the design system prescribes. Hiding a link is a
	// convenience; every route still guards itself on the server.
	const links = $derived(
		(
			[
				{ href: '/', label: m.nav_overview(), permission: null, icon: HouseIcon },
				{
					href: '/assets',
					label: m.nav_assets(),
					permission: ASSET_READ_PERMISSIONS,
					icon: PackageIcon,
					section: 'modules',
					accent: 'var(--asset)',
					count: data.counts.assets
				},
				{
					href: '/service-desk',
					label: m.nav_service_desk(),
					permission: TICKET_READ_PERMISSIONS,
					icon: TicketIcon,
					section: 'modules',
					accent: 'var(--desk)',
					count: data.counts.serviceDesk
				},
				{
					href: '/projects',
					label: m.nav_projects(),
					permission: 'projects.view',
					icon: FolderKanbanIcon,
					section: 'modules',
					accent: 'var(--project)'
				},
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
			] satisfies NavLinkSource[]
		).filter(
			(link) =>
				!link.permission ||
				[link.permission].flat().some((permission) => data.permissions.includes(permission))
		)
	);

	const initials = $derived(
		data.user.name
			.split(' ')
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<AppShell
	{links}
	showSearch={!isProduction(APP_ENV)}
	permissions={data.permissions}
	personId={data.user.personId}
>
	{#snippet topbarEnd()}
		<EnvironmentBadge environment={APP_ENV} />
		<!--
			The theme switch sits in the user area (#90), beside the avatar and
			sign-out rather than in the sidebar: it is a preference of the person
			signed in, grouped with the other things about them, and the sidebar
			collapses to a 64px rail where a third icon row would have nowhere to
			put its label.
		-->
		<ThemeToggle />
		<div class="flex items-center gap-2.5">
			<span
				class="grid size-8 place-items-center rounded-[var(--radius-full)] bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand)]"
				aria-hidden="true"
			>
				{initials}
			</span>
			<span class="hidden text-sm text-[var(--ink)] sm:inline">{data.user.name}</span>
		</div>
		<form method="POST" action="/sign-out">
			<button
				type="submit"
				class="ut-transition-fast text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
			>
				{m.nav_sign_out()}
			</button>
		</form>
	{/snippet}

	{@render children()}
</AppShell>

<!--
	Outside `<AppShell>`'s children snippet on purpose: that snippet renders
	inside `<main>`, the independent scrollport (#96). A `position: fixed`
	toast still escapes a plain `overflow` ancestor, but sitting outside it
	entirely removes any doubt the portal could end up clipped.
-->
<Toaster />
