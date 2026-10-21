<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import { handoverDirectionLabel } from '#lib/components/unitati/handover-state.js';
	import HandoverStateBadge from '#lib/components/unitati/HandoverStateBadge.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { formatDateTime } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{documentTitle(m.portal_handovers_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.portal_handovers_title()}>
		{#snippet summary()}{m.portal_handovers_lede()}{/snippet}
	</PageHeader>

	<div class="mt-[var(--space-6)]">
		{#if data.handovers.length === 0}
			<EmptyState description={m.portal_handovers_empty()} />
		{:else}
			<ul
				class="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
			>
				{#each data.handovers as handover (handover.id)}
					<li
						class="flex flex-wrap items-center justify-between gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)]"
					>
						<div class="min-w-0 space-y-1">
							<p class="flex items-center gap-[var(--space-2)] text-sm">
								<span class="font-mono text-xs">{handover.code}</span>
								<span>{handoverDirectionLabel(handover.direction)}</span>
								<HandoverStateBadge state={handover.state} />
							</p>
							<p class="text-small text-[var(--ink-muted)]">
								{formatDateTime(handover.issuedAt)}
							</p>
							{#if handover.state === 'pending' || handover.state === 'expired'}
								<p class="text-small text-[var(--ink-muted)]">{m.portal_handovers_awaiting()}</p>
							{/if}
						</div>
						{#if handover.hasDocument}
							<Button
								href="/handover-documents/{handover.id}"
								variant="secondary"
								data-sveltekit-reload
							>
								{m.portal_handovers_download()}
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</PageLayout>
