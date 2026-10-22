<script lang="ts">
	import { SPACE_ICONS, type SpaceIcon } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';
	import { SPACE_ICON_COMPONENTS } from './space-icons';

	interface Props {
		/** The submitted field name. */
		name: string;
		/** The chosen key of `SPACE_ICONS`. */
		value?: SpaceIcon;
		label?: string;
		error?: string;
		class?: string;
	}

	let {
		name,
		value = $bindable(SPACE_ICONS[0]),
		label = m.knowledge_icon_picker_label(),
		error,
		class: className
	}: Props = $props();
</script>

<!--
	A grid over the closed set of space icons (ADR 0031). A radio group: each cell
	is a real `<input type="radio">` under a visible label, so it posts without
	script, is reached by arrow keys, and the selection is announced by the
	browser rather than by colour alone (a ring plus the tinted cell).
-->
<fieldset class="min-w-0 space-y-[var(--space-2)] {className ?? ''}">
	<legend class="text-label text-[var(--ink)]">{label}</legend>
	<div class="grid grid-cols-6 gap-[var(--space-1)] sm:grid-cols-8">
		{#each SPACE_ICONS as icon (icon)}
			{@const Icon = SPACE_ICON_COMPONENTS[icon]}
			<label
				class="ut-transition-fast relative flex size-10 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-soft)] has-[:checked]:text-[var(--brand)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
				title={icon}
			>
				<input type="radio" {name} value={icon} bind:group={value} class="sr-only" />
				<Icon class="size-5" />
				<span class="sr-only">{icon}</span>
			</label>
		{/each}
	</div>
	{#if error}
		<p class="text-small text-[var(--danger)]" role="alert">{error}</p>
	{/if}
</fieldset>
