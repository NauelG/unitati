<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { field } from './Field.svelte';

	interface Props extends Omit<HTMLTextareaAttributes, 'value' | 'class'> {
		label: string;
		/** Rendered and announced; presence alone marks the control invalid. */
		error?: string;
		hint?: string;
		/** `null` is what a nullable column hands over; it renders as an empty box. */
		value?: string | null;
		class?: string;
	}

	let { label, error, hint, id, value = $bindable(), class: className, ...rest }: Props = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const errorId = $derived(`${fieldId}-error`);
	const hintId = $derived(`${fieldId}-hint`);

	const describedBy = $derived(
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
	);

	const styles = $derived(field({ invalid: Boolean(error) }));
</script>

<div class={styles.root({ class: className })}>
	<label for={fieldId} class={styles.label()}>{label}</label>

	<textarea
		id={fieldId}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		rows={4}
		class={styles.input({ class: 'h-auto min-h-24 resize-y py-[var(--space-2)]' })}
		{...rest}></textarea>

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class={styles.help()}>{error}</p>
	{/if}
</div>
