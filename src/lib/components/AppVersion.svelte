<!--
	The running version, plus "Con tecnología de Unitati" whenever the brand is
	customised (#163).

	The attribution CANNOT be removed: there is deliberately no prop, setting or
	env var that hides it. Do not add a `hideAttribution`, a "paid" flag or
	similar; see #157 Q6 and ADR 0026 (the brand is the customer's, the credit to
	the software is not). It is plain text, no link and no Unitati art, because
	the repository is private (#157 Q16) and the golden rule is text only (Q10).
	It is hidden when the brand is not customised: "Unitati, powered by Unitati"
	is noise.
-->
<script lang="ts">
	import { currentBrand } from '#lib/brand.svelte.js';
	import { UPSTREAM_PRODUCT_NAME } from '#lib/domain/brand.js';
	import { m } from '#lib/paraglide/messages.js';
	import { APP_VERSION } from '#lib/version.js';

	interface Props {
		class?: string;
		/**
		 * `inline`: `Con tecnología de Unitati · v0.x.y` on one line. `stacked`:
		 * the attribution above the version, for the 248 px sidebar and drawer
		 * footers where the inline form does not fit.
		 */
		layout?: 'inline' | 'stacked';
	}

	let { class: className = '', layout = 'inline' }: Props = $props();

	const customised = $derived(currentBrand().customised);
	const attribution = $derived(m.powered_by({ product: UPSTREAM_PRODUCT_NAME }));
</script>

{#if !customised}
	<span class="font-mono text-xs text-[var(--ink-muted)] {className}" title="Unitati version"
		>v{APP_VERSION}</span
	>
{:else if layout === 'stacked'}
	<span class="flex flex-col text-xs text-[var(--ink-muted)] {className}" title="Unitati version">
		<span data-line class="font-sans">{attribution}</span>
		<span data-line class="font-mono">v{APP_VERSION}</span>
	</span>
{:else}
	<span class="text-xs text-[var(--ink-muted)] {className}" title="Unitati version"
		><span class="font-sans">{attribution}</span> ·
		<span class="font-mono">v{APP_VERSION}</span></span
	>
{/if}
