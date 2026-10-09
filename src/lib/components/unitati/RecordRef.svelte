<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-ref` family: an inline, clickable reference to a record. It is the
	 * visual unit of the product's core idea — the relations between records — so
	 * it looks the same in a table, a relation panel, a timeline and a thread.
	 *
	 * Tinted by the record's domain. The tag never truncates (it is how a person
	 * recognises the record); the title does.
	 */
	export const recordRef = tv({
		slots: {
			root: [
				'inline-flex max-w-full min-w-0 items-center gap-[var(--space-1)] align-middle',
				'rounded-[var(--radius-sm)] px-[var(--space-2)] py-[2px] text-[13px] leading-5',
				'hover:underline focus-visible:outline-2 focus-visible:outline-offset-2'
			],
			icon: 'size-3.5 shrink-0',
			tag: 'shrink-0 font-mono text-xs font-semibold',
			title: 'min-w-0 truncate text-[var(--ink)]'
		},
		variants: {
			kind: {
				asset: {
					root: 'bg-[var(--asset-soft)] text-[var(--asset)] focus-visible:outline-[var(--asset)]'
				},
				ticket: {
					root: 'bg-[var(--desk-soft)] text-[var(--desk)] focus-visible:outline-[var(--desk)]'
				}
			}
		}
	});
</script>

<script lang="ts">
	import Laptop from '@lucide/svelte/icons/laptop';
	import Ticket from '@lucide/svelte/icons/ticket';

	interface Props {
		/** The record, as `relatedTo` returns it: `kind`, `tag`, `title`, `href`. */
		record: { kind: 'asset' | 'ticket'; tag: string; title: string; href: string };
		/** The tag alone, for a table cell where the title is the next column. */
		idOnly?: boolean;
		class?: string;
	}

	let { record, idOnly = false, class: className }: Props = $props();

	const styles = $derived(recordRef({ kind: record.kind }));
	const Icon = $derived(record.kind === 'asset' ? Laptop : Ticket);
</script>

<a href={record.href} class={styles.root({ class: className })}>
	<Icon class={styles.icon()} aria-hidden="true" />
	<span class={styles.tag()}>{record.tag}</span>
	{#if !idOnly}
		<span class={styles.title()}>{record.title}</span>
	{/if}
</a>
