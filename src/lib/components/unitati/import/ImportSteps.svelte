<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	/** The four steps every CSV import shares; `current` is the index of the active one. */
	let { current }: { current: number } = $props();

	const LABELS = [
		() => m.import_step_file(),
		() => m.import_step_columns(),
		() => m.import_step_preview(),
		() => m.import_step_result()
	];
</script>

<ol
	class="mt-[var(--space-5)] flex flex-wrap gap-[var(--space-4)] text-sm"
	aria-label={m.import_steps_label()}
>
	{#each LABELS as label, index (index)}
		<li
			class={index === current ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}
			aria-current={index === current ? 'step' : undefined}
		>
			{index + 1}. {label()}
		</li>
	{/each}
</ol>
