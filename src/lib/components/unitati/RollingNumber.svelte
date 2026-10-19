<script lang="ts">
	import NumberFlow from '@number-flow/svelte';
	import { NUMBER_FLOW_TIMING } from '#lib/motion.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { isHydrated } from '#lib/hydration.svelte.js';

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

<!--
	NumberFlow cannot be hydrated: on the server it renders its shadow DOM through
	an `{@html}` block that is empty in the browser, and Svelte 5 then fails to
	hydrate the element and throws the whole page into the error boundary. So the
	server and the first client render both print the plain number, and NumberFlow
	takes over once the app has hydrated, which is also when it starts to animate.
-->
{#if isHydrated()}
	<NumberFlow
		{value}
		locales={getLocale()}
		{...NUMBER_FLOW_TIMING}
		class={className}
		style="font-variant-numeric: tabular-nums;"
	/>
{:else}
	<span class={className} style="font-variant-numeric: tabular-nums;"
		>{new Intl.NumberFormat(getLocale()).format(value)}</span
	>
{/if}
