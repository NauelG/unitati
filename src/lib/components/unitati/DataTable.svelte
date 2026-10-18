<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import { tv } from '#lib/tv.js';

	export interface DataTableColumn<Row> {
		/** Identifies the column for sorting; not a property path. */
		key: string;
		header: string;
		/** `end` for numbers, which the design system sets in tabular figures. */
		align?: 'start' | 'end';
		/** Sorting is announced, never performed: see the note on `sort`. */
		sortable?: boolean;
		/**
		 * `actions`: a column of controls (an Archive button) rather than data. Its
		 * cells sit above the row's stretched link (`relative z-10`), align to the
		 * end, keep the header as screen-reader text only, and stay out of `rowLabel`.
		 */
		kind?: 'actions';
		/**
		 * The title cell (second column) truncates at 48ch with the full text in a
		 * `title` tooltip. `false` for the rare table that wants it to wrap in full.
		 */
		truncateTitle?: boolean;
		/** Renders the cell. Without it the row's own `cell` snippet is used. */
		cell?: Snippet<[Row]>;
	}

	export interface DataTableSort {
		key: string;
		direction: 'asc' | 'desc';
	}

	/**
	 * The `.ut-table` panel: the chrome lives on the wrapper so the header can be
	 * a flat surface-2 band with no rounded corners of its own.
	 */
	export const dataTable = tv({
		slots: {
			// No `overflow-hidden` here: that would establish this element as the
			// sticky header's scrolling ancestor instead of `main` (#86) — a
			// header that "sticks" to a box that never itself scrolls just sits
			// still, which looks identical to not being sticky at all. Horizontal
			// overflow still needs a container, so only the x-axis gets one; the
			// y-axis stays `visible` so stickiness resolves against `main`.
			panel:
				'w-full overflow-x-auto overflow-y-visible rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]',
			table: 'w-full border-separate border-spacing-0 text-sm',
			head: [
				'sticky top-0 z-10 h-8 px-[var(--space-3)] py-0 text-left align-middle',
				'text-caption text-[var(--ink-muted)]',
				'bg-[var(--surface-2)] border-b border-[var(--border)]'
			],
			// `py-0` undoes the vendored cell's `p-2`, whose vertical padding would
			// otherwise add to the row height the design system fixes at 40px. The
			// row rule comes from `ui/table`'s own `border-b`, not from here: two
			// borders on the same edge draw a 2px line.
			cell: 'px-[var(--space-3)] py-0 align-middle whitespace-nowrap'
		},
		variants: {
			compact: {
				true: { cell: 'h-[var(--size-row-compact)]' },
				false: { cell: 'h-[var(--size-row)]' }
			},
			// Rounds the header/body corners by hand instead of clipping them with
			// `overflow-hidden` on `panel`, which the sticky header above needs to
			// avoid. Applied to whichever cell is visually first/last in its row.
			corner: {
				'top-start': { head: 'rounded-tl-[var(--radius-lg)]' },
				'top-end': { head: 'rounded-tr-[var(--radius-lg)]' },
				'bottom-start': { cell: 'rounded-bl-[var(--radius-lg)]' },
				'bottom-end': { cell: 'rounded-br-[var(--radius-lg)]' },
				none: {}
			},
			align: {
				start: {},
				end: {
					head: 'text-right',
					cell: 'text-right [font-variant-numeric:tabular-nums]'
				}
			},
			/**
			 * The design system reads the first column as the record code in mono
			 * and the second as the title in strong. It is positional there, so it
			 * is positional here. A variant and not a hand-built string: every
			 * class in this folder comes out of `tv()`.
			 */
			emphasis: {
				code: {
					cell: 'font-mono text-record-id [font-variant-numeric:tabular-nums] text-[var(--ink)]'
				},
				title: { cell: 'font-medium text-[var(--ink)]' },
				// `max-w` only bites on a table cell with `truncate`'s `overflow-hidden`.
				'title-truncated': { cell: 'max-w-[48ch] truncate font-medium text-[var(--ink)]' },
				muted: { cell: 'text-[var(--ink-muted)]' }
			},
			/** Above the row's stretched link, like the selection checkbox. */
			actions: { true: { cell: 'relative z-10' }, false: {} }
		},
		defaultVariants: {
			compact: false,
			align: 'start',
			emphasis: 'muted',
			corner: 'none',
			actions: false
		}
	});

	/** Rows painted while loading with no previous rows to size the skeleton by. */
	export const SKELETON_ROWS = 10;

	/** Position decides the emphasis, exactly as the design system assigns it. */
	export function emphasisFor(
		index: number,
		truncateTitle = true
	): 'code' | 'title' | 'title-truncated' | 'muted' {
		if (index === 0) return 'code';
		if (index === 1) return truncateTitle ? 'title-truncated' : 'title';
		return 'muted';
	}
</script>

<script lang="ts" generics="Row">
	import type { LucideIcon } from '@lucide/svelte';
	import { flip } from 'svelte/animate';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Table from '#lib/components/ui/table/index.js';
	import DataTableSkeleton from './DataTableSkeleton.svelte';
	import EmptyState from './EmptyState.svelte';
	import { MOTION_BASE_MS, toViewTransitionName } from '#lib/motion.js';
	import { activeScope } from '#lib/keymap.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		columns: DataTableColumn<Row>[];
		rows: Row[];
		/** Stable identity per row: the key for `{#each}` and for selection. */
		rowKey: (row: Row) => string;
		/**
		 * Names the row for its selection checkbox. Without it the checkbox is
		 * announced as the row key, which is usually an id and tells nobody which
		 * row they are ticking.
		 */
		rowLabel?: (row: Row) => string;
		/** Turns the first cell into the row's link. Omit for a table that is not a list of records. */
		href?: (row: Row) => string;
		/** Presence enables the checkbox column. Bind it to read the selection. */
		selected?: string[];
		/**
		 * Roving focus (#88): which row the `ArrowUp`/`ArrowDown` grammar and
		 * the keymap's row-level verbs (`a`/`e`/`l`/`s`…) act on. Bind it to read
		 * which row is active, or to drive the verbs from the page that owns
		 * what those letters mean — `DataTable` itself has no opinion on that.
		 */
		activeKey?: string | null;
		/**
		 * Current sort, for the header's `aria-sort` and affordance. The table
		 * never reorders `rows`: ordering belongs to whoever fetched them, and
		 * #7 gives that a server-side contract. Bind it and re-query.
		 */
		sort?: DataTableSort;
		compact?: boolean;
		/**
		 * Swaps the body for skeleton rows and keeps the header, so the layout does
		 * not jump while a new page loads. Pass `navigating.to` pointing at this route.
		 */
		loading?: boolean;
		/** One sentence. Shown instead of an empty grid, which tells nobody anything. */
		emptyMessage: string;
		/** Above the sentence, for the "no data yet" shape — omit for a flatter "no results" shape. */
		emptyTitle?: string;
		/** A Lucide icon for the empty grid's soft disc. */
		emptyIcon?: LucideIcon;
		/** The primary action that resolves the emptiness, usually a Button. */
		emptyAction?: Snippet;
		/** A keyboard shortcut hint next to the empty action — see `EmptyState`. */
		emptyKbdHint?: Snippet;
		class?: string;
	}

	let {
		columns,
		rows,
		rowKey,
		rowLabel,
		href,
		selected = $bindable(),
		activeKey = $bindable(null),
		sort = $bindable(),
		compact = false,
		loading = false,
		emptyMessage,
		emptyTitle,
		emptyIcon,
		emptyAction,
		emptyKbdHint,
		class: className
	}: Props = $props();

	const selectable = $derived(selected !== undefined);
	const styles = $derived(dataTable({ compact }));

	/** The row whose link/checkbox gets `tabindex="0"` — a roving-focus grid has exactly one. */
	const tabbableKey = $derived(activeKey ?? (rows.length > 0 ? rowKey(rows[0]) : null));

	/** The anchor (or, link-less, the row) each row's primary focusable element binds to. */
	const focusTargets: Record<string, HTMLElement> = {};

	function toggle(key: string) {
		const current = selected ?? [];
		selected = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
	}

	/** `focusin` bubbles, so one listener on the panel tracks which row is active. */
	function onFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement | null;
		const key = target?.closest<HTMLElement>('[data-row-key]')?.dataset.rowKey;
		if (key) activeKey = key;
		activeScope.set('list');
	}

	function onFocusOut() {
		activeScope.set('global');
	}

	/**
	 * `ArrowUp`/`ArrowDown` move the roving tab stop; `Enter` is left to the
	 * browser's native anchor activation (focus already sits on the row's own
	 * `<a>`). `x` toggles the focused row's selection — the keyboard path to
	 * the checkbox `toggle()` already wires up for the mouse.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (rows.length === 0) return;
		const currentIndex = rows.findIndex((row) => rowKey(row) === tabbableKey);

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			const delta = event.key === 'ArrowDown' ? 1 : -1;
			const nextIndex = Math.min(Math.max(currentIndex + delta, 0), rows.length - 1);
			const nextKey = rowKey(rows[nextIndex]);
			activeKey = nextKey;
			focusTargets[nextKey]?.focus();
			event.preventDefault();
			return;
		}

		if (event.key.toLowerCase() === 'x' && selectable && currentIndex >= 0) {
			toggle(rowKey(rows[currentIndex]));
			event.preventDefault();
		}
	}

	/** A truncated title keeps its full text one hover away. Read from the DOM: a cell is a snippet. */
	function fullTextTooltip(node: HTMLElement) {
		const text = node.textContent?.trim();
		if (text) node.title = text;
	}

	/** An actions column is always end-aligned, whatever `align` says. */
	function alignOf(column: DataTableColumn<Row>): 'start' | 'end' {
		return column.kind === 'actions' ? 'end' : (column.align ?? 'start');
	}

	function nextSort(key: string): DataTableSort {
		const flipped = sort?.key === key && sort.direction === 'asc';
		return { key, direction: flipped ? 'desc' : 'asc' };
	}

	function ariaSort(key: string) {
		if (sort?.key !== key) return 'none' as const;
		return sort.direction === 'asc' ? ('ascending' as const) : ('descending' as const);
	}

	/** Two arrows while unsorted, one once this column is the sort. */
	function sortIcon(key: string) {
		if (sort?.key !== key) return ChevronsUpDown;
		return sort.direction === 'asc' ? ChevronUp : ChevronDown;
	}
</script>

<div class={styles.panel({ class: className })} aria-busy={loading || undefined}>
	{#if rows.length === 0 && !loading}
		<EmptyState
			title={emptyTitle}
			description={emptyMessage}
			icon={emptyIcon}
			action={emptyAction}
			kbdHint={emptyKbdHint}
		/>
	{:else}
		<Table.Root
			class={styles.table()}
			onkeydown={onKeydown}
			onfocusin={onFocusIn}
			onfocusout={onFocusOut}
		>
			<Table.Header>
				<Table.Row class="hover:bg-transparent">
					{#if selectable}
						<Table.Head
							class={styles.head({
								class: 'w-10',
								corner: columns.length === 0 ? 'top-start' : 'none'
							})}
						>
							<span class="sr-only">{m.table_select_column()}</span>
						</Table.Head>
					{/if}

					{#each columns as column, index (column.key)}
						{@const isFirst = index === 0 && !selectable}
						{@const isLast = index === columns.length - 1}
						<Table.Head
							class={styles.head({
								align: alignOf(column),
								corner: isFirst ? 'top-start' : isLast ? 'top-end' : 'none'
							})}
							aria-sort={column.sortable ? ariaSort(column.key) : undefined}
						>
							{#if column.kind === 'actions'}
								<span class="sr-only">{column.header}</span>
							{:else if column.sortable}
								{@const SortIcon = sortIcon(column.key)}
								<button
									type="button"
									class="ut-transition-fast inline-flex items-center gap-1 transition-colors hover:text-[var(--ink)]"
									onclick={() => (sort = nextSort(column.key))}
								>
									{column.header}
									<SortIcon aria-hidden="true" class="size-3.5" />
								</button>
							{:else}
								{column.header}
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>

			{#if loading}
				<DataTableSkeleton
					embedded
					columns={columns.length + (selectable ? 1 : 0)}
					rows={rows.length || SKELETON_ROWS}
					{compact}
				/>
			{:else}
				<Table.Body>
					{#each rows as row, rowIndex (rowKey(row))}
						{@const key = rowKey(row)}
						{@const isSelected = selected?.includes(key) ?? false}
						{@const isLastRow = rowIndex === rows.length - 1}
						<!--
						List physics (#87): `animate:flip` glides a row to its new position
						when `rows` reorders without adding or removing — a sort toggle, say
						— instead of teleporting it there. A Svelte directive only attaches
						to a real DOM element, never to a component, so this is a plain `<tr>`
						instead of `Table.Row` (ADR 0011: compose around the vendored
						primitive rather than hand-edit it) — `border-b`/`data-slot` below
						replicate exactly what that primitive would otherwise have supplied.
						`animate-in fade-in` is this component's first real `tw-animate-css`
						import: a page swap (a new search, a new page of results) still
						replaces the whole row set, so each new row fades in rather than
						popping in instantly.
					-->
						<tr
							data-slot="table-row"
							data-row-key={key}
							animate:flip={{ duration: MOTION_BASE_MS }}
							class="relative animate-in border-b border-[var(--border)] transition-colors duration-[var(--motion-base)] fade-in last:border-b-0 hover:bg-[var(--surface-2)] aria-selected:bg-[var(--brand-soft)]"
							aria-selected={selectable ? isSelected : undefined}
						>
							{#if selectable}
								<Table.Cell
									class={styles.cell({
										corner: isLastRow && columns.length === 0 ? 'bottom-start' : 'none'
									})}
								>
									<!-- The label is the hit target (32 × 32); `aria-label` stays the name. -->
									<label class="relative z-10 grid size-8 place-items-center">
										<input
											type="checkbox"
											class="size-4 accent-[var(--brand)]"
											checked={isSelected}
											onchange={() => toggle(key)}
											aria-label={rowLabel?.(row) ?? key}
										/>
									</label>
								</Table.Cell>
							{/if}

							{#each columns as column, index (column.key)}
								{@const isFirst = index === 0 && !selectable}
								{@const isLast = index === columns.length - 1}
								{@const emphasis = emphasisFor(index, column.truncateTitle ?? true)}
								<Table.Cell
									translate={emphasis === 'code' ? 'no' : undefined}
									{@attach emphasis === 'title-truncated' ? fullTextTooltip : undefined}
									class={styles.cell({
										align: alignOf(column),
										actions: column.kind === 'actions',
										emphasis,
										corner: isLastRow
											? isFirst
												? 'bottom-start'
												: isLast
													? 'bottom-end'
													: 'none'
											: 'none'
									})}
								>
									{#if index === 0 && href}
										<!-- One real link per row, stretched over the row so a pointer can
									     click anywhere. The checkbox is lifted above it; any other
									     interactive control in a cell would sit underneath, which is
									     why a table with a row `href` keeps its cells inert.

									     S1, the record morph (#87): this is the code/tag cell, named
									     `record-{key}` so the detail page's own code chip — carrying
									     the identical name — can claim the same view-transition group
									     and visually travel into place on navigation. -->
										<a
											href={href(row)}
											tabindex={key === tabbableKey ? 0 : -1}
											style:view-transition-name={toViewTransitionName('record', key)}
											class="scroll-mt-[var(--size-row)] after:absolute after:inset-0 hover:underline focus-visible:underline"
											{@attach (node) => {
												focusTargets[key] = node;
												return () => delete focusTargets[key];
											}}
										>
											{#if column.cell}{@render column.cell(row)}{/if}
										</a>
									{:else if column.cell}
										{@render column.cell(row)}
									{/if}
								</Table.Cell>
							{/each}
						</tr>
					{/each}
				</Table.Body>
			{/if}
		</Table.Root>
	{/if}
</div>
