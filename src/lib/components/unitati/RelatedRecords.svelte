<script lang="ts" module>
	import { tv } from '#lib/tv.js';

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
			empty: 'mt-[var(--space-2)] text-sm text-[var(--ink-muted)]'
		}
	});
</script>

<script lang="ts">
	import Lock from '@lucide/svelte/icons/lock';
	import Plus from '@lucide/svelte/icons/plus';
	import Unlink from '@lucide/svelte/icons/unlink';
	import { toast } from 'svelte-sonner';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { m } from '#lib/paraglide/messages.js';
	import { relatedRows } from '#lib/related-rows.js';
	import type {
		HandoverState,
		RecordKind,
		RelatedGroup,
		RelatedItem,
		RelationName
	} from '#lib/server/links/index.js';
	import Alert from './Alert.svelte';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import FormActions from './FormActions.svelte';
	import FormError from './FormError.svelte';
	import { confirmSubmit } from './confirm-submit.js';
	import ProjectProgress from './ProjectProgress.svelte';
	import Dialog from './Dialog.svelte';
	import RecordRef, { KIND_ICONS } from './RecordRef.svelte';
	import SearchSelectField from './SearchSelectField.svelte';
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
		/**
		 * A form action that links records, posted with the picked ids as repeated
		 * `ids` fields. Absent for a viewer who may not link: nothing about linking
		 * renders then. Everything below describes the records in the route's own
		 * words, because this component knows nothing about assets or tickets.
		 */
		linkAction?: string;
		/** The button and dialog title: "Vincular activo". */
		linkLabel?: string;
		/** Answers `?q=` with `[{ value, label }]`, scoped like any other staff search. */
		linkSearchUrl?: string;
		linkFieldLabel?: string;
		linkDescription?: string;
		linkPlaceholder?: string;
		/** The primary button, which names the act and the count: "Vincular 3 activos". */
		linkSubmitLabel?: (count: number) => string;
		/** Records already linked: offered in the search, but not selectable. */
		linkedIds?: readonly string[];
		/** Bindable so a parent (the palette) can open the dialog, and the gallery can show it. */
		linkOpen?: boolean;
		/** The last refusal, and the record that caused it; shown inside the open dialog. */
		linkFailure?: string;
		linkFailureId?: string | null;
		linkPending?: boolean;
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
		linkAction,
		linkLabel,
		linkSearchUrl,
		linkFieldLabel,
		linkDescription,
		linkPlaceholder,
		linkSubmitLabel,
		linkedIds = [],
		linkOpen = $bindable(false),
		linkFailure = $bindable(),
		linkFailureId = $bindable(null),
		linkPending = $bindable(false),
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
		resolves_via_tasks: [
			() => m.related_resolves_via_tasks(),
			() => m.related_resolves_via_tasks()
		],
		fulfilled_by: [() => m.related_fulfilled_by(), () => m.related_fulfilled_by()],
		fulfils: [() => m.related_fulfils(), () => m.related_fulfils()]
	} as const satisfies Record<RelationName, readonly [() => string, () => string]>;

	function label(group: RelatedGroup, count: number): string {
		const [one, other] = LABELS[group.relation];
		return count === 1 ? one() : other();
	}

	/** The action that unlinks this item, or nothing: the requester, or a kind without one cannot. */
	function actionFor(group: RelatedGroup, item: RelatedItem): string | undefined {
		if (requester) return undefined;
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

		const hidden = groups
			.filter(isWork)
			.reduce((total, group) => total + (group.restricted ?? 0), 0);

		return [
			...groups.filter((group) => !isWork(group)).map(plain),
			...(merged.length > 0 || hidden > 0
				? [
						{
							key: 'followed_in',
							label: m.related_followed_in(),
							group: {
								relation: 'resolved_in' as const,
								icon: 'task' as const,
								items: merged,
								restricted: hidden
							}
						}
					]
				: [])
		];
	});

	function restrictedLabel(count: number): string {
		return count === 1
			? m.related_restricted_one({ count })
			: m.related_restricted_other({ count });
	}

	/** The question the confirmation asks: losing an asset's context is not losing a task's. */
	function ask(group: RelatedGroup, tag: string): string {
		if (group.relation === 'fulfilled_by') return m.related_unlink_ask_handover({ tag });
		return group.relation === 'affects' || group.relation === 'affected_by'
			? m.related_unlink_ask({ tag })
			: m.related_unlink_ask_work({ tag });
	}

	/** A handover's state is not a status key either: its own words and tone (ADR 0035). */
	const HANDOVER_BADGES = {
		pending: ['warning', () => m.related_handover_pending()],
		accepted: ['success', () => m.related_handover_accepted()],
		rejected: ['danger', () => m.related_handover_rejected()],
		waived: ['neutral', () => m.related_handover_waived()],
		expired: ['neutral', () => m.related_handover_expired()]
	} as const;

	function isHandover(
		item: RelatedItem
	): item is Extract<RelatedItem, { status: HandoverState; ref: { kind: 'handover' } }> {
		return item.ref.kind === 'handover';
	}

	/** A task or a project is not a status key: the badge takes the state's own name. */
	function projectArchived(item: RelatedItem): boolean {
		return typeof item.status === 'object' && 'archived' in item.status && item.status.archived;
	}

	/** The record whose unlink POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);

	let picked = $state<string[]>([]);
	let pickedLabels = $state<Record<string, string>>({});

	// A fresh selection and no stale refusal every time the dialog opens.
	$effect(() => {
		if (linkOpen) {
			picked = [];
			linkFailure = undefined;
			linkFailureId = null;
		}
	});

	const offender = $derived(linkFailureId ? (pickedLabels[linkFailureId] ?? null) : null);
	const linkFailureText = $derived(
		linkFailure && offender
			? m.related_link_offender({ record: offender, message: linkFailure })
			: linkFailure
	);

	function submitLabel(count: number): string {
		return linkSubmitLabel?.(count) ?? m.related_link();
	}

	function linkDone(count: number): string {
		return count === 1 ? m.related_link_done_one({ count }) : m.related_link_done_other({ count });
	}
</script>

{#snippet linkButton(variant: 'ghost' | 'secondary')}
	<Button
		type="button"
		{variant}
		size="sm"
		aria-label={linkLabel}
		onclick={() => (linkOpen = true)}
	>
		<Plus class="size-4" aria-hidden="true" />
		{m.related_link()}
	</Button>
{/snippet}

<section class={styles.root({ class: className })}>
	<div class="flex items-center justify-between gap-[var(--space-2)]">
		<h2 class={styles.title()}>{m.related_title()}</h2>
		{#if linkAction && groups.length > 0}
			{@render linkButton('ghost')}
		{/if}
	</div>

	{#if groups.length === 0}
		<!-- The design system's rule: hide the empty group, offer the Link action in its place. -->
		{#if linkAction}
			<div class="mt-[var(--space-2)]">
				{@render linkButton('secondary')}
			</div>
		{:else}
			<p class={styles.empty()}>{m.related_empty()}</p>
		{/if}
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
							<!-- A handover has no page yet: its code, nowhere to go. -->
							<span class="inline-flex min-w-0 items-center gap-[var(--space-1)] text-small">
								<span class="shrink-0 font-mono text-xs font-semibold">{item.ref.tag}</span>
								<span class="min-w-0 truncate text-[var(--ink)]">{item.ref.title}</span>
							</span>
						{:else}
							<RecordRef record={{ ...item.ref, href: item.ref.href }} />
						{/if}

						{#if isHandover(item)}
							{@const [tone, text] = HANDOVER_BADGES[item.status]}
							<span class={badge({ tone })}>{text()}</span>
						{:else if typeof item.status === 'string'}
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

				{#if group.restricted}
					<!-- Records the viewer cannot see (ADR 0042): a count, never a code, a title or a link. -->
					<li class={styles.item()}>
						<span
							class="inline-flex items-center gap-[var(--space-1)] text-small text-[var(--ink-muted)]"
						>
							<Lock class="size-3.5" aria-hidden="true" />
							{restrictedLabel(group.restricted)}
						</span>
					</li>
				{/if}
			</ul>
		</div>
	{/each}

	{#if !confirming}
		<FormError class="mt-[var(--space-2)]">{error}</FormError>
	{/if}
</section>

{#if linkAction}
	<Dialog
		open={linkOpen}
		onOpenChange={(next) => (linkOpen = next)}
		pending={linkPending}
		title={linkLabel ?? m.related_link()}
		description={linkDescription}
	>
		<form
			method="POST"
			action={linkAction}
			use:enhance={() => {
				linkPending = true;
				linkFailure = undefined;
				linkFailureId = null;
				return async ({ result }) => {
					linkPending = false;
					if (result.type === 'success') {
						const linked = Number((result.data as { linked?: unknown } | undefined)?.linked);
						linkOpen = false;
						toast.success(linkDone(Number.isFinite(linked) ? linked : picked.length));
						await invalidateAll();
					} else if (result.type === 'failure') {
						// The selection stays: the person fixes one record, not starts over.
						const data = result.data as { message?: unknown; id?: unknown } | undefined;
						linkFailure = String(data?.message ?? m.related_link_failed());
						linkFailureId = typeof data?.id === 'string' ? data.id : null;
					} else {
						await applyAction(result);
					}
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if linkFailureText}
				<Alert tone="danger">{linkFailureText}</Alert>
			{/if}

			<SearchSelectField
				label={linkFieldLabel ?? linkLabel ?? m.related_link()}
				name="ids"
				placeholder={linkPlaceholder}
				searchUrl={linkSearchUrl}
				multiple
				bind:values={picked}
				bind:pickedLabels
				disabledValues={linkedIds}
				disabledNote={m.related_link_already()}
			/>

			<FormActions>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => (linkOpen = false)}
					disabled={linkPending}
				>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={linkPending} disabled={picked.length === 0}>
					{submitLabel(picked.length)}
				</Button>
			</FormActions>
		</form>
	</Dialog>
{/if}
