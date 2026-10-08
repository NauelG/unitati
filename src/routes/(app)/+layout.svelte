<script lang="ts">
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import type { Permission } from '#lib/server/access/permissions.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	interface NavLink {
		href: string;
		label: string;
		permission: Permission | null;
		accent: string;
	}

	// One colour per domain, as the design system prescribes. Hiding a link is a
	// convenience: every route still guards itself on the server.
	const links = $derived(
		(
			[
				{ href: '/', label: m.nav_overview(), permission: null, accent: 'var(--ink)' },
				{
					href: '/assets',
					label: m.nav_assets(),
					permission: 'assets.view',
					accent: 'var(--asset)'
				},
				{
					href: '/tickets',
					label: m.nav_service_desk(),
					permission: 'tickets.view',
					accent: 'var(--desk)'
				},
				{
					href: '/projects',
					label: m.nav_projects(),
					permission: 'projects.view',
					accent: 'var(--project)'
				},
				{
					href: '/directory',
					label: m.nav_directory(),
					permission: 'people.view',
					accent: 'var(--ink)'
				},
				// The component gallery. `dev` is a build-time literal, so this entry
				// and the route behind it both disappear from a production build.
				...(dev
					? [
							{
								href: '/dev/components',
								label: 'Componentes',
								permission: null,
								accent: 'var(--border-strong)'
							}
						]
					: [])
			] satisfies NavLink[]
		).filter((link) => !link.permission || data.permissions.includes(link.permission))
	);

	const initials = $derived(
		data.user.name
			.split(' ')
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<div class="flex min-h-screen bg-[var(--surface-0)]">
	<aside
		class="hidden shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)] md:block"
		style:width="var(--size-sidebar)"
	>
		<div class="flex h-14 items-center px-5">
			<a href="/" class="font-display text-base font-semibold text-[var(--ink)]">
				{m.app_name()}
			</a>
		</div>

		<nav class="px-3 py-2" aria-label={m.nav_main()}>
			<ul class="space-y-0.5">
				{#each links as link (link.href)}
					{@const active =
						link.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(link.href)}
					<li>
						<a
							href={link.href}
							aria-current={active ? 'page' : undefined}
							class="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-sm transition-colors"
							style:height="var(--size-row)"
							style:background-color={active ? 'var(--surface-2)' : 'transparent'}
							style:color={active ? 'var(--ink)' : 'var(--ink-muted)'}
							style:font-weight={active ? '500' : '400'}
						>
							<span
								class="size-1.5 rounded-[var(--radius-full)]"
								style:background-color={link.accent}
								aria-hidden="true"
							></span>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</aside>

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-6"
		>
			<span class="font-display text-sm font-semibold text-[var(--ink)] md:hidden">
				{m.app_name()}
			</span>

			<div class="ml-auto flex items-center gap-4">
				<AppVersion />
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
						class="text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
					>
						{m.nav_sign_out()}
					</button>
				</form>
			</div>
		</header>

		<main class="flex-1 px-6 py-8">
			{@render children()}
		</main>
	</div>
</div>
