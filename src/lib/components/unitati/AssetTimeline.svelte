<script lang="ts" module>
	import FileSignature from '@lucide/svelte/icons/file-signature';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import FileX from '@lucide/svelte/icons/file-x';
	import PenOff from '@lucide/svelte/icons/pen-off';
	import Send from '@lucide/svelte/icons/send';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Flag from '@lucide/svelte/icons/flag';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Lock from '@lucide/svelte/icons/lock';
	import Link from '@lucide/svelte/icons/link';
	import MapPinMinus from '@lucide/svelte/icons/map-pin-minus';
	import MapPinPen from '@lucide/svelte/icons/map-pin-pen';
	import MapPinPlus from '@lucide/svelte/icons/map-pin-plus';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import FileText from '@lucide/svelte/icons/file-text';
	import History from '@lucide/svelte/icons/history';
	import Pencil from '@lucide/svelte/icons/pencil';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Unlink from '@lucide/svelte/icons/unlink';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import UserRoundX from '@lucide/svelte/icons/user-round-x';
	import UserRoundCheck from '@lucide/svelte/icons/user-round-check';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import { tv } from '#lib/tv.js';
	import type { ActivityVerb } from '#lib/server/activity/index.js';

	/**
	 * The `.ut-timeline` family: a rail of events, newest first, one dot per
	 * entry. An event on the asset itself has the asset's colour; a ticket raised
	 * on it has the desk's, with the ticket as a `RecordRef` and the status it has
	 * today. The project dot arrives with the first project entry, and not before.
	 */
	export const timeline = tv({
		slots: {
			list: 'm-0 list-none p-0',
			item: [
				'relative flex gap-[var(--space-3)] pb-[var(--space-5)] last:pb-0',
				// The rail runs from under this dot to the next one; the last item
				// has nothing to connect to.
				"after:absolute after:top-7 after:bottom-0 after:left-[13px] after:w-px after:bg-[var(--border)] after:content-[''] last:after:hidden"
			],
			dot: 'grid size-7 shrink-0 place-items-center rounded-[var(--radius-full)]',
			body: 'min-w-0 flex-1',
			head: 'text-sm leading-5 font-medium text-[var(--ink)]',
			actor: 'font-normal text-[var(--ink-muted)]',
			time: 'text-xs leading-4 text-[var(--ink-muted)] [font-variant-numeric:tabular-nums]',
			note: 'mt-[var(--space-1)] text-sm leading-5 whitespace-pre-wrap text-[var(--ink-muted)]',
			ticket: 'flex flex-wrap items-center gap-[var(--space-2)]',
			empty: 'text-sm text-[var(--ink-muted)]'
		},
		variants: {
			domain: {
				asset: { dot: 'bg-[var(--asset-soft)] text-[var(--asset)]' },
				ticket: { dot: 'bg-[var(--desk-soft)] text-[var(--desk)]' },
				project: { dot: 'bg-[var(--project-soft)] text-[var(--project)]' }
			}
		}
	});

	/**
	 * Exhaustive over the verbs, like `activitySentence`: a verb added without an
	 * icon fails `npm run check` instead of rendering a dot with nothing in it.
	 */
	export const ACTIVITY_ICONS: Record<ActivityVerb, typeof PackagePlus> = {
		'asset.created': PackagePlus,
		'custody.assigned': UserCheck,
		'custody.returned': Undo2,
		'handover.issued': FileSignature,
		'handover.accepted': FileCheck,
		'handover.rejected': FileX,
		'handover.waived': PenOff,
		'handover.resent': Send,
		'state.changed': RefreshCw,
		'location.changed': MapPin,
		'note.added': MessageSquare,
		'ticket.created': Ticket,
		'ticket.status.changed': RefreshCw,
		'ticket.assigned': UserCheck,
		'ticket.unassigned': UserMinus,
		'ticket.priority.changed': Flag,
		'ticket.queue.changed': Inbox,
		'ticket.subject.changed': Pencil,
		'comment.edited': Pencil,
		'link.asset.added': Link,
		'link.asset.removed': Unlink,
		'link.task.added': Link,
		'link.task.removed': Unlink,
		'link.project.added': Link,
		'link.project.removed': Unlink,
		'link.page.added': Link,
		'link.page.removed': Unlink,
		'project.created': FolderPlus,
		'project.archived': Archive,
		'project.unarchived': ArchiveRestore,
		'project.owner.changed': UserCheck,
		'project.due.changed': CalendarClock,
		'project.visibility.changed': Lock,
		'project.member.added': UserPlus,
		'project.member.removed': UserMinus,
		'asset.attachment.added': Paperclip,
		'asset.attachment.removed': Paperclip,
		'project.attachment.added': Paperclip,
		'project.attachment.removed': Paperclip,
		'task.created': ListTodo,
		'task.state.changed': RefreshCw,
		'task.assigned': UserCheck,
		'task.unassigned': UserMinus,
		'task.due.changed': CalendarClock,
		'task.project.changed': ArrowRightLeft,
		'task.attachment.added': Paperclip,
		'task.attachment.removed': Paperclip,
		'person.created': UserPlus,
		'person.deactivated': UserRoundX,
		'person.reactivated': UserRoundCheck,
		'person.department.changed': ArrowRightLeft,
		'person.location.changed': MapPin,
		'catalogue.location.created': MapPinPlus,
		'catalogue.location.updated': MapPinPen,
		'catalogue.location.deleted': MapPinMinus,
		'space.created': BookOpen,
		'space.audience.changed': ArrowRightLeft,
		'space.archived': Archive,
		'page.created': FilePlus,
		'page.published': FileCheck,
		'page.moved': ArrowRightLeft,
		'page.archived': Archive,
		'page.unarchived': ArchiveRestore,
		'page.revision.restored': History,
		'page.attachment.added': Paperclip,
		'page.attachment.removed': FileText
	};
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/format-date.js';
	import type { AssetTimelineItem } from '#lib/server/links/index.js';
	import { activitySentence, projectChangedParts } from './activity.js';
	import RecordRef from './RecordRef.svelte';
	import StatusBadge, { badge } from './StatusBadge.svelte';

	interface Props {
		/**
		 * Newest first, as `mergeAssetTimeline` returns them: past events and live
		 * relations on one rail. The component never reorders.
		 */
		items: AssetTimelineItem[];
		/**
		 * Whose rail this is: the dot of an event on the record itself takes its
		 * domain's colour. On a task or project rail the live ticket rows read as
		 * "linked to the ticket" with who did it.
		 */
		domain?: 'asset' | 'project';
		class?: string;
	}

	let { items, domain = 'asset', class: className }: Props = $props();

	const styles = timeline();
	// Only the dot changes colour with the domain.
	const assetDot = $derived(timeline({ domain }).dot());
	const ticketDot = timeline({ domain: 'ticket' }).dot();
</script>

{#if items.length === 0}
	<p class={styles.empty({ class: className })}>{m.timeline_empty()}</p>
{:else}
	<ol class={styles.list({ class: className })}>
		{#each items as item (item.id)}
			{#if item.kind === 'ticket'}
				<li class={styles.item()}>
					<span class={ticketDot} aria-hidden="true">
						<Ticket class="size-3.5" />
					</span>
					<div class={styles.body()}>
						<p class={styles.ticket()}>
							{#if domain !== 'asset'}
								<!-- On a task or a project the row is a sentence: someone linked a ticket to it. -->
								<span class={styles.head()}>{m.timeline_ticket_linked()}</span>
							{/if}
							<RecordRef record={item.record} />
							<StatusBadge status={item.status} />
							{#if item.actorName}
								<span class={styles.actor()}>{m.timeline_by({ name: item.actorName })}</span>
							{/if}
						</p>
						<time class={styles.time()} datetime={item.at.toISOString()}>
							{formatDateTime(item.at)}
						</time>
					</div>
				</li>
			{:else}
				{@const entry = item.entry}
				{@const Icon = ACTIVITY_ICONS[entry.verb]}
				<li class={styles.item()}>
					<span class={assetDot} aria-hidden="true">
						<Icon class="size-3.5" />
					</span>
					<div class={styles.body()}>
						<p class={styles.head()}>
							{#if entry.verb === 'task.project.changed'}
								{#each projectChangedParts(entry.payload) as part, index (index)}
									{#if 'project' in part}
										<a
											href="/projects/{encodeURIComponent(part.project.tag)}"
											class="font-medium hover:underline">{part.project.tag}</a
										>
										{part.project.name}
									{:else}
										{part.text}
									{/if}
								{/each}
							{:else}
								{activitySentence(entry)}
							{/if}
							{#if entry.actorName}
								<span class={styles.actor()}>
									{m.timeline_by({ name: entry.actorName })}
								</span>
								{#if entry.actorServiceAccountId}
									<span class={badge({ tone: 'neutral', plain: true })}>
										{m.timeline_service_tag()}
									</span>
								{/if}
							{/if}
						</p>

						{#if entry.verb === 'note.added'}
							<p class={styles.note()}>{entry.payload.text}</p>
						{/if}

						<time class={styles.time()} datetime={entry.occurredAt.toISOString()}>
							{formatDateTime(entry.occurredAt)}
						</time>
					</div>
				</li>
			{/if}
		{/each}
	</ol>
{/if}
