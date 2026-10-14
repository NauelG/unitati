<script lang="ts">
	import NumberFlow from '@number-flow/svelte';
	import { NUMBER_FLOW_TIMING } from '#lib/motion.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	/**
	 * S2, the living header (#91): a count that rolls when it changes and sits
	 * still otherwise. NumberFlow animates only on updates — the first render is
	 * the plain number, so a page load never rolls — and it stops itself under
	 * `prefers-reduced-motion` (`respectMotionPreference`, on by default).
	 *
	 * Timings are `NUMBER_FLOW_TIMING` (`motion.ts`), shared with `KpiCard`:
	 * NumberFlow's own 900ms default would break the 240ms ceiling.
	 */
	interface Props {
		value: number;
		class?: string;
	}

	let { value, class: className }: Props = $props();
</script>

<NumberFlow
	{value}
	locales={getLocale()}
	{...NUMBER_FLOW_TIMING}
	class={className}
	style="font-variant-numeric: tabular-nums;"
/>
