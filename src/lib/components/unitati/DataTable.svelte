<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';

	export interface DataTableColumn<Row> {
		/** Identifies the column for sorting; not a property path. */
		key: string;
		header: string;
		/** `end` for numbers, which the design system sets in tabular figures. */
		align?: 'start' | 'end';
		/** Sorting is announced, never performed: see the note on `sort`. */
		sortable?: boolean;
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
			panel:
				'w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]',
			table: 'w-full border-separate border-spacing-0 text-sm',
			head: [
				'h-8 px-[var(--space-3)] py-0 text-left align-middle',
				'text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)]',
				'bg-[var(--surface-2)] border-b border-[var(--border)]'
			],
			// `py-0` undoes the vendored cell's `p-2`, whose vertical padding would
			// otherwise add to the row height the design system fixes at 40px. The
			// row rule comes from `ui/table`'s own `border-b`, not from here: two
			// borders on the same edge draw a 2px line.
			cell: 'px-[var(--space-3)] py-0 align-middle whitespace-nowrap',
			empty:
				'flex flex-col items-center gap-[var(--space-4)] px-[var(--space-6)] py-[var(--space-12)] text-center'
		},
		variants: {
			compact: {
				true: { cell: 'h-[var(--size-row-compact)]' },
				false: { cell: 'h-[var(--size-row)]' }
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
					cell: 'font-mono text-xs leading-[18px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums] text-[var(--ink)]'
				},
				title: { cell: 'font-medium text-[var(--ink)]' },
				muted: { cell: 'text-[var(--ink-muted)]' }
			}
		},
		defaultVariants: { compact: false, align: 'start', emphasis: 'muted' }
	});

	/** Position decides the emphasis, exactly as the design system assigns it. */
	export function emphasisFor(index: number): 'code' | 'title' | 'muted' {
		if (index === 0) return 'code';
		return index === 1 ? 'title' : 'muted';
	}
</script>

<script lang="ts" generics="Row">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Table from '#lib/components/ui/table/index.js';
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
		 * Current sort, for the header's `aria-sort` and affordance. The table
		 * never reorders `rows`: ordering belongs to whoever fetched them, and
		 * #7 gives that a server-side contract. Bind it and re-query.
		 */
		sort?: DataTableSort;
		compact?: boolean;
		/** One sentence. Shown instead of an empty grid, which tells nobody anything. */
		emptyMessage: string;
		/** The primary action that resolves the emptiness, usually a Button. */
		emptyAction?: Snippet;
		class?: string;
	}

	let {
		columns,
		rows,
		rowKey,
		rowLabel,
		href,
		selected = $bindable(),
		sort = $bindable(),
		compact = false,
		emptyMessage,
		emptyAction,
		class: className
	}: Props = $props();

	const selectable = $derived(selected !== undefined);
	const styles = $derived(dataTable({ compact }));

	function toggle(key: string) {
		const current = selected ?? [];
		selected = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
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

<div class={styles.panel({ class: className })}>
	{#if rows.length === 0}
		<div class={styles.empty()}>
			<p class="text-sm text-[var(--ink-muted)]">{emptyMessage}</p>
			{#if emptyAction}
				{@render emptyAction()}
			{/if}
		</div>
	{:else}
		<Table.Root class={styles.table()}>
			<Table.Header>
				<Table.Row class="hover:bg-transparent">
					{#if selectable}
						<Table.Head class={styles.head({ class: 'w-10' })}>
							<span class="sr-only">{m.table_select_column()}</span>
						</Table.Head>
					{/if}

					{#each columns as column (column.key)}
						<Table.Head
							class={styles.head({ align: column.align ?? 'start' })}
							aria-sort={column.sortable ? ariaSort(column.key) : undefined}
						>
							{#if column.sortable}
								{@const SortIcon = sortIcon(column.key)}
								<button
									type="button"
									class="inline-flex items-center gap-1 transition-colors hover:text-[var(--ink)]"
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

			<Table.Body>
				{#each rows as row (rowKey(row))}
					{@const key = rowKey(row)}
					{@const isSelected = selected?.includes(key) ?? false}
					<Table.Row
						class="relative last:border-b-0 hover:bg-[var(--surface-2)] aria-selected:bg-[var(--brand-soft)]"
						aria-selected={selectable ? isSelected : undefined}
					>
						{#if selectable}
							<Table.Cell class={styles.cell()}>
								<input
									type="checkbox"
									class="relative z-10 size-4 accent-[var(--brand)]"
									checked={isSelected}
									onchange={() => toggle(key)}
									aria-label={rowLabel?.(row) ?? key}
								/>
							</Table.Cell>
						{/if}

						{#each columns as column, index (column.key)}
							<Table.Cell
								class={styles.cell({
									align: column.align ?? 'start',
									emphasis: emphasisFor(index)
								})}
							>
								{#if index === 0 && href}
									<!-- One real link per row, stretched over the row so a pointer can
									     click anywhere. The checkbox is lifted above it; any other
									     interactive control in a cell would sit underneath, which is
									     why a table with a row `href` keeps its cells inert. -->
									<a
										href={href(row)}
										class="after:absolute after:inset-0 hover:underline focus-visible:underline"
									>
										{#if column.cell}{@render column.cell(row)}{/if}
									</a>
								{:else if column.cell}
									{@render column.cell(row)}
								{/if}
							</Table.Cell>
						{/each}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
