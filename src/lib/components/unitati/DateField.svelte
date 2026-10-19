<script lang="ts">
	import { DateField as DateFieldPrimitive } from 'bits-ui';
	import { today, getLocalTimeZone, type DateValue } from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Calendar } from '#lib/components/ui/calendar/index.js';
	import { field } from './Field.svelte';
	import { parseIsoDate, toIsoDate } from '#lib/domain/calendar-date.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		label: string;
		/** Posted as `YYYY-MM-DD`, or an empty string once cleared. */
		name?: string;
		/** `YYYY-MM-DD`; `null` is what a nullable column hands over. Bindable. */
		value?: string | null;
		hint?: string;
		/** Rendered and announced; presence alone marks the control invalid. */
		error?: string;
		required?: boolean;
		disabled?: boolean;
		id?: string;
		/** Narrower than Svelte's `ClassValue`: tailwind-variants merges strings. */
		class?: string;
		/** Fired on every pick, typing completion, "Hoy" and "Borrar". */
		onchange?: (value: string | null) => void;
	}

	let {
		label,
		name,
		value = $bindable(null),
		hint,
		error,
		required,
		disabled,
		id,
		class: className,
		onchange
	}: Props = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const errorId = $derived(`${fieldId}-error`);
	const hintId = $derived(`${fieldId}-hint`);
	const describedBy = $derived(
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
	);

	const styles = $derived(field({ invalid: Boolean(error) }));

	const LOCALE = 'es-ES';
	let open = $state(false);

	// The segments hold a partial date while the user types; `undefined` until all three are in.
	const date = $derived<DateValue | undefined>(parseIsoDate(value));

	function set(next: DateValue | undefined) {
		const iso = next ? toIsoDate(next) : null;
		if (iso === (value ?? null)) return;
		value = iso;
		onchange?.(iso);
	}
</script>

<div class={styles.root({ class: className })}>
	<span id={`${fieldId}-label`} class={styles.label()}>{label}</span>

	<DateFieldPrimitive.Root
		value={date}
		onValueChange={set}
		locale={LOCALE}
		{required}
		{disabled}
		granularity="day"
	>
		<div
			class={[
				'flex items-center',
				'box-border h-[var(--size-control-md)] w-full pr-1 pl-[var(--space-3)]',
				'ut-transition-fast rounded-[var(--radius-md)] border bg-[var(--surface-1)] transition-colors',
				'text-base leading-5 text-[var(--ink)] md:text-sm',
				error ? 'border-[var(--danger)]' : 'border-[var(--border-strong)]',
				'focus-within:border-[var(--focus)] focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--focus)_12%,transparent)]',
				disabled && 'opacity-50'
			]}
		>
			<DateFieldPrimitive.Input
				id={fieldId}
				aria-labelledby={`${fieldId}-label`}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={describedBy}
				class="flex flex-1 items-center"
			>
				{#snippet children({ segments })}
					{#each segments as { part, value: text }, i (part + i)}
						{#if part === 'literal'}
							<DateFieldPrimitive.Segment {part} class="text-[var(--ink-muted)]">
								{text}
							</DateFieldPrimitive.Segment>
						{:else}
							<DateFieldPrimitive.Segment
								{part}
								class="rounded-sm px-0.5 tabular-nums outline-none focus:bg-[var(--brand)] focus:text-[var(--on-brand)] data-[placeholder]:text-[var(--ink-muted)]"
							>
								{text}
							</DateFieldPrimitive.Segment>
						{/if}
					{/each}
				{/snippet}
			</DateFieldPrimitive.Input>

			<Popover.Root bind:open>
				<Popover.Trigger
					type="button"
					{disabled}
					aria-label={m.date_field_open({ label })}
					class="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:pointer-events-none"
				>
					<CalendarIcon class="size-4" aria-hidden="true" />
				</Popover.Trigger>
				<Popover.Content align="end" class="w-auto p-0">
					<Calendar
						type="single"
						locale={LOCALE}
						weekStartsOn={1}
						value={date}
						onValueChange={(next) => {
							set(next);
							open = false;
						}}
					/>
					<div class="flex justify-between border-t border-[var(--border)] p-2">
						<button
							type="button"
							class="rounded-sm px-2 py-1 text-small text-[var(--brand)] hover:underline"
							onclick={() => {
								set(today(getLocalTimeZone()));
								open = false;
							}}
						>
							{m.date_field_today()}
						</button>
						<button
							type="button"
							class="rounded-sm px-2 py-1 text-small text-[var(--ink-muted)] hover:underline"
							onclick={() => {
								set(undefined);
								open = false;
							}}
						>
							{m.date_field_clear()}
						</button>
					</div>
				</Popover.Content>
			</Popover.Root>
		</div>
	</DateFieldPrimitive.Root>

	{#if name}
		<input type="hidden" {name} value={value ?? ''} />
	{/if}

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class={styles.help()} role="alert">{error}</p>
	{/if}
</div>
