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
			group: 'mt-[var(--space-5)] first-of-type:mt-[var(--space-3)]',
			label: [
				'flex items-center gap-[var(--space-1)] text-xs leading-4 font-semibold tracking-[0.06em]',
				'text-[var(--ink-muted)] uppercase'
			],
			items: 'mt-[var(--space-2)] m-0 flex list-none flex-col gap-[var(--space-2)] p-0',
			item: 'flex flex-wrap items-center gap-[var(--space-2)]',
			empty: 'mt-[var(--space-2)] text-sm text-[var(--ink-muted)]',
			error: 'mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]'
		}
	});
</script>

<script lang="ts">
	import Unlink from '@lucide/svelte/icons/unlink';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { RelatedGroup } from '#lib/server/links/index.js';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { confirmSubmit } from './confirm-submit.js';
	import RecordRef, { KIND_ICONS } from './RecordRef.svelte';
	import StatusBadge from './StatusBadge.svelte';

	interface Props {
		groups: RelatedGroup[];
		/**
		 * A form action that unlinks one record, posted with its id as `recordId`.
		 * Absent for a viewer who may not unlink, and then no control is drawn:
		 * the domain refuses them anyway, but a button that can only fail is noise.
		 */
		unlinkAction?: string;
		/**
		 * Shown when the last unlink was refused: inside the still-open
		 * `ConfirmDialog` while JS re-submitted it, or under the panel for a
		 * plain full-page POST (no `confirming` survives a reload, so there is
		 * no dialog left to put it in).
		 */
		error?: string;
		/**
		 * The record asking "are you sure?", if any: one at a time. Bindable so a
		 * parent can open it, which is also how the gallery shows that state.
		 */
		confirming?: string | null;
		class?: string;
	}

	let {
		groups,
		unlinkAction,
		error,
		confirming = $bindable(null),
		class: className
	}: Props = $props();

	const styles = related();

	/** Singular and plural wording of each relation: "Equipo afectado" / "Equipos afectados". */
	const LABELS = {
		affects: [() => m.related_affects_one(), () => m.related_affects_other()],
		affected_by: [() => m.related_affected_by_one(), () => m.related_affected_by_other()]
	} as const;

	function label(group: RelatedGroup): string {
		const [one, other] = LABELS[group.relation];
		return group.items.length === 1 ? one() : other();
	}

	/** The record whose unlink POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);
</script>

<section class={styles.root({ class: className })}>
	<h2 class={styles.title()}>{m.related_title()}</h2>

	{#if groups.length === 0}
		<p class={styles.empty()}>{m.related_empty()}</p>
	{/if}

	{#each groups as group (group.relation)}
		{@const Icon = KIND_ICONS[group.icon]}
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

						{#if unlinkAction}
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

							<ConfirmDialog
								open={confirming === item.ref.id}
								onOpenChange={(next) => {
									if (!next) confirming = null;
								}}
								title={m.related_unlink()}
								description={m.related_unlink_ask({ tag: item.ref.tag })}
								confirmLabel={m.related_unlink_confirm()}
								pending={pendingId === item.ref.id}
								error={confirming === item.ref.id ? error : null}
							>
								{#snippet action(confirm)}
									<form
										method="POST"
										action={unlinkAction}
										use:enhance={confirmSubmit({
											onPending: (pending) => (pendingId = pending ? item.ref.id : null),
											onSettled: (succeeded) => {
												if (succeeded) confirming = null;
											}
										})}
									>
										<input type="hidden" name="recordId" value={item.ref.id} />
										{@render confirm()}
									</form>
								{/snippet}
							</ConfirmDialog>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/each}

	{#if error && !confirming}
		<p class={styles.error()} role="alert">{error}</p>
	{/if}
</section>
