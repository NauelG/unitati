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
		class?: string;
	}

	let { environment, class: className }: Props = $props();

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
		class={badge({ tone: presentation.tone, class: className })}
		title={m.env_notice()}
		data-environment={environment}
	>
		{presentation.label}
	</span>
{/if}
