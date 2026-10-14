<script lang="ts" module>
	import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import { stateGroupLabel } from './status.js';

	/**
	 * completed ÷ (total − cancelled), as a whole percentage. `null` when there is
	 * nothing left to count: a project with no tasks, or only cancelled ones, has
	 * no progress to report, and "0 %" would claim it has stalled.
	 */
	export function progressPercent(counts: Record<StateGroup, number>): number | null {
		const total = STATE_GROUPS.reduce((sum, group) => sum + counts[group], 0);
		const counted = total - counts.cancelled;
		if (counted <= 0) return null;
		return Math.round((counts.completed / counted) * 100);
	}
</script>

<script lang="ts">
	interface Props {
		/** Task count per group, every group present (the shape `projectProgress` returns). */
		counts: Record<StateGroup, number>;
		class?: string;
	}

	let { counts, class: className }: Props = $props();

	const percent = $derived(progressPercent(counts));

	/** Only the groups that have tasks: "0 Por empezar" is noise for a screen reader. */
	const summary = $derived(
		STATE_GROUPS.filter((group) => counts[group] > 0)
			.map((group) =>
				m.project_progress_group_count({ count: counts[group], group: stateGroupLabel(group) })
			)
			.join(', ')
	);
</script>

{#if percent === null}
	<p class={['text-sm text-[var(--ink-muted)]', className]}>{m.project_progress_empty()}</p>
{:else}
	<div class={['flex items-center gap-[var(--space-3)]', className]}>
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
			aria-label={m.project_progress_label({ percent, summary })}
			class="h-2 flex-1 overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-2)]"
		>
			<div
				class="h-full rounded-[var(--radius-full)] bg-[var(--success)] transition-[width] duration-[var(--motion-base,160ms)]"
				style:width="{percent}%"
			></div>
		</div>
		<span class="text-sm font-medium text-[var(--ink)] tabular-nums" aria-hidden="true"
			>{percent} %</span
		>
	</div>
{/if}
