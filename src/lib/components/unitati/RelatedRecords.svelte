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
	import Unlink from '@lucide/svelte/icons/unlink';
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { RelatedGroup } from '#lib/server/links/index.js';
	import Button from './Button.svelte';
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
		/** Shown under the panel when the last unlink was refused. */
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
	const panelId = $props.id();
	let heading: HTMLElement | undefined = $state();

	/** Singular and plural wording of each relation: "Equipo afectado" / "Equipos afectados". */
	const LABELS = {
		affects: [() => m.related_affects_one(), () => m.related_affects_other()],
		affected_by: [() => m.related_affected_by_one(), () => m.related_affected_by_other()]
	} as const;

	function label(group: RelatedGroup): string {
		const [one, other] = LABELS[group.relation];
		return group.items.length === 1 ? one() : other();
	}

	const triggerId = (recordId: string) => `${panelId}-unlink-${recordId}`;

	/** Puts focus on the safe choice when the prompt opens, so a keyboard user lands inside it. */
	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	/**
	 * The button that was pressed leaves the DOM whichever way this ends, and
	 * focus would fall to the page. It goes back to the trigger if the record is
	 * still there (cancelled, or refused), and to the panel heading if it is gone.
	 */
	async function close(recordId: string) {
		confirming = null;
		await tick();
		(document.getElementById(triggerId(recordId)) ?? heading)?.focus();
	}
</script>

<section class={styles.root({ class: className })}>
	<h2 class={styles.title()} tabindex="-1" bind:this={heading}>{m.related_title()}</h2>

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

						{#if unlinkAction && confirming !== item.ref.id}
							<Button
								id={triggerId(item.ref.id)}
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
								role="group"
								aria-labelledby="{triggerId(item.ref.id)}-ask"
								tabindex="-1"
								use:focusOnMount
								use:enhance={() =>
									async ({ update }) => {
										await update();
										await close(item.ref.id);
									}}
							>
								<input type="hidden" name="recordId" value={item.ref.id} />
								<p id="{triggerId(item.ref.id)}-ask" class={styles.ask()}>
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
										onclick={() => close(item.ref.id)}
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
