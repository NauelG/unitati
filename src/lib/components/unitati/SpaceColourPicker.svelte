<script lang="ts">
	import { SPACE_COLOURS, spaceColourVar, type SpaceColour } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** The submitted field name. */
		name: string;
		/** The chosen key of `SPACE_COLOURS`. */
		value?: SpaceColour;
		label?: string;
		error?: string;
		class?: string;
	}

	let {
		name,
		value = $bindable(SPACE_COLOURS[0]),
		label = m.knowledge_colour_picker_label(),
		error,
		class: className
	}: Props = $props();

	const NAMES: Record<SpaceColour, () => string> = {
		gray: m.knowledge_colour_gray,
		blue: m.knowledge_colour_blue,
		violet: m.knowledge_colour_violet,
		pink: m.knowledge_colour_pink,
		red: m.knowledge_colour_red,
		amber: m.knowledge_colour_amber,
		green: m.knowledge_colour_green,
		teal: m.knowledge_colour_teal
	};
</script>

<!--
	Swatches over the fixed palette (`--kb-*` in `app.css`, light and dark values):
	no free hex. A radio group like the icon picker; the chosen swatch carries a
	ring, and every swatch has its colour's name for assistive tech.
-->
<fieldset class="min-w-0 space-y-[var(--space-2)] {className ?? ''}">
	<legend class="text-label text-[var(--ink)]">{label}</legend>
	<div class="flex flex-wrap gap-[var(--space-2)]">
		{#each SPACE_COLOURS as colour (colour)}
			<label
				class="relative flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-full)] border-2 border-transparent has-[:checked]:border-[var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
				title={NAMES[colour]()}
			>
				<input type="radio" {name} value={colour} bind:group={value} class="sr-only" />
				<span
					class="size-5 rounded-[var(--radius-full)]"
					style:background-color={spaceColourVar(colour)}
					aria-hidden="true"
				></span>
				<span class="sr-only">{NAMES[colour]()}</span>
			</label>
		{/each}
	</div>
	{#if error}
		<p class="text-small text-[var(--danger)]" role="alert">{error}</p>
	{/if}
</fieldset>
