<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The page tree of a knowledge space (ADR 0031): a WAI-ARIA tree of links, one
	 * per page, nested by parent. Reading is the default; with `editable` the same
	 * rows reorder and nest, by keyboard (Alt + arrows) or by drag.
	 */
	export const pageTree = tv({
		slots: {
			root: 'flex flex-col gap-[var(--space-1)] text-[var(--ink)]',
			group: 'm-0 flex list-none flex-col gap-[2px] p-0',
			row: [
				'group relative flex min-h-[var(--size-row-compact)] items-center gap-[var(--space-1)]',
				'rounded-[var(--radius-md)] pr-[var(--space-2)] hover:bg-[var(--surface-2)]'
			],
			toggle: [
				'inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
				'text-[var(--ink-muted)] hover:text-[var(--ink)]'
			],
			link: [
				'flex min-w-0 flex-1 items-center gap-[var(--space-2)] py-[var(--space-1)]',
				'rounded-[var(--radius-sm)] text-label outline-none',
				'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
			],
			title: 'truncate',
			empty: 'px-[var(--space-2)] py-[var(--space-3)] text-small text-[var(--ink-muted)]',
			hint: 'px-[var(--space-2)] text-small text-[var(--ink-muted)]'
		},
		variants: {
			current: { true: { row: 'bg-[var(--knowledge-soft)]', link: 'font-medium' } },
			archived: { true: { title: 'text-[var(--ink-muted)] line-through' } },
			dragging: { true: { row: 'opacity-50' } }
		}
	});
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { m } from '#lib/paraglide/messages.js';
	import PageStatusBadge from './PageStatusBadge.svelte';
	import {
		ancestorIds,
		buildTree,
		dropZone,
		intentForDrop,
		intentForKey,
		visibleRows,
		type DropZone,
		type MoveKey,
		type PageTreeEntry,
		type PageTreeIntent,
		type PageTreeNode,
		type PageTreePlacement
	} from './page-tree.js';

	interface Props {
		/** Every page of the space, ordered `(parent, position)`, as the domain returns them. */
		entries: PageTreeEntry[];
		/** The page being read: highlighted, and the tree opens on it. */
		currentId?: string;
		/** Accessible name of the tree. */
		label: string;
		/** Where a page's link goes. */
		href: (entry: PageTreeEntry) => string;
		/** Rows reorder and nest. Off for a read-only tree. */
		editable?: boolean;
		/** Open every branch at first, instead of only the path to `currentId`. */
		expandAll?: boolean;
		/** The page now sits before or after one of its siblings. */
		onreorder?: (id: string, placement: PageTreePlacement) => void;
		/** The page changes parent, optionally next to a sibling of the new parent. */
		onmove?: (id: string, parentId: string | null, placement?: PageTreePlacement) => void;
		class?: string;
	}

	let {
		entries,
		currentId,
		label,
		href,
		editable = false,
		expandAll = false,
		onreorder,
		onmove,
		class: className
	}: Props = $props();

	const styles = pageTree();
	const roots = $derived(buildTree(entries));

	// What the person opened or closed by hand wins over the initial state.
	let toggled = $state<Record<string, boolean>>({});
	const initiallyOpen = $derived([
		...(expandAll ? entries.map((entry) => entry.id) : []),
		...(currentId ? [currentId, ...ancestorIds(entries, currentId)] : [])
	]);
	const expanded = $derived(
		new Set(
			entries
				.map((entry) => entry.id)
				.filter((id) => (id in toggled ? toggled[id] : initiallyOpen.includes(id)))
		)
	);
	const rows = $derived(visibleRows(roots, expanded));

	// Roving tabindex: one stop in the tree, arrow keys move inside it.
	let focusId = $state<string | null>(null);
	const tabbableId = $derived(
		rows.some((row) => row.node.id === focusId)
			? focusId
			: rows.some((row) => row.node.id === currentId)
				? (currentId ?? null)
				: (rows[0]?.node.id ?? null)
	);

	let rootElement: HTMLElement | undefined = $state();

	function toggle(id: string) {
		toggled[id] = !expanded.has(id);
	}

	async function focusRow(id: string) {
		focusId = id;
		await tick();
		rootElement?.querySelector<HTMLElement>(`[data-page-link="${CSS.escape(id)}"]`)?.focus();
	}

	function perform(intent: PageTreeIntent) {
		if (intent.kind === 'reorder') onreorder?.(intent.id, intent.placement);
		else onmove?.(intent.id, intent.parentId, intent.placement);
	}

	const ALT_KEYS: Record<string, MoveKey> = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowRight: 'indent',
		ArrowLeft: 'outdent'
	};

	async function onkeydown(event: KeyboardEvent, id: string) {
		const index = rows.findIndex((row) => row.node.id === id);
		if (index === -1) return;
		const { node, parent } = rows[index];

		if (event.altKey && editable && ALT_KEYS[event.key]) {
			event.preventDefault();
			const intent = intentForKey(roots, id, ALT_KEYS[event.key]);
			if (!intent) return;
			// An indent opens the new parent, so the page does not vanish from view.
			if (intent.kind === 'move' && intent.parentId) toggled[intent.parentId] = true;
			perform(intent);
			await focusRow(id);
			return;
		}
		if (event.altKey || event.ctrlKey || event.metaKey) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (index < rows.length - 1) await focusRow(rows[index + 1].node.id);
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (index > 0) await focusRow(rows[index - 1].node.id);
				break;
			case 'ArrowRight':
				event.preventDefault();
				if (node.children.length === 0) break;
				if (!expanded.has(id)) toggle(id);
				else await focusRow(node.children[0].id);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				if (node.children.length > 0 && expanded.has(id)) toggle(id);
				else if (parent) await focusRow(parent.id);
				break;
			case 'Home':
				event.preventDefault();
				await focusRow(rows[0].node.id);
				break;
			case 'End':
				event.preventDefault();
				await focusRow(rows[rows.length - 1].node.id);
				break;
		}
	}

	let draggingId = $state<string | null>(null);
	let over = $state<{ id: string; zone: DropZone } | null>(null);

	function ondragstart(event: DragEvent, id: string) {
		draggingId = id;
		event.dataTransfer?.setData('text/plain', id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function ondragover(event: DragEvent, id: string) {
		if (!draggingId) return;
		const zone = dropZone(
			event.clientY - (event.currentTarget as HTMLElement).getBoundingClientRect().top,
			(event.currentTarget as HTMLElement).getBoundingClientRect().height
		);
		if (!intentForDrop(roots, draggingId, id, zone)) {
			over = null;
			return;
		}
		event.preventDefault();
		over = { id, zone };
	}

	function ondrop(event: DragEvent, id: string) {
		event.preventDefault();
		const zone = over?.id === id ? over.zone : 'inside';
		const intent = draggingId ? intentForDrop(roots, draggingId, id, zone) : null;
		draggingId = null;
		over = null;
		if (!intent) return;
		if (intent.kind === 'move' && intent.parentId) toggled[intent.parentId] = true;
		perform(intent);
	}

	function ondragend() {
		draggingId = null;
		over = null;
	}
</script>

{#snippet branch(nodes: PageTreeNode[], level: number)}
	{#each nodes as node (node.id)}
		{@const open = expanded.has(node.id)}
		{@const hasChildren = node.children.length > 0}
		{@const row = pageTree({
			current: node.id === currentId,
			archived: node.status === 'archived',
			dragging: draggingId === node.id
		})}
		<li
			role="treeitem"
			aria-level={level}
			aria-expanded={hasChildren ? open : undefined}
			aria-selected={node.id === currentId}
			aria-current={node.id === currentId ? 'page' : undefined}
			data-page-id={node.id}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={row.row()}
				style:padding-left="calc({level - 1} * var(--space-4))"
				style:box-shadow={over?.id === node.id
					? over.zone === 'before'
						? 'inset 0 2px 0 var(--brand)'
						: over.zone === 'after'
							? 'inset 0 -2px 0 var(--brand)'
							: 'inset 0 0 0 2px var(--brand)'
					: undefined}
				draggable={editable}
				ondragstart={(event) => ondragstart(event, node.id)}
				ondragover={(event) => ondragover(event, node.id)}
				ondrop={(event) => ondrop(event, node.id)}
				{ondragend}
			>
				{#if hasChildren}
					<button
						type="button"
						class={row.toggle()}
						tabindex="-1"
						aria-label={open
							? m.knowledge_tree_collapse({ title: node.title })
							: m.knowledge_tree_expand({ title: node.title })}
						onclick={() => toggle(node.id)}
					>
						<ChevronRight
							class="size-4 transition-transform {open ? 'rotate-90' : ''}"
							aria-hidden="true"
						/>
					</button>
				{:else}
					<span class="size-6 shrink-0" aria-hidden="true"></span>
				{/if}
				<a
					class={row.link()}
					href={href(node)}
					data-page-link={node.id}
					tabindex={tabbableId === node.id ? 0 : -1}
					onfocus={() => (focusId = node.id)}
					onkeydown={(event) => onkeydown(event, node.id)}
				>
					<span class={row.title()}>{node.title}</span>
					{#if node.status !== 'published'}
						<PageStatusBadge status={node.status} />
					{/if}
				</a>
			</div>
			{#if hasChildren && open}
				<ul role="group" class={styles.group()}>
					{@render branch(node.children, level + 1)}
				</ul>
			{/if}
		</li>
	{/each}
{/snippet}

<div class={styles.root({ class: className })} bind:this={rootElement}>
	{#if roots.length === 0}
		<p class={styles.empty()}>{m.knowledge_tree_empty()}</p>
	{:else}
		<ul role="tree" aria-label={label} class={styles.group()}>
			{@render branch(roots, 1)}
		</ul>
		{#if editable}
			<p class={styles.hint()}>{m.knowledge_tree_hint()}</p>
		{/if}
	{/if}
</div>
