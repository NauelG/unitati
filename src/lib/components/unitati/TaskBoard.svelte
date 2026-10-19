<script lang="ts">
	import { tick } from 'svelte';
	import { setAriaStrings, TRIGGERS } from 'svelte-dnd-action';
	import BoardColumn from './BoardColumn.svelte';
	import {
		buildColumns,
		createBoardMover,
		moveLocally,
		neighboursOf,
		type BoardState,
		type BoardTask,
		type MoveRequest
	} from './board.js';
	import { boardAriaStrings } from './board-aria.js';
	import { storeBoardPreference, type StatePreference } from '#lib/board-preference.js';
	import { optimisticEnhance } from '#lib/optimistic.js';

	interface Props {
		states: BoardState[];
		tasks: BoardTask[];
		/**
		 * The viewer may move cards and open tasks from a column. False for an
		 * archived project and for an assigned-work viewer: the menu, the drop
		 * zones and the quick create are then absent from the DOM.
		 */
		editable?: boolean;
		/** The columns this person folded or unfolded by hand, by state (#127). */
		collapsedStates?: Record<string, StatePreference>;
		/** The `moveTask` action of the page that hosts the board. */
		action?: string;
		onquickcreate?: (stateId: string) => void;
	}

	let {
		states,
		tasks,
		editable = false,
		collapsedStates = {},
		action = '?/moveTask',
		onquickcreate
	}: Props = $props();

	// Written by drags and moves before the server confirms them, and replaced
	// by the next `load`: assigning to a `$derived` is the optimistic mirror.
	let columns = $derived(buildColumns(states, tasks));

	// What the person chose, shown at once; the cookie keeps it for the next visit.
	let folded = $derived(collapsedStates);

	function toggleCollapse(stateId: string, preference: StatePreference) {
		folded = { ...folded, [stateId]: preference };
		storeBoardPreference({ states: folded });
	}

	// The library's strings are global: set them where the board mounts.
	$effect(() => {
		setAriaStrings(boardAriaStrings());
		return () => setAriaStrings(null);
	});

	let root: HTMLElement | undefined = $state();
	let form: HTMLFormElement | undefined = $state();

	/** The one submit behind both triggers. The fields are written straight onto the form. */
	function submit(request: MoveRequest) {
		const target = form;
		if (!target) return;
		const set = (name: string, value: string | undefined) =>
			((target.elements.namedItem(name) as HTMLInputElement).value = value ?? '');
		set('taskId', request.taskId);
		set('stateId', request.stateId);
		set('before', request.before);
		set('after', request.after);
		target.requestSubmit();
	}

	const mover = createBoardMover(submit);

	/** The card is recreated in its new column: give focus back to its menu. */
	async function moveFromMenu(taskId: string, stateId: string) {
		mover.fromMenu(taskId, stateId);
		await tick();
		root?.querySelector<HTMLElement>(`[data-task-id="${taskId}"] [data-move-trigger]`)?.focus();
	}

	/** The optimistic half. A drop has already moved the card; a menu move has not. */
	function apply(formData: FormData) {
		const taskId = String(formData.get('taskId'));
		const stateId = String(formData.get('stateId'));
		const alreadyThere = columns
			.find((column) => column.state.id === stateId)
			?.items.some((item) => item.id === taskId);
		if (!alreadyThere) columns = moveLocally(columns, taskId, stateId);

		// The server never changed, so what it last sent is the way back.
		return () => {
			columns = buildColumns(states, tasks);
		};
	}

	/** Where each card sat when the drag began: a drop back in place submits nothing. */
	/** True from the moment a card is picked up until it lands or is released. */
	let dragging = $state(false);

	let origin: { taskId: string; stateId: string; before?: string; after?: string } | null = null;

	function consider(stateId: string, items: BoardTask[], info: { id: string; trigger: string }) {
		if (info.trigger === TRIGGERS.DRAG_STARTED) {
			dragging = true;
			origin = { taskId: info.id, stateId, ...neighboursOf(items, info.id) };
		}
		setColumn(stateId, items);
	}

	function finalize(stateId: string, items: BoardTask[], info: { id: string; trigger: string }) {
		setColumn(stateId, items);
		dragging = false;
		// Only the zone the card landed in submits; the one it left, and a drop
		// outside every zone, just settle.
		if (info.trigger !== TRIGGERS.DROPPED_INTO_ZONE || !items.some((i) => i.id === info.id)) return;

		const landed = neighboursOf(items, info.id);
		const unmoved =
			origin?.taskId === info.id &&
			origin.stateId === stateId &&
			origin.before === landed.before &&
			origin.after === landed.after;
		origin = null;
		if (!unmoved) mover.fromDrop(info.id, stateId, items);
	}

	function setColumn(stateId: string, items: BoardTask[]) {
		columns = columns.map((column) =>
			column.state.id === stateId
				? { state: column.state, items: items.map((item) => ({ ...item, stateId })) }
				: column
		);
	}
</script>

<div
	bind:this={root}
	class="flex items-start gap-[var(--space-3)] overflow-x-auto pb-[var(--space-2)]"
>
	{#each columns as column (column.state.id)}
		<BoardColumn
			state={column.state}
			items={column.items}
			{states}
			{editable}
			collapsedStates={folded}
			{dragging}
			ontogglecollapse={toggleCollapse}
			onconsider={(items, info) => consider(column.state.id, items, info)}
			onfinalize={(items, info) => finalize(column.state.id, items, info)}
			onmove={moveFromMenu}
			{onquickcreate}
		/>
	{/each}
</div>

{#if editable}
	<form bind:this={form} method="POST" {action} use:optimisticEnhance={apply} hidden>
		<input type="hidden" name="taskId" />
		<input type="hidden" name="stateId" />
		<input type="hidden" name="before" />
		<input type="hidden" name="after" />
	</form>
{/if}
