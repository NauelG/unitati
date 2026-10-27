<script lang="ts">
	import CornerDownRight from '@lucide/svelte/icons/corner-down-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Flag from '@lucide/svelte/icons/flag';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Avatar from './Avatar.svelte';
	import type { BoardTask } from './board.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { formatDay } from '#lib/format-date.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';

	/** Avatars drawn before the rest collapse into a count. */
	const VISIBLE_ASSIGNEES = 3;

	interface Props {
		task: BoardTask;
		/**
		 * Every state but the card's own, for the "Move to" menu. Omit it and the
		 * card has no menu at all: a read-only board renders none, not a disabled one.
		 */
		moveTargets?: { id: string; name: string }[];
		onmove?: (stateId: string) => void;
	}

	let { task, moveTargets, onmove }: Props = $props();

	const shown = $derived(task.assignees.slice(0, VISIBLE_ASSIGNEES));
	const hidden = $derived(task.assignees.length - shown.length);
	/** Shown on a parent: a count of its children, never the children themselves (ADR 0055 §13). */
	const subtasks = $derived(
		task.subtasks && task.subtasks.total + task.subtasks.restricted > 0 ? task.subtasks : null
	);
</script>

<div
	class="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-3)] text-sm"
	data-task-card={task.taskTag}
>
	<div class="flex items-start justify-between gap-[var(--space-2)]">
		<a
			href="/tasks/{encodeURIComponent(task.taskTag)}"
			class="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
			style:view-transition-name={toViewTransitionName('record', task.taskTag)}
		>
			{task.taskTag}
		</a>
		{#if moveTargets && onmove}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="ut-transition-fast -mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
					aria-label={m.board_move_to_label({ tag: task.taskTag })}
					data-move-trigger
				>
					<Ellipsis class="size-4" aria-hidden="true" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-44">
					<DropdownMenu.Label>{m.board_move_to_heading()}</DropdownMenu.Label>
					{#each moveTargets as target (target.id)}
						<DropdownMenu.Item onSelect={() => onmove(target.id)}>{target.name}</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>

	<a
		href="/tasks/{encodeURIComponent(task.taskTag)}"
		class="font-medium text-[var(--ink)] hover:underline"
	>
		{task.title}
	</a>

	{#if task.parent || subtasks}
		<span class="flex flex-wrap items-center gap-[var(--space-2)] text-xs text-[var(--ink-muted)]">
			{#if task.parent}
				<a
					href="/tasks/{encodeURIComponent(task.parent.taskTag)}"
					class="inline-flex items-center gap-[var(--space-1)] font-mono hover:text-[var(--ink)]"
					aria-label={m.board_card_parent({ tag: task.parent.taskTag })}
					data-parent-chip
				>
					<CornerDownRight class="size-3 shrink-0" aria-hidden="true" />
					{task.parent.taskTag}
				</a>
			{/if}
			{#if subtasks}
				<span
					class="inline-flex items-center gap-[var(--space-1)] tabular-nums"
					title={m.board_card_subtasks({ completed: subtasks.completed, total: subtasks.total })}
					data-subtasks
				>
					<ListChecks class="size-3 shrink-0" aria-hidden="true" />
					<span class="sr-only"
						>{m.board_card_subtasks({ completed: subtasks.completed, total: subtasks.total })}</span
					>
					<span aria-hidden="true">{subtasks.completed}/{subtasks.total}</span>
					{#if subtasks.restricted > 0}
						<span
							title={m.board_card_subtasks_restricted({ count: subtasks.restricted })}
							data-subtasks-restricted
						>
							<span class="sr-only"
								>{m.board_card_subtasks_restricted({ count: subtasks.restricted })}</span
							>
							<span aria-hidden="true">+{subtasks.restricted}</span>
						</span>
					{/if}
				</span>
			{/if}
		</span>
	{/if}

	{#if task.milestoneName}
		<span class="flex items-center gap-[var(--space-1)] text-xs text-[var(--ink-muted)]">
			<Flag class="size-3 shrink-0" aria-hidden="true" />
			<span class="truncate" data-milestone-name>{task.milestoneName}</span>
		</span>
	{/if}

	<div class="flex items-center justify-between gap-[var(--space-2)] text-xs">
		{#if task.assignees.length > 0}
			<span class="flex items-center -space-x-1.5" data-assignees={task.assignees.length}>
				{#each shown as assignee (assignee.personId)}
					<Avatar name={assignee.fullName} size="sm" class="ring-2 ring-[var(--surface-1)]" />
				{/each}
				{#if hidden > 0}
					<span class="pl-2.5 text-[var(--ink-muted)]"
						>{m.board_card_assignees_more({ count: hidden })}</span
					>
				{/if}
			</span>
		{:else}
			<span class="text-[var(--ink-muted)]">{m.board_card_unassigned()}</span>
		{/if}
		{#if task.dueDate}
			<span class="text-[var(--ink-muted)] tabular-nums">{formatDay(task.dueDate)}</span>
		{/if}
	</div>
</div>
