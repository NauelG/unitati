<script lang="ts">
	import { isProduction, type AppEnvironment } from '#lib/environment.js';
	import { m } from '#lib/paraglide/messages.js';
	import { badge } from './StatusBadge.svelte';

	interface Props {
		/**
		 * Where the build runs. Production renders nothing at all: the badge exists to say "this is
		 * not the real thing", and showing it everywhere would say nothing.
		 */
		environment: AppEnvironment;
		/**
		 * Float fixed in the bottom-right corner above everything (`--z-env-badge`), click-through.
		 * Mounted once in the root layout. Turn it off only to show the badge inline (gallery).
		 */
		floating?: boolean;
		class?: string;
	}

	let { environment, floating = true, class: className }: Props = $props();

	// Two different non-production places, two different tones: a developer machine and the shared
	// staging host must not be mistaken for each other on a screenshot.
	const presentation = $derived(
		environment === 'staging'
			? { tone: 'warning' as const, label: m.env_staging() }
			: { tone: 'desk' as const, label: m.env_development() }
	);
</script>

{#if !isProduction(environment)}
	<span
		role="status"
		aria-label="{m.env_notice()}: {presentation.label}"
		class={badge({
			tone: presentation.tone,
			class: [
				floating &&
					'pointer-events-none fixed right-[max(var(--space-3),env(safe-area-inset-right))] bottom-[max(var(--space-3),env(safe-area-inset-bottom))] z-[var(--z-env-badge)] shadow-[0_2px_8px_rgb(0_0_0/0.18)]',
				className
			]
		})}
		data-environment={environment}
	>
		{presentation.label}
	</span>
{/if}
