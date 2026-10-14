<script lang="ts">
	import NumberFlow from '@number-flow/svelte';
	import { MOTION_BASE_MS, MOTION_SLOW_MS } from '#lib/motion.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	/**
	 * S2, the living header (#91): a count that rolls when it changes and sits
	 * still otherwise. NumberFlow animates only on updates — the first render is
	 * the plain number, so a page load never rolls — and it stops itself under
	 * `prefers-reduced-motion` (`respectMotionPreference`, on by default).
	 *
	 * Every timing is pinned inside the motion constitution: a roll is a macro
	 * step (`--motion-slow`, the 240ms ceiling) and the fade of the digits that
	 * leave or arrive is a micro one. NumberFlow's own defaults (900ms) would
	 * break rule 2.
	 */
	interface Props {
		value: number;
		class?: string;
	}

	let { value, class: className }: Props = $props();

	const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
	const timing = { duration: MOTION_SLOW_MS, easing: EASE };
</script>

<NumberFlow
	{value}
	locales={getLocale()}
	transformTiming={timing}
	spinTiming={timing}
	opacityTiming={{ duration: MOTION_BASE_MS, easing: 'ease-out' }}
	class={className}
	style="font-variant-numeric: tabular-nums;"
/>
