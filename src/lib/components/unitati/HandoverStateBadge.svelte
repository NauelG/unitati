<script lang="ts">
	import type { HandoverState } from '#lib/domain/handover.js';
	import { handoverStateBadge } from './handover-state.js';
	import { badge } from './StatusBadge.svelte';

	interface Props {
		state: HandoverState;
		class?: string;
	}

	let { state, class: className }: Props = $props();

	const resolved = $derived(handoverStateBadge(state));
</script>

<span class={badge({ tone: resolved.tone, class: className })}
	><span class="min-w-0 truncate">{resolved.label}</span></span
>
