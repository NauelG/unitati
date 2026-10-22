<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PageStatusKey } from './page-tree.js';
	import type { Tone } from './status.js';
	import { badge } from './StatusBadge.svelte';

	interface Props {
		status: PageStatusKey;
		class?: string;
	}

	let { status, class: className }: Props = $props();

	const PRESENTATION = {
		draft: { tone: 'warning', label: () => m.knowledge_status_draft() },
		published: { tone: 'success', label: () => m.knowledge_status_published() },
		archived: { tone: 'neutral', label: () => m.knowledge_status_archived() }
	} as const satisfies Record<PageStatusKey, { tone: Tone; label: () => string }>;

	const presentation = $derived(PRESENTATION[status]);
</script>

<span class={badge({ tone: presentation.tone, class: className })} data-page-status={status}
	>{presentation.label()}</span
>
