<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { badge } from './StatusBadge.svelte';
	import { stateGroupBadge } from './status.js';
	import TaskCard from './TaskCard.svelte';
	import type { BoardState, BoardTask } from './board.js';
	import { MOTION_BASE_MS, prefersReducedMotion } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		state: BoardState;
		items: BoardTask[];
		/** Every state of the board, for each card's "Move to" menu. */
		states?: BoardState[];
		/** Menu, drag zone and quick create exist only when true — never disabled, absent. */
		editable?: boolean;
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
		onconsider,
		onfinalize,
		onmove,
		onquickcreate
	}: Props = $props();

	/** A column with nothing in it — not even a card hovering over it mid-drag — is a strip. */
	const collapsed = $derived(items.length === 0);
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
			class="min-w-0 truncate text-[13px] leading-[18px] font-semibold text-[var(--ink)] {collapsed
				? '[writing-mode:vertical-rl]'
				: ''}"
			title={collapsed ? m.board_column_collapsed({ name: state.name }) : undefined}
		>
			{state.name}
		</h3>
		<span class="flex items-center gap-[var(--space-2)]">
			{#if !collapsed}
				<span class={badge({ tone, plain: true })}>{items.length}</span>
			{:else}
				<span class="text-xs text-[var(--ink-muted)] tabular-nums">0</span>
			{/if}
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
	{:else if !collapsed}
		<ul
			class="flex flex-1 flex-col gap-[var(--space-2)] p-[var(--space-2)]"
			aria-label={state.name}
		>
			{#each items as task (task.id)}
				<li data-task-id={task.id}><TaskCard {task} /></li>
			{/each}
		</ul>
	{/if}
</section>
