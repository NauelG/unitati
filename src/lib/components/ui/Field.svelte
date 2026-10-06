<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'value'> {
		label: string;
		/** Rendered and announced; presence alone marks the control invalid. */
		error?: string;
		hint?: string;
		value?: string;
	}

	let { label, error, hint, id, value = $bindable(''), ...rest }: Props = $props();

	// Generated once, so the label never points at a stale control, while an
	// explicitly passed `id` stays reactive.
	const generatedId = `field-${crypto.randomUUID().slice(0, 8)}`;
	const fieldId = $derived(id ?? generatedId);
	const errorId = $derived(`${fieldId}-error`);
	const hintId = $derived(`${fieldId}-hint`);

	const describedBy = $derived(
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="space-y-1.5">
	<label for={fieldId} class="block text-sm font-medium text-[var(--ink)]">{label}</label>

	<input
		id={fieldId}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class="h-[var(--size-control-md)] w-full rounded-[var(--radius-md)] border bg-[var(--surface-1)] px-3 text-sm text-[var(--ink)] transition-colors placeholder:text-[var(--ink-muted)] disabled:opacity-50"
		style:border-color={error ? 'var(--danger)' : 'var(--border-strong)'}
		{...rest}
	/>

	{#if hint}
		<p id={hintId} class="text-xs text-[var(--ink-muted)]">{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class="text-xs text-[var(--danger)]">{error}</p>
	{/if}
</div>
