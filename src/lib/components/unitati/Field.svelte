<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-field` family: a label, a control, and one line of help that turns
	 * into the error. `error` drives both the border and the help colour, so an
	 * invalid field cannot look valid.
	 */
	export const field = tv({
		slots: {
			root: 'flex min-w-[220px] flex-col gap-[var(--space-1)]',
			label: 'text-[13px] leading-4 font-medium text-[var(--ink)]',
			input: [
				'h-[var(--size-control-md)] w-full box-border px-[var(--space-3)]',
				'rounded-[var(--radius-md)] border bg-[var(--surface-1)]',
				'text-base md:text-sm leading-5 text-[var(--ink)] transition-colors ut-transition-fast',
				'placeholder:text-[var(--ink-muted)] disabled:opacity-50'
			],
			help: 'text-[13px] leading-[18px]'
		},
		variants: {
			invalid: {
				true: { input: 'border-[var(--danger)]', help: 'text-[var(--danger)]' },
				false: { input: 'border-[var(--border-strong)]', help: 'text-[var(--ink-muted)]' }
			}
		},
		defaultVariants: { invalid: false }
	});
</script>

<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'value' | 'class'> {
		label: string;
		/** Rendered and announced; presence alone marks the control invalid. */
		error?: string;
		hint?: string;
		/** `null` is what a nullable column hands over; it renders as an empty box. */
		value?: string | null;
		/** Narrower than Svelte's `ClassValue`: tailwind-variants merges strings. */
		class?: string;
	}

	let {
		label,
		error,
		hint,
		id,
		// No fallback: a form library hands over `undefined` for an optional field,
		// and Svelte refuses `bind:value={undefined}` into a prop that has one.
		value = $bindable(),
		class: className,
		...rest
	}: Props = $props();

	// `$props.id()`, not a random string: the server and the client have to agree
	// on this value. `crypto.randomUUID()` gives each render a different one, so
	// hydrating the SSR'd login and setup forms left every `for` pointing at an
	// id that no longer existed. An explicitly passed `id` still wins, reactively.
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

	<input
		id={fieldId}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={styles.input()}
		{...rest}
	/>

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class={styles.help()}>{error}</p>
	{/if}
</div>
