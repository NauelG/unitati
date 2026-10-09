<script lang="ts" module>
	import Flag from '@lucide/svelte/icons/flag';
	import Inbox from '@lucide/svelte/icons/inbox';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import { tv } from 'tailwind-variants';
	import type { ActivityVerb } from '#lib/server/activity/index.js';

	/**
	 * The `.ut-timeline` family: a rail of events, newest first, one dot per
	 * entry. The dot is the asset colour because every event on this rail is an
	 * event on an asset; #9 adds the ticket and project dots when their entries
	 * start appearing here, and not before.
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
			dot: 'grid size-7 shrink-0 place-items-center rounded-[var(--radius-full)] bg-[var(--asset-soft)] text-[var(--asset)]',
			body: 'min-w-0 flex-1',
			head: 'text-sm leading-5 font-medium text-[var(--ink)]',
			actor: 'font-normal text-[var(--ink-muted)]',
			time: 'text-xs leading-4 text-[var(--ink-muted)] [font-variant-numeric:tabular-nums]',
			note: 'mt-[var(--space-1)] text-sm leading-5 whitespace-pre-wrap text-[var(--ink-muted)]',
			empty: 'text-sm text-[var(--ink-muted)]'
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
		'ticket.queue.changed': Inbox
	};
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { TimelineEntry } from '#lib/server/activity/index.js';
	import { activitySentence } from './activity.js';

	interface Props {
		/** Newest first, as `assetTimeline` returns them. The component never reorders. */
		entries: TimelineEntry[];
		class?: string;
	}

	let { entries, class: className }: Props = $props();

	const styles = timeline();

	/**
	 * Built per render rather than at module scope: the locale is a user
	 * preference read from a cookie, so freezing it at import time would pin
	 * every later request to whichever language the first one had.
	 */
	const formatter = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
	);
</script>

{#if entries.length === 0}
	<p class={styles.empty({ class: className })}>{m.timeline_empty()}</p>
{:else}
	<ol class={styles.list({ class: className })}>
		{#each entries as entry (entry.id)}
			{@const Icon = ACTIVITY_ICONS[entry.verb]}
			<li class={styles.item()}>
				<span class={styles.dot()} aria-hidden="true"><Icon class="size-3.5" /></span>
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
		{/each}
	</ol>
{/if}
