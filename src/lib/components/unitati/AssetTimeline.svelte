<script lang="ts" module>
	import Flag from '@lucide/svelte/icons/flag';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Link from '@lucide/svelte/icons/link';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Unlink from '@lucide/svelte/icons/unlink';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import { tv } from 'tailwind-variants';
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
				ticket: { dot: 'bg-[var(--desk-soft)] text-[var(--desk)]' }
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
		'state.changed': RefreshCw,
		'location.changed': MapPin,
		'note.added': MessageSquare,
		'ticket.created': Ticket,
		'ticket.status.changed': RefreshCw,
		'ticket.assigned': UserCheck,
		'ticket.unassigned': UserMinus,
		'ticket.priority.changed': Flag,
		'ticket.queue.changed': Inbox,
		'link.asset.added': Link,
		'link.asset.removed': Unlink
	};
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { AssetTimelineItem } from '#lib/server/links/index.js';
	import { activitySentence } from './activity.js';
	import RecordRef from './RecordRef.svelte';
	import StatusBadge from './StatusBadge.svelte';

	interface Props {
		/**
		 * Newest first, as `mergeAssetTimeline` returns them: past events and live
		 * relations on one rail. The component never reorders.
		 */
		items: AssetTimelineItem[];
		class?: string;
	}

	let { items, class: className }: Props = $props();

	const styles = timeline();
	// Only the dot changes colour with the domain.
	const assetDot = timeline({ domain: 'asset' }).dot();
	const ticketDot = timeline({ domain: 'ticket' }).dot();

	/**
	 * Built per render rather than at module scope: the locale is a user
	 * preference read from a cookie, so freezing it at import time would pin
	 * every later request to whichever language the first one had.
	 */
	const formatter = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
	);
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
							<RecordRef record={item.record} />
							<StatusBadge status={item.status} />
						</p>
						<time class={styles.time()} datetime={item.at.toISOString()}>
							{formatter.format(item.at)}
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
							{activitySentence(entry)}
							{#if entry.actorName}
								<span class={styles.actor()}>
									{m.timeline_by({ name: entry.actorName })}
								</span>
							{/if}
						</p>

						{#if entry.verb === 'note.added'}
							<p class={styles.note()}>{entry.payload.text}</p>
						{/if}

						<time class={styles.time()} datetime={entry.occurredAt.toISOString()}>
							{formatter.format(entry.occurredAt)}
						</time>
					</div>
				</li>
			{/if}
		{/each}
	</ol>
{/if}
