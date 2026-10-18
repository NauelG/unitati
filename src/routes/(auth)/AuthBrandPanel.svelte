<script lang="ts">
	import Logo from '#lib/components/unitati/Logo.svelte';
	import { m } from '#lib/paraglide/messages.js';

	// Same one-colour-per-domain convention as the app shell's nav accents
	// ((app)/+layout.svelte): the three modules this product unifies, named
	// by their own colour rather than a generic bullet.
	const pillars: { label: string; accent: string }[] = [
		{ label: m.nav_assets(), accent: 'var(--asset)' },
		{ label: m.nav_service_desk(), accent: 'var(--desk)' },
		{ label: m.nav_projects(), accent: 'var(--project)' }
	];

	// One soft wash per domain colour, each anchored to a different corner — the
	// same "one colour per domain" idea as `pillars`, as atmosphere instead of a list.
	const wash = [
		'radial-gradient(60% 50% at 10% 0%, var(--asset-soft), transparent 60%)',
		'radial-gradient(55% 45% at 100% 30%, var(--desk-soft), transparent 60%)',
		'radial-gradient(60% 55% at 25% 100%, var(--project-soft), transparent 60%)'
	].join(', ');
</script>

<div
	class="relative hidden overflow-hidden bg-[var(--surface-1)] lg:flex lg:flex-col lg:justify-between lg:p-12"
>
	<div class="pointer-events-none absolute inset-0" style:background={wash}></div>

	<Logo size="lg" class="relative" />

	<!-- layout-ok: a reading measure for the tagline, not a page container -->
	<div class="relative max-w-sm">
		<p class="font-display text-display text-[var(--ink)]">
			{m.login_lede()}
		</p>

		<ul class="mt-[var(--space-8)] flex flex-col gap-[var(--space-3)]">
			{#each pillars as pillar (pillar.label)}
				<li class="flex items-center gap-[var(--space-3)] text-sm text-[var(--ink-muted)]">
					<span
						class="size-2 shrink-0 rounded-[var(--radius-full)]"
						style:background-color={pillar.accent}
						aria-hidden="true"
					></span>
					{pillar.label}
				</li>
			{/each}
		</ul>
	</div>
</div>
