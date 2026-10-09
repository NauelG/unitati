<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The side panel on a detail view that lists the records linked to this one,
	 * grouped by relation: where "full context" becomes visible.
	 *
	 * It renders whatever `relatedTo` returns and knows nothing about which table
	 * answered. Groups arrive in the design system's order with the empty ones
	 * already left out, so an empty panel says so instead of drawing headings
	 * over nothing.
	 */
	export const related = tv({
		slots: {
			root: 'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]',
			title: 'text-sm font-semibold text-[var(--ink)]',
			group: 'mt-[var(--space-4)] first-of-type:mt-[var(--space-3)]',
			label: [
				'flex items-center gap-[var(--space-1)] text-[11px] leading-4 font-semibold tracking-[0.06em]',
				'text-[var(--ink-muted)] uppercase'
			],
			items: 'mt-[var(--space-2)] m-0 flex list-none flex-col gap-[var(--space-2)] p-0',
			item: 'flex flex-wrap items-center gap-[var(--space-2)]',
			confirm:
				'flex w-full flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-[var(--warning-soft)] p-[var(--space-3)]',
			ask: 'text-[13px] leading-[18px] text-[var(--ink)]',
			actions: 'flex flex-wrap items-center gap-[var(--space-2)]',
			empty: 'mt-[var(--space-2)] text-sm text-[var(--ink-muted)]',
			error: 'mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]'
		}
	});
</script>

<script lang="ts">
	import Laptop from '@lucide/svelte/icons/laptop';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Unlink from '@lucide/svelte/icons/unlink';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { RelatedGroup } from '#lib/server/links/index.js';
	import Button from './Button.svelte';
	import RecordRef from './RecordRef.svelte';
	import StatusBadge from './StatusBadge.svelte';

	interface Props {
		groups: RelatedGroup[];
		/**
		 * A form action that unlinks one record, posted with its id as `recordId`.
		 * Absent for a viewer who may not unlink, and then no control is drawn:
		 * the domain refuses them anyway, but a button that can only fail is noise.
		 */
		unlinkAction?: string;
		/** Shown under the panel when the last unlink was refused. */
		error?: string;
		class?: string;
	}

	let { groups, unlinkAction, error, class: className }: Props = $props();

	const styles = related();

	/** The record asking "are you sure?", if any. One at a time. */
	let confirming = $state<string | null>(null);

	/** Pluralised by count: "Equipo afectado" for one, "Equipos afectados" for several. */
	function label(group: RelatedGroup): string {
		const one = group.items.length === 1;

		return group.relation === 'affects'
			? one
				? m.related_affects_one()
				: m.related_affects_other()
			: one
				? m.related_affected_by_one()
				: m.related_affected_by_other();
	}
</script>

<section class={styles.root({ class: className })}>
	<h2 class={styles.title()}>{m.related_title()}</h2>

	{#if groups.length === 0}
		<p class={styles.empty()}>{m.related_empty()}</p>
	{/if}

	{#each groups as group (group.relation)}
		{@const Icon = group.icon === 'asset' ? Laptop : Ticket}
		<div class={styles.group()}>
			<h3 class={styles.label()}>
				<Icon class="size-3.5" aria-hidden="true" />
				{label(group)}
			</h3>

			<ul class={styles.items()}>
				{#each group.items as item (item.ref.id)}
					<li class={styles.item()}>
						<RecordRef record={item.ref} />
						<StatusBadge status={item.status} />

						{#if unlinkAction && confirming !== item.ref.id}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="ml-auto"
								onclick={() => (confirming = item.ref.id)}
							>
								<Unlink class="size-3.5" aria-hidden="true" />
								{m.related_unlink()}
								<span class="sr-only">{item.ref.tag}</span>
							</Button>
						{/if}

						{#if unlinkAction && confirming === item.ref.id}
							<form
								method="POST"
								action={unlinkAction}
								class={styles.confirm()}
								use:enhance={() =>
									async ({ update }) => {
										await update();
										confirming = null;
									}}
							>
								<input type="hidden" name="recordId" value={item.ref.id} />
								<p class={styles.ask()} role="alert">
									{m.related_unlink_ask({ tag: item.ref.tag })}
								</p>
								<div class={styles.actions()}>
									<Button type="submit" variant="danger" size="sm">
										{m.related_unlink_confirm()}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={() => (confirming = null)}
									>
										{m.form_cancel()}
									</Button>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/each}

	{#if error}
		<p class={styles.error()} role="alert">{error}</p>
	{/if}
</section>
