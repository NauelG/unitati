<script lang="ts">
	import { dataTable } from './DataTable.svelte';
	import Skeleton from './Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** Matches the real table's `columns.length`, so the header band lines up exactly. */
		columns: number;
		/** Rows to paint while the real count is still unknown. */
		rows?: number;
		/**
		 * Only the `<tbody>`, for a real `DataTable` that keeps its own header
		 * while it loads (`DataTable`'s `loading`). Standalone, the panel is whole.
		 */
		embedded?: boolean;
		/** Same row height as the real table, so nothing jumps when the rows arrive. */
		compact?: boolean;
		class?: string;
	}

	let { columns, rows = 5, embedded = false, compact = false, class: className }: Props = $props();

	const styles = $derived(dataTable({ compact }));

	/** Index ranges, not raw counts: a Svelte `{#each}` needs a bound item, and this one is the index itself. */
	function range(length: number): number[] {
		return Array.from({ length }, (_, index) => index);
	}
	const columnIndexes = $derived(range(columns));
	const rowIndexes = $derived(range(rows));
</script>

{#snippet bodyRows()}
	<tbody>
		{#each rowIndexes as rowIndex (rowIndex)}
			<tr aria-hidden="true">
				{#each columnIndexes as colIndex (colIndex)}
					<td class={styles.cell()}>
						<Skeleton class="h-3.5 {colIndex === 0 ? 'w-20' : 'w-28'}" />
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
{/snippet}

{#if embedded}
	{@render bodyRows()}
{:else}
	<div class={styles.panel({ class: className })} role="status" aria-live="polite">
		<span class="sr-only">{m.loading_generic()}</span>
		<table class={styles.table()}>
			<thead>
				<tr>
					{#each columnIndexes as index (index)}
						<th class={styles.head()} aria-hidden="true">
							<Skeleton class="h-3 w-16" />
						</th>
					{/each}
				</tr>
			</thead>
			{@render bodyRows()}
		</table>
	</div>
{/if}
