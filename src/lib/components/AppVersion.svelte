<!--
	The running version, a link to the source code, plus "Con tecnología de
	Unitati" whenever the brand is customised (#163).

	The attribution CANNOT be removed: there is deliberately no prop, setting or
	env var that hides it. Do not add a `hideAttribution`, a "paid" flag or
	similar; see #157 Q6 and ADR 0026 (the brand is the customer's, the credit to
	the software is not). It is plain text and no Unitati art (#157 Q10). It is
	hidden when the brand is not customised: "Unitati, powered by Unitati" is
	noise.

	The source link CANNOT be removed either, customised brand or not: Unitati is
	AGPL-3.0-only, and section 13 obliges whoever serves a modified copy to offer
	its source to the people using it. The URL is package.json `repository`, so a
	fork that points it at its own code complies without touching this file
	(ADR 0041). It replaces the link #157 Q16 deferred while the repository was
	private.
-->
<script lang="ts">
	import { currentBrand } from '#lib/brand.svelte.js';
	import { UPSTREAM_PRODUCT_NAME } from '#lib/domain/brand.js';
	import { m } from '#lib/paraglide/messages.js';
	import { APP_SOURCE_URL, APP_VERSION } from '#lib/version.js';

	interface Props {
		class?: string;
		/**
		 * `inline`: `Con tecnología de Unitati · v0.x.y · Código fuente` on one
		 * line. `stacked`: the attribution above the version, for the 248 px
		 * sidebar and drawer footers where the inline form does not fit.
		 */
		layout?: 'inline' | 'stacked';
		/** `inherit` takes the size of the container (the sidebar footer's 11px); `default` is `text-xs`. */
		size?: 'default' | 'inherit';
	}

	let { class: className = '', layout = 'inline', size: sizeProp = 'default' }: Props = $props();

	const size = $derived(sizeProp === 'inherit' ? '' : 'text-xs');
	const customised = $derived(currentBrand().customised);
	const attribution = $derived(m.powered_by({ product: UPSTREAM_PRODUCT_NAME }));
</script>

{#snippet versionAndSource()}
	<span class="font-mono" title="Unitati version">v{APP_VERSION}</span> ·
	<a
		href={APP_SOURCE_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="font-sans hover:text-[var(--ink)] hover:underline">{m.source_code()}</a
	>
{/snippet}

{#if !customised}
	<span class="{size} text-[var(--ink-muted)] {className}">{@render versionAndSource()}</span>
{:else if layout === 'stacked'}
	<span class="flex flex-col {size} text-[var(--ink-muted)] {className}">
		<span data-line class="font-sans">{attribution}</span>
		<span data-line>{@render versionAndSource()}</span>
	</span>
{:else}
	<span class="{size} text-[var(--ink-muted)] {className}"
		><span class="font-sans">{attribution}</span> · {@render versionAndSource()}</span
	>
{/if}
