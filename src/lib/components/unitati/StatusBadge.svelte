<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The `.ut-badge` family. Full-pill geometry (ADR 0019): a status marker is
	 * the one shape in the radius grammar that stays a pill, visibly distinct
	 * from the 8px buttons/inputs/selects and the 12px panels around it. The
	 * dot is a `::before` pseudo-element inheriting `currentColor`, exactly as
	 * the design system draws it, so the tone sets one colour and the dot
	 * follows.
	 */
	export const badge = tv({
		base: [
			'inline-flex items-center gap-[var(--space-1)] h-[22px] px-[var(--space-2)]',
			'rounded-[var(--radius-full)] text-caption whitespace-nowrap',
			// A task state's name is user-authored and has no measure of its own.
			'max-w-[24ch] overflow-hidden text-ellipsis',
			"before:content-[''] before:size-1.5 before:rounded-[var(--radius-full)] before:bg-current"
		],
		variants: {
			tone: {
				brand: 'bg-[var(--brand-soft)] text-[var(--brand)]',
				desk: 'bg-[var(--desk-soft)] text-[var(--desk)]',
				success: 'bg-[var(--success-soft)] text-[var(--success)]',
				warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
				danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
				neutral: 'bg-[var(--surface-2)] text-[var(--ink-muted)]'
			},
			/** `ut-badge-plain`: no dot, for a label that names a kind of thing rather than a state. */
			plain: { true: 'before:hidden' },
			/**
			 * The change pulse (#87): a ≤160ms scale keyframe (`app.css`), fired
			 * only by `status` actually changing after mount — see the `$effect`
			 * below. Never a mount animation: that would pulse every badge on
			 * every page load, which explains nothing about a causal change.
			 */
			pulsing: { true: 'animate-[ut-badge-pulse_160ms_var(--ease-out)]' }
		}
		// No `defaultVariants`: the tone is always derived from the status, so a
		// default would be a value nothing can reach.
	});
</script>

<script lang="ts">
	import { statusBadge, type BadgeKey } from './status.js';
	import { MOTION_BASE_MS } from '#lib/motion.js';

	interface Props {
		/**
		 * A status key, never display text. The union is the point: `"En curso"`
		 * fails `npm run check` instead of rendering an untranslated badge.
		 */
		status: BadgeKey;
		/** Replaces the text, keeping the tone: a task state shows its own (user-authored) name. */
		label?: string;
		/**
		 * S2 (#91), the single-pulse signal: the row this badge sits in just
		 * arrived flagged urgent (see `createUrgentArrivals`). Pulses once when
		 * it turns `true`, including on the render that mounts a new row —
		 * which is why it is a prop and not inferred from `status` changing.
		 * Stays `false` on a page's first load, so nothing pulses on arrival
		 * at the page itself.
		 */
		arrived?: boolean;
		class?: string;
	}

	let { label, status, arrived = false, class: className }: Props = $props();

	const resolved = $derived(statusBadge(status));

	let pulsing = $state(false);
	/**
	 * `undefined` until the effect below has run once: that first run is
	 * always the mount, which must never count as a status "change" — a badge
	 * that pulsed on every page load would explain nothing, which the
	 * constitution (rule 6) rules out outright.
	 */
	let previousStatus: typeof status | undefined = undefined;
	let previousArrived = false;
	let pulseTimeout: ReturnType<typeof setTimeout> | undefined;

	function pulse() {
		pulsing = false;
		clearTimeout(pulseTimeout);
		// Reset before reapplying: two changes within 160ms must restart the
		// keyframe from its first frame, not let the first run finish quietly
		// while the badge already reads the new tone.
		requestAnimationFrame(() => {
			pulsing = true;
		});
		pulseTimeout = setTimeout(() => {
			pulsing = false;
		}, MOTION_BASE_MS);
	}

	$effect(() => {
		const changed = previousStatus !== undefined && status !== previousStatus;
		const arrivedNow = arrived && !previousArrived;
		previousStatus = status;
		previousArrived = arrived;
		if (changed || arrivedNow) pulse();
	});
</script>

{#if resolved}
	<span class={badge({ tone: resolved.tone, pulsing, class: className })} title={label}
		><span class="min-w-0 truncate">{label ?? resolved.label}</span></span
	>
{/if}
