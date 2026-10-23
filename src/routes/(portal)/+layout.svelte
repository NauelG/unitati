<script lang="ts">
	import { productName } from '#lib/brand.svelte.js';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import NotificationBell from '#lib/components/unitati/NotificationBell.svelte';
	import UserMenu from '#lib/components/unitati/UserMenu.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<!-- No sidebar: an employee holding only their own tickets would meet a menu of empty modules. -->
<div class="min-h-dvh bg-[var(--surface-0)]">
	<header
		class="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-6"
	>
		<a href="/portal" class="rounded-[var(--radius-sm)]" aria-label={productName()}>
			<Logo size="md" />
		</a>

		<div class="flex items-center gap-4">
			<a href="/portal" class="text-sm text-[var(--ink)]">{m.nav_portal()}</a>
			{#if data.canSeeHandovers}
				<a href="/portal/handovers" class="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
					{m.portal_handovers_nav()}
				</a>
			{/if}
			{#if data.canSeeKnowledge}
				<a href="/portal/knowledge" class="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
					{m.portal_knowledge_nav()}
				</a>
			{/if}
			<a href="/assets" class="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
				{m.portal_assets_link()}
			</a>
			<AppVersion />
			<NotificationBell count={data.unreadNotifications} inboxHref="/portal/notifications" />
			<UserMenu name={data.user.name} email={data.user.email} />
		</div>
	</header>

	<main class="p-[var(--space-6)]">
		{@render children()}
	</main>
</div>
