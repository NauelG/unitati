<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PageStatusKey } from './page-tree.js';
	import { badge } from './StatusBadge.svelte';

	interface Props {
		status: PageStatusKey;
		class?: string;
	}

	let { status, class: className }: Props = $props();

	const label = $derived(
		status === 'draft'
			? m.knowledge_status_draft()
			: status === 'archived'
				? m.knowledge_status_archived()
				: m.knowledge_status_published()
	);
</script>

<span
	class={badge({
		tone: status === 'draft' ? 'warning' : status === 'published' ? 'success' : 'neutral',
		class: className
	})}
	data-page-status={status}>{label}</span
>
