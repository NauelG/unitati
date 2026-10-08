<script lang="ts" module>
	export interface SelectOption {
		value: string;
		label: string;
	}
</script>

<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { field } from './Field.svelte';

	interface Props extends Omit<HTMLSelectAttributes, 'value' | 'class' | 'children'> {
		label: string;
		options: SelectOption[];
		/**
		 * Text of the empty choice. Without it the control has no empty option, so
		 * it is for a value that always has an answer; with it, `''` is selectable
		 * and is what a nullable column submits for "none".
		 */
		placeholder?: string;
		/** Rendered and announced; presence alone marks the control invalid. */
		error?: string;
		hint?: string;
		/** `null` is what a nullable column hands over; it selects the empty choice. */
		value?: string | null;
		class?: string;
	}

	let {
		label,
		options,
		placeholder,
		error,
		hint,
		id,
		// No fallback: a form library hands over `undefined` for an optional field,
		// and Svelte refuses `bind:value={undefined}` into a prop that has one.
		value = $bindable(),
		class: className,
		...rest
	}: Props = $props();

	// Same reasoning as `Field`: the id has to agree between server and client.
	const generatedId = $props.id();
	const selectId = $derived(id ?? generatedId);
	const errorId = $derived(`${selectId}-error`);
	const hintId = $derived(`${selectId}-hint`);

	const describedBy = $derived(
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
	);

	const styles = $derived(field({ invalid: Boolean(error) }));
</script>

<div class={styles.root({ class: className })}>
	<label for={selectId} class={styles.label()}>{label}</label>

	<select
		id={selectId}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={styles.input()}
		{...rest}
	>
		{#if placeholder !== undefined}
			<option value="">{placeholder}</option>
		{/if}
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class={styles.help()}>{error}</p>
	{/if}
</div>
