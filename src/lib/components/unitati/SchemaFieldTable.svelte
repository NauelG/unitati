<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	interface Row {
		/** Dotted path of the field: `data.queue.id`. */
		name: string;
		type: string;
		required: boolean;
		description: string;
	}

	interface Props {
		rows: readonly Row[];
		/** Names the table for assistive technology. */
		caption: string;
		class?: string;
	}

	let { rows, caption, class: className }: Props = $props();

	const cell = 'px-[var(--space-3)] py-[var(--space-2)] align-top';
	const head =
		'px-[var(--space-3)] h-8 text-left align-middle text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)] bg-[var(--surface-2)]';
</script>

{#if rows.length === 0}
	<p class="text-sm text-[var(--ink-muted)]">{m.api_docs_fields_empty()}</p>
{:else}
	<div
		class="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] {className ??
			''}"
	>
		<table class="w-full border-collapse text-sm">
			<caption class="sr-only">{caption}</caption>
			<thead>
				<tr>
					<th scope="col" class={head}>{m.api_docs_field_name()}</th>
					<th scope="col" class={head}>{m.api_docs_field_type()}</th>
					<th scope="col" class={head}>{m.api_docs_field_required()}</th>
					<th scope="col" class={head}>{m.api_docs_field_description()}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-[var(--border)]">
				{#each rows as row (row.name)}
					<tr>
						<th scope="row" class="{cell} text-left font-mono font-medium text-[var(--ink)]">
							{row.name}
						</th>
						<td class="{cell} font-mono text-[var(--ink-muted)]">{row.type}</td>
						<td class="{cell} text-[var(--ink-muted)]">
							{row.required ? m.api_docs_field_yes() : m.api_docs_field_no()}
						</td>
						<td class="{cell} text-[var(--ink-muted)]">{row.description}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
