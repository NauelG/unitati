<script lang="ts">
	import Alert from '#lib/components/unitati/Alert.svelte';
	import { m } from '#lib/paraglide/messages.js';

	type ImportIssue = {
		row: number | null;
		column: string | null;
		value: string | null;
		kind: string;
	};

	/**
	 * The "nothing was imported" block of a preview: the errors folded by kind,
	 * then the first rows. `kinds` turns an error kind into its sentence.
	 */
	let {
		groups,
		errors,
		errorCount,
		kinds
	}: {
		groups: { kind: string; count: number; rows: number[] }[];
		errors: ImportIssue[];
		errorCount: number;
		kinds: Record<string, string>;
	} = $props();
</script>

<Alert tone="danger" title={m.import_nothing_imported()}>
	<ul class="mt-[var(--space-2)] list-disc pl-5">
		{#each groups as group (group.kind)}
			<li>
				{kinds[group.kind]} ({group.count}){#if group.rows.length > 0}
					— {m.import_error_rows({ rows: group.rows.join(', ') })}{/if}
			</li>
		{/each}
	</ul>
</Alert>
<div class="overflow-x-auto">
	<table class="w-full text-sm">
		<thead>
			<tr class="text-left">
				<th class="py-1 pr-3">{m.import_table_row()}</th>
				<th class="py-1 pr-3">{m.import_table_column()}</th>
				<th class="py-1 pr-3">{m.import_table_value()}</th>
				<th class="py-1">{m.import_table_reason()}</th>
			</tr>
		</thead>
		<tbody>
			{#each errors as error, index (index)}
				<tr class="border-t border-[var(--border)]">
					<td class="py-1 pr-3">{error.row ?? ''}</td>
					<td class="py-1 pr-3">{error.column ?? ''}</td>
					<td class="py-1 pr-3">{error.value ?? ''}</td>
					<td class="py-1">{kinds[error.kind]}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
{#if errorCount > errors.length}
	<p class="text-small text-[var(--ink-muted)]">
		{m.import_errors_truncated({ shown: errors.length, total: errorCount })}
	</p>
{/if}
