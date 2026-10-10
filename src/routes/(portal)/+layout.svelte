<script lang="ts">
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<!-- No sidebar: an employee holding only their own tickets would meet a menu of empty modules. -->
<div class="min-h-screen bg-[var(--surface-0)]">
	<header
		class="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-6"
	>
		<a href="/portal" class="rounded-[var(--radius-sm)]" aria-label={m.app_name()}>
			<Logo size="md" />
		</a>

		<div class="flex items-center gap-4">
			<a href="/portal" class="text-sm text-[var(--ink)]">{m.nav_portal()}</a>
			<a href="/assets" class="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
				{m.portal_assets_link()}
			</a>
			<AppVersion />
			<span class="hidden text-sm text-[var(--ink)] sm:inline">{data.user.name}</span>
			<form method="POST" action="/sign-out">
				<button
					type="submit"
					class="ut-transition-fast text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
				>
					{m.nav_sign_out()}
				</button>
			</form>
		</div>
	</header>

	<main class="p-[var(--space-6)]">
		{@render children()}
	</main>
</div>
