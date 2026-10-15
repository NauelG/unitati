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
			meta: 'flex basis-full flex-wrap items-center gap-x-[var(--space-2)] text-xs text-[var(--ink-muted)]',
			empty: 'mt-[var(--space-2)] text-sm text-[var(--ink-muted)]',
			error: 'mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]'
		}
	});
</script>

<script lang="ts">
	import Unlink from '@lucide/svelte/icons/unlink';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { relatedRows } from '#lib/related-rows.js';
	import type {
		RecordKind,
		RelatedGroup,
		RelatedItem,
		RelationName
	} from '#lib/server/links/index.js';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { confirmSubmit } from './confirm-submit.js';
	import ProjectProgress from './ProjectProgress.svelte';
	import RecordRef, { KIND_ICONS } from './RecordRef.svelte';
	import StatusBadge, { badge } from './StatusBadge.svelte';

	interface Props {
		groups: RelatedGroup[];
		/**
		 * A form action that unlinks one record, posted with its id as `recordId`.
		 * Absent for a viewer who may not unlink, and then no control is drawn:
		 * the domain refuses them anyway, but a button that can only fail is noise.
		 */
		unlinkAction?: string;
		/**
		 * The same, per kind of record, for a panel that mixes them (a ticket's:
		 * assets, tasks and projects each have their own action). Wins over
		 * `unlinkAction` for the kinds it names; a kind without an entry draws no
		 * control.
		 */
		unlinkActions?: Partial<Record<RecordKind, string>>;
		/**
		 * The requester's reading: *Resuelto en* and *Gestionado en* merge into one
		 * *En seguimiento en*, and nothing can be unlinked. What it leaves out (the
		 * project of a task, progress) is not theirs to know, and the server does
		 * not send it either.
		 */
		requester?: boolean;
		/**
		 * The relations whose items can be unlinked from here; every group when
		 * absent. A project unlinks what it handles directly, and leaves the
		 * tickets that arrive through a task to the task's own page.
		 */
		unlinkable?: readonly RelationName[];
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
		unlinkActions,
		requester = false,
		unlinkable,
		error,
		confirming = $bindable(null),
		class: className
	}: Props = $props();

	const styles = related();

	/**
	 * Singular and plural wording of each relation: "Equipo afectado" / "Equipos
	 * afectados". The ones that are a verb ("Resuelve") do not inflect.
	 */
	const LABELS = {
		affects: [() => m.related_affects_one(), () => m.related_affects_other()],
		affected_by: [() => m.related_affected_by_one(), () => m.related_affected_by_other()],
		resolved_in: [() => m.related_resolved_in(), () => m.related_resolved_in()],
		handled_in: [() => m.related_handled_in(), () => m.related_handled_in()],
		resolves: [() => m.related_resolves(), () => m.related_resolves()],
		handles: [() => m.related_handles(), () => m.related_handles()],
		resolves_via_tasks: [() => m.related_resolves_via_tasks(), () => m.related_resolves_via_tasks()]
	} as const satisfies Record<RelationName, readonly [() => string, () => string]>;

	function label(group: RelatedGroup, count: number): string {
		const [one, other] = LABELS[group.relation];
		return count === 1 ? one() : other();
	}

	/** The action that unlinks this item, or nothing: the requester, a restricted item or a kind without one cannot. */
	function actionFor(group: RelatedGroup, item: RelatedItem): string | undefined {
		if (requester || item.restricted) return undefined;
		if (unlinkActions) return unlinkActions[item.ref.kind];
		return unlinkAction && (!unlinkable || unlinkable.includes(group.relation))
			? unlinkAction
			: undefined;
	}

	/** What is drawn: the groups as they come, or for the requester the work ones merged into one. */
	const shown = $derived.by((): { key: string; label: string | null; group: RelatedGroup }[] => {
		const plain = (group: RelatedGroup) => ({ key: group.relation, label: null, group });
		if (!requester) return groups.map(plain);

		const isWork = (group: RelatedGroup) =>
			group.relation === 'resolved_in' || group.relation === 'handled_in';
		const merged = groups
			.filter(isWork)
			.flatMap((group) => group.items)
			.sort((a, b) => a.linkedAt.getTime() - b.linkedAt.getTime());

		return [
			...groups.filter((group) => !isWork(group)).map(plain),
			...(merged.length > 0
				? [
						{
							key: 'followed_in',
							label: m.related_followed_in(),
							group: { relation: 'resolved_in' as const, icon: 'task' as const, items: merged }
						}
					]
				: [])
		];
	});

	/** The question the confirmation asks: losing an asset's context is not losing a task's. */
	function ask(group: RelatedGroup, tag: string): string {
		return group.relation === 'affects' || group.relation === 'affected_by'
			? m.related_unlink_ask({ tag })
			: m.related_unlink_ask_work({ tag });
	}

	/** A task or a project is not a status key: the badge takes the state's own name. */
	function projectArchived(item: RelatedItem): boolean {
		return typeof item.status === 'object' && 'archived' in item.status && item.status.archived;
	}

	/** The record whose unlink POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);
</script>

<section class={styles.root({ class: className })}>
	<h2 class={styles.title()}>{m.related_title()}</h2>

	{#if groups.length === 0}
		<p class={styles.empty()}>{m.related_empty()}</p>
	{/if}

	{#each shown as { key, label: heading, group } (key)}
		{@const Icon = KIND_ICONS[group.icon]}
		{@const rows = relatedRows(group)}
		<div class={styles.group()}>
			<h3 class={styles.label()}>
				<Icon class="size-3.5" aria-hidden="true" />
				{heading ?? label(group, rows.length)}
			</h3>

			<ul class={styles.items()}>
				{#each rows as { item, vias } (item.ref.id)}
					{@const unlinkHere = actionFor(group, item)}
					<li class={styles.item()}>
						{#if item.ref.href === null}
							<!-- The requester's reduced view (ADR 0007): the code and the state, nowhere to go. -->
							<span class="inline-flex min-w-0 items-center gap-[var(--space-1)] text-[13px]">
								<span class="shrink-0 font-mono text-xs font-semibold">{item.ref.tag}</span>
								<span class="min-w-0 truncate text-[var(--ink)]">{item.ref.title}</span>
							</span>
						{:else}
							<RecordRef record={{ ...item.ref, href: item.ref.href }} />
						{/if}

						{#if typeof item.status === 'string'}
							<StatusBadge status={item.status} />
						{:else if 'group' in item.status}
							<StatusBadge status={item.status.group} label={item.status.name} />
						{:else if projectArchived(item)}
							<span class={badge({ tone: 'neutral' })}>{m.related_project_archived()}</span>
						{:else if 'progress' in item.status && item.status.progress}
							<ProjectProgress counts={item.status.progress.counts} class="w-28" />
						{:else}
							<StatusBadge status="started" label={m.related_project_active()} />
						{/if}

						{#if 'projectTag' in item && item.projectTag}
							<span class="font-mono text-xs text-[var(--ink-muted)]">{item.projectTag}</span>
						{/if}

						{#if 'priority' in item && item.priority}
							<StatusBadge status={item.priority} />
						{/if}

						{#if unlinkHere}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								iconOnly
								class="ml-auto text-[var(--danger)] hover:bg-[var(--danger-soft)]"
								title={m.related_unlink()}
								aria-label="{m.related_unlink()} {item.ref.tag}"
								onclick={() => (confirming = item.ref.id)}
							>
								<Unlink class="size-4" aria-hidden="true" />
							</Button>

							<ConfirmDialog
								open={confirming === item.ref.id}
								onOpenChange={(next) => {
									if (!next) confirming = null;
								}}
								title={m.related_unlink()}
								description={ask(group, item.ref.tag)}
								confirmLabel={m.related_unlink_confirm()}
								pending={pendingId === item.ref.id}
								error={confirming === item.ref.id ? error : null}
							>
								{#snippet action(confirm)}
									<form
										method="POST"
										action={unlinkHere}
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

						{#if 'assignee' in item || vias.length > 0}
							<p class={styles.meta()}>
								{#if 'assignee' in item}
									<span>{item.assignee ?? m.related_unassigned()}</span>
								{/if}
								{#if vias.length > 0}
									<span>{m.related_via()}</span>
									{#each vias as via (via.id)}
										<RecordRef record={via} />
									{/each}
								{/if}
							</p>
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
