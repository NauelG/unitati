<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLButtonAttributes, 'role' | 'aria-checked' | 'children'> {
		checked: boolean;
		/** The accessible name; the switch has no visible text of its own. */
		label: string;
	}

	let { checked, label, type = 'button', class: className, ...rest }: Props = $props();
</script>

<!--
	An on/off control (#302). A button with `role="switch"` rather than a checkbox,
	so it can be the submit button of a one-field form that posts the next value:
	it then works without script, and `use:enhance` makes it feel instant. The
	state is read out from `aria-checked`, and the thumb's position, not only its
	colour, says which side it is on.
-->
<button
	{...rest}
	{type}
	role="switch"
	aria-checked={checked}
	aria-label={label}
	class="ut-transition-fast relative inline-flex h-5 w-9 shrink-0 items-center rounded-[var(--radius-full)] transition-colors disabled:cursor-not-allowed disabled:opacity-45 {checked
		? 'bg-[var(--action)]'
		: 'bg-[var(--border-strong)]'} {className ?? ''}"
>
	<span
		class="ut-transition-fast pointer-events-none block size-4 rounded-[var(--radius-full)] bg-[var(--surface-1)] shadow-[var(--shadow-sm)] transition-transform {checked
			? 'translate-x-[18px]'
			: 'translate-x-0.5'}"
		aria-hidden="true"
	></span>
</button>
