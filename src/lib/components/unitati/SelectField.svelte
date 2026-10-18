<script lang="ts" module>
	export interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
		/** A record's code, for a caller that must name the pick without parsing the label. */
		tag?: string;
		/** The record's own title, beside `tag`, for the same reason. */
		title?: string;
	}
</script>

<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import * as Select from '#lib/components/ui/select/index.js';
	import { field } from './Field.svelte';

	interface Props {
		label: string;
		options: SelectOption[];
		name?: string;
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
		id?: string;
		required?: boolean;
		disabled?: boolean;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		/**
		 * Keeps the label in the accessibility tree but hides it visually, for a
		 * dense row (a table cell) where a column heading already names the field.
		 * Prefer a visible `label` whenever there is room for one.
		 */
		labelHidden?: boolean;
		/**
		 * Fired after the user picks an option, with the new value (`null` for the
		 * empty choice). For a select that submits its form on change.
		 */
		onchange?: (value: string | null) => void;
		class?: string;
	}

	let {
		label,
		options,
		name,
		placeholder,
		error,
		hint,
		id,
		required,
		disabled,
		autocomplete,
		labelHidden = false,
		onchange,
		// No fallback: a form library hands over `undefined` for an optional field,
		// and Svelte refuses `bind:value={undefined}` into a prop that has one.
		value = $bindable(),
		class: className
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

	// bits-ui's single-select wants a string, never `null`/`undefined`; the empty
	// string is the placeholder item's value, matching what the native `<select>`
	// this replaces submitted for "none".
	const selectValue = $derived(value ?? '');

	function onValueChange(next: string) {
		value = next === '' ? null : next;
		onchange?.(value);
	}
</script>

<div class={styles.root({ class: className })}>
	<label for={selectId} class={labelHidden ? 'sr-only' : styles.label()}>{label}</label>

	<Select.Root
		type="single"
		{name}
		{required}
		{disabled}
		{autocomplete}
		items={options}
		value={selectValue}
		{onValueChange}
	>
		<Select.Trigger
			id={selectId}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class={styles.input({
				// The vendored trigger sets `data-[size=default]:h-8` (0,2,0), which beats a plain
				// `h-*` (0,1,0); repeating the variant is the only way to win without editing `ui/`.
				class: 'data-[size=default]:h-[var(--size-control-md)]'
			})}
		>
			<Select.Value {placeholder} />
		</Select.Trigger>
		<Select.Content>
			{#if placeholder !== undefined}
				<Select.Item value="" label={placeholder}>{placeholder}</Select.Item>
			{/if}
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} disabled={option.disabled}>
					{option.label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class={styles.help()}>{error}</p>
	{/if}
</div>
