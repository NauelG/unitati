<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import PageTree from '#lib/components/unitati/PageTree.svelte';
	import type { PageTreeEntry, PageTreePlacement } from '#lib/components/unitati/page-tree.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		entries: PageTreeEntry[];
		spaceId: string;
		spaceName: string;
		currentId?: string;
		expandAll?: boolean;
	}

	let { entries, spaceId, spaceName, currentId, expandAll = false }: Props = $props();

	/**
	 * `PageTree` only says what the person meant; this is where it becomes a POST.
	 * Both writes go through the screen's own `?/reorder` and `?/move` actions, so
	 * the domain decides (cycles, drafts) and a refusal is shown, never swallowed.
	 */
	let refusal = $state<string | null>(null);
	let reorderForm: HTMLFormElement | undefined = $state();
	let moveForm: HTMLFormElement | undefined = $state();
	let fields = $state({ id: '', parentId: '', placement: '', anchorId: '' });

	function placementFields(placement?: PageTreePlacement) {
		if (!placement) return { placement: '', anchorId: '' };
		return 'before' in placement
			? { placement: 'before', anchorId: placement.before }
			: { placement: 'after', anchorId: placement.after };
	}

	async function onreorder(id: string, placement: PageTreePlacement) {
		fields = { id, parentId: '', ...placementFields(placement) };
		await tick();
		reorderForm?.requestSubmit();
	}

	async function onmove(id: string, parentId: string | null, placement?: PageTreePlacement) {
		fields = { id, parentId: parentId ?? '', ...placementFields(placement) };
		await tick();
		moveForm?.requestSubmit();
	}

	const submit = () => {
		refusal = null;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: (options?: { reset?: boolean }) => Promise<void>;
		}) => {
			if (result.type === 'failure') {
				refusal = (result.data?.message as string | undefined) ?? null;
				return;
			}
			await update({ reset: false });
		};
	};
</script>

{#if refusal}
	<Alert tone="danger" dismissible>{refusal}</Alert>
{/if}

<PageTree
	{entries}
	{currentId}
	{expandAll}
	editable
	label={m.knowledge_tree_label({ space: spaceName })}
	href={(entry) => `/knowledge/${entry.tag}`}
	{onreorder}
	{onmove}
/>

<form method="POST" action="?/reorder" bind:this={reorderForm} use:enhance={submit} hidden>
	<input type="hidden" name="id" value={fields.id} />
	<input type="hidden" name="placement" value={fields.placement} />
	<input type="hidden" name="anchorId" value={fields.anchorId} />
</form>
<form method="POST" action="?/move" bind:this={moveForm} use:enhance={submit} hidden>
	<input type="hidden" name="id" value={fields.id} />
	<input type="hidden" name="spaceId" value={spaceId} />
	<input type="hidden" name="parentId" value={fields.parentId} />
	<input type="hidden" name="placement" value={fields.placement} />
	<input type="hidden" name="anchorId" value={fields.anchorId} />
</form>
