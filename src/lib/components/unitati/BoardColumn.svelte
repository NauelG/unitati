<script lang="ts">
	import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
	import Plus from '@lucide/svelte/icons/plus';
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { badge } from './StatusBadge.svelte';
	import { stateGroupBadge } from './status.js';
	import TaskCard from './TaskCard.svelte';
	import { resolveCollapsed, type BoardState, type BoardTask } from './board.js';
	import type { StatePreference } from '#lib/board-preference.js';
	import { MOTION_BASE_MS, prefersReducedMotion } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		state: BoardState;
		items: BoardTask[];
		/** Every state of the board, for each card's "Move to" menu. */
		states?: BoardState[];
		/** Menu, drag zone and quick create exist only when true — never disabled, absent. */
		editable?: boolean;
		/**
		 * The person's stored fold choice per state (#127). A state with no entry
		 * is folded when empty. Reading it is not a write: read-only boards use it too.
		 */
		collapsedStates?: Record<string, StatePreference>;
		/** The toggle in the header: the choice to store for this column. */
		ontogglecollapse?: (stateId: string, preference: StatePreference) => void;
		onconsider?: (items: BoardTask[], info: DndEvent<BoardTask>['info']) => void;
		onfinalize?: (items: BoardTask[], info: DndEvent<BoardTask>['info']) => void;
		onmove?: (taskId: string, stateId: string) => void;
		onquickcreate?: (stateId: string) => void;
	}

	let {
		state,
		items,
		states = [],
		editable = false,
		collapsedStates = {},
		ontogglecollapse,
		onconsider,
		onfinalize,
		onmove,
		onquickcreate
	}: Props = $props();

	/**
	 * A strip: by the person's choice, or — with none — when nothing is in it,
	 * not even a card hovering over it mid-drag.
	 */
	const collapsed = $derived(resolveCollapsed(state.id, items.length, collapsedStates));
	const bodyId = $derived(`board-column-body-${state.id}`);
	const tone = $derived(stateGroupBadge(state.group).tone);
	const flipDurationMs = $derived(prefersReducedMotion() ? 0 : MOTION_BASE_MS);
</script>

<section
	class="relative flex shrink-0 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] {collapsed
		? 'min-h-40 w-12 items-center'
		: 'w-72'}"
	data-board-column={state.id}
	data-collapsed={collapsed}
	data-tone={tone}
>
	<header
		class="relative z-10 flex items-center gap-[var(--space-2)] p-[var(--space-3)] {collapsed
			? 'flex-col'
			: 'justify-between'}"
	>
		<h3
			class="min-w-0 truncate text-small font-semibold text-[var(--ink)] {collapsed
				? '[writing-mode:vertical-rl]'
				: ''}"
			title={collapsed
				? items.length === 0
					? m.board_column_collapsed({ name: state.name })
					: `${state.name}, ${m.board_column_tasks({ count: items.length })}`
				: undefined}
		>
			{state.name}
		</h3>
		<span class="flex items-center gap-[var(--space-2)]">
			{#if !collapsed}
				<span class={badge({ tone, plain: true })}>{items.length}</span>
			{:else}
				<span class="text-xs text-[var(--ink-muted)] tabular-nums">{items.length}</span>
			{/if}
			<button
				type="button"
				class="ut-transition-fast grid size-6 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
				aria-label={collapsed
					? m.board_column_expand({ name: state.name })
					: m.board_column_collapse({ name: state.name })}
				aria-expanded={!collapsed}
				aria-controls={bodyId}
				data-collapse-toggle
				onclick={() => ontogglecollapse?.(state.id, collapsed ? 'expanded' : 'collapsed')}
			>
				{#if collapsed}
					<ChevronsRight class="size-4" aria-hidden="true" />
				{:else}
					<ChevronsLeft class="size-4" aria-hidden="true" />
				{/if}
			</button>
			{#if editable && onquickcreate}
				<button
					type="button"
					class="ut-transition-fast grid size-6 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
					aria-label={m.board_quick_create({ state: state.name })}
					onclick={() => onquickcreate(state.id)}
				>
					<Plus class="size-4" aria-hidden="true" />
				</button>
			{/if}
		</span>
	</header>

	{#if editable}
		<!--
			The drop zone is the list itself, and its direct children are the cards:
			the library treats every child as an item. A collapsed column stretches
			it over the whole strip so an empty column accepts a drop.
		-->
		<div
			class="flex flex-col gap-[var(--space-2)] p-[var(--space-2)] {collapsed
				? 'absolute inset-0 rounded-[var(--radius-lg)]'
				: 'min-h-16 flex-1'}"
			id={bodyId}
			aria-label={state.name}
			data-board-dropzone={state.id}
			use:dndzone={{
				items,
				flipDurationMs,
				dropTargetStyle: {},
				dropTargetClasses: ['ring-2', 'ring-[var(--brand)]']
			}}
			onconsider={(event) => onconsider?.(event.detail.items, event.detail.info)}
			onfinalize={(event) => onfinalize?.(event.detail.items, event.detail.info)}
		>
			{#each items as task (task.id)}
				<div
					animate:flip={{ duration: flipDurationMs }}
					hidden={collapsed}
					aria-label="{task.taskTag} {task.title}"
					data-task-id={task.id}
				>
					<TaskCard
						{task}
						moveTargets={states
							.filter((candidate) => candidate.id !== state.id)
							.map(({ id, name }) => ({ id, name }))}
						onmove={(stateId) => onmove?.(task.id, stateId)}
					/>
				</div>
			{/each}
		</div>
	{:else}
		<ul
			id={bodyId}
			hidden={collapsed}
			class="flex flex-1 flex-col gap-[var(--space-2)] p-[var(--space-2)]"
			aria-label={state.name}
		>
			{#each items as task (task.id)}
				<li data-task-id={task.id}><TaskCard {task} /></li>
			{/each}
		</ul>
	{/if}
</section>
