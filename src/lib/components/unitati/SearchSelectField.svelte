<script lang="ts" module>
	/** One request per typed word, not per keystroke. */
	const SEARCH_DELAY_MS = 200;
</script>

<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { tick } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { field } from './Field.svelte';
	import type { SelectOption } from './SelectField.svelte';

	interface Props {
		label: string;
		name?: string;
		id?: string;
		placeholder?: string;
		hint?: string;
		/** Rendered and announced; presence alone marks the control invalid. */
		error?: string;
		required?: boolean;
		disabled?: boolean;
		/** `null` is what a nullable column hands over; it clears the selection. */
		value?: string | null;
		/**
		 * Fixed options filtered client-side as the user types. Omit in favour of
		 * `searchUrl` when the full list would mean downloading thousands of rows.
		 */
		options?: SelectOption[];
		/**
		 * An endpoint answering `?q=` with a JSON array of `{ value, label }`.
		 * Required when `options` is omitted; scope it the same way the caller's
		 * existing list endpoint is scoped (organisation and permissions).
		 */
		searchUrl?: string;
		/**
		 * The already-selected option's label, known before any search has run
		 * (editing a record whose remote option is not in the first page of
		 * results). Ignored once the user picks a different option.
		 */
		selectedLabel?: string;
		/** Shows a clear button once a value is selected. Defaults to `!required`. */
		clearable?: boolean;
		/**
		 * Keeps the label in the accessibility tree but hides it visually, for a
		 * dense row (a table cell) where a column heading already names the field.
		 */
		labelHidden?: boolean;
		/**
		 * Several selections instead of one. The picked values live in `values`
		 * (bindable) and post as repeated `name` fields, one hidden input each.
		 * The chosen items show as removable chips outside the trigger, and the popover stays open between picks so a
		 * list of assignees is one gesture, not one per person. `value` is unused.
		 */
		multiple?: boolean;
		values?: string[];
		/** Labels for already-selected remote values not in the first page of results. */
		selectedLabels?: Record<string, string>;
		/**
		 * Told which option was just chosen, or `null` when the selection was
		 * cleared. For a caller that needs more than the `value`, such as the
		 * code a remote option's label leads with. Single selection only.
		 */
		onpick?: (option: SelectOption | null) => void;
		/**
		 * Remote values that are offered but cannot be picked (already linked, say),
		 * shown with `disabledNote` after the label. Only meaningful with `multiple`.
		 */
		disabledValues?: readonly string[];
		disabledNote?: string;
		/**
		 * The labels of everything picked so far, by value. Bindable so a caller can
		 * name a selection in its own words (a refusal that points at one record)
		 * without reaching into the component.
		 */
		pickedLabels?: Record<string, string>;
		/** Replaces the "no results" sentence, e.g. when the results are a specific noun. */
		noneText?: string;
		/** Replaces the "search failed" sentence. */
		failedText?: string;
		/** Replaces what the live region announces as the results change. */
		countText?: (count: number) => string;
		/** Accessible name of the chip list when `multiple`. Defaults to `"{label}: elegidos"`. */
		selectedListLabel?: string;
		class?: string;
	}

	let {
		label,
		name,
		id,
		placeholder,
		hint,
		error,
		required,
		disabled,
		value = $bindable(),
		options: localOptions,
		searchUrl,
		selectedLabel,
		clearable = !required,
		labelHidden = false,
		multiple = false,
		values = $bindable([]),
		selectedLabels,
		onpick,
		disabledValues = [],
		disabledNote,
		pickedLabels = $bindable({}),
		noneText,
		failedText,
		countText,
		selectedListLabel,
		class: className
	}: Props = $props();

	const remote = $derived(searchUrl !== undefined);

	const generatedId = $props.id();
	const triggerId = $derived(id ?? generatedId);
	const errorId = $derived(`${triggerId}-error`);
	const hintId = $derived(`${triggerId}-hint`);

	const describedBy = $derived(
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
	);

	const styles = $derived(field({ invalid: Boolean(error) }));

	let open = $state(false);
	let query = $state('');
	let remoteResults = $state<SelectOption[]>([]);
	let remoteFailed = $state(false);

	// Tracks a selection made inside this component, keyed by the `value` it
	// belongs to. Once the caller's `value` prop moves on to something this
	// component did not just set (switching which record is being edited), the
	// derived `knownLabel` below falls back to the caller's `selectedLabel`
	// instead of a stale label from a previous record.
	let pickedValue = $state<string | undefined>(undefined);
	let pickedLabel = $state<string | undefined>(undefined);
	const knownLabel = $derived(value === pickedValue ? pickedLabel : selectedLabel);

	const localMatches = $derived(
		remote
			? []
			: (localOptions ?? []).filter((option) =>
					option.label.toLowerCase().includes(query.trim().toLowerCase())
				)
	);
	const candidates = $derived(remote ? remoteResults : localMatches);

	const selectedOption = $derived(
		remote
			? value
				? { value, label: knownLabel ?? value }
				: undefined
			: (localOptions ?? []).find((option) => option.value === value)
	);

	// Asks the server once typing pauses, and a reply to a
	// stale query can never land after a newer one.
	$effect(() => {
		if (!remote || !open) return;

		const term = query;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`${searchUrl}?q=${encodeURIComponent(term)}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error(String(response.status));
				remoteResults = (await response.json()) as SelectOption[];
				remoteFailed = false;
			} catch (err) {
				if ((err as Error).name !== 'AbortError') remoteFailed = true;
			}
		}, SEARCH_DELAY_MS);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Labels learned from picks in this component, so a chip keeps its text
	// after the remote results that produced it have been replaced.
	const chips = $derived(
		values.map((v) => ({
			value: v,
			label:
				pickedLabels[v] ??
				selectedLabels?.[v] ??
				(localOptions ?? []).find((option) => option.value === v)?.label ??
				v
		}))
	);

	function toggle(option: SelectOption) {
		if (values.includes(option.value)) {
			values = values.filter((v) => v !== option.value);
		} else {
			pickedLabels[option.value] = option.label;
			values = [...values, option.value];
		}
	}

	let triggerEl = $state<HTMLElement | null>(null);
	// Plain (non-reactive) map: only read when a chip is removed.
	const chipButtons: Record<string, HTMLButtonElement | undefined> = {};

	// The button that was pressed leaves the DOM, and focus would fall to the
	// page. It goes to the next chip, else the previous one, else the trigger.
	async function remove(removed: string) {
		const index = chips.findIndex((chip) => chip.value === removed);
		const rest = chips.filter((chip) => chip.value !== removed);
		const next = rest[index] ?? rest[index - 1];
		values = values.filter((v) => v !== removed);
		await tick();
		(next ? chipButtons[next.value] : triggerEl)?.focus();
	}

	const resultsAnnouncement = $derived(
		countText ? countText(candidates.length) : m.field_search_count({ count: candidates.length })
	);

	function select(option: SelectOption) {
		if (multiple) return toggle(option);
		value = option.value;
		pickedValue = option.value;
		pickedLabel = option.label;
		query = '';
		open = false;
		onpick?.(option);
	}

	function clear(event: MouseEvent) {
		event.stopPropagation();
		value = null;
		pickedValue = undefined;
		pickedLabel = undefined;
		query = '';
		onpick?.(null);
	}
</script>

<div class={styles.root({ class: className })}>
	<label for={triggerId} class={labelHidden ? 'sr-only' : styles.label()}>{label}</label>

	{#if multiple}
		{#each values as v (v)}
			<input type="hidden" {name} value={v} />
		{/each}
	{:else}
		<input type="hidden" {name} value={value ?? ''} {required} />
	{/if}

	{#if multiple && chips.length > 0}
		<ul
			aria-label={selectedListLabel ?? m.field_selected({ label })}
			class="flex flex-wrap gap-[var(--space-1)]"
		>
			{#each chips as chip (chip.value)}
				<li
					class="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-2)] py-px pr-px pl-[var(--space-2)] text-xs leading-5"
				>
					{chip.label}
					<button
						type="button"
						bind:this={chipButtons[chip.value]}
						{disabled}
						class="grid size-5 place-items-center rounded-[var(--radius-full)] hover:bg-[var(--border)]"
						aria-label={m.field_remove_item({ item: chip.label, label })}
						onclick={() => remove(chip.value)}
					>
						<XIcon class="size-3" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<Popover.Root bind:open>
		<Popover.Trigger
			id={triggerId}
			bind:ref={triggerEl}
			type="button"
			{disabled}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class={[
				styles.input(),
				'flex items-center justify-between gap-[var(--space-2)] text-left'
			].join(' ')}
		>
			{#if multiple}
				<span class={chips.length > 0 ? '' : 'text-[var(--ink-muted)]'}>
					{chips.length > 0 ? m.field_selected_count({ count: chips.length }) : (placeholder ?? '')}
				</span>
			{:else}
				<span class={selectedOption ? '' : 'text-[var(--ink-muted)]'}>
					{selectedOption?.label ?? placeholder ?? ''}
				</span>
			{/if}
			<span class="flex items-center gap-[var(--space-1)]">
				{#if !multiple && clearable && selectedOption}
					<button
						type="button"
						class="grid size-5 place-items-center rounded-[var(--radius-full)] hover:bg-[var(--surface-2)]"
						aria-label={m.field_clear({ label })}
						onclick={clear}
					>
						<XIcon class="size-3.5" aria-hidden="true" />
					</button>
				{/if}
				<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" aria-hidden="true" />
			</span>
		</Popover.Trigger>

		<Popover.Content class="w-(--bits-popover-anchor-width) p-0">
			<Command.Root shouldFilter={!remote}>
				<Command.Input
					bind:value={query}
					placeholder={placeholder ?? ''}
					onkeydown={(event) => {
						// Enter inside a search box submits the surrounding form: not what was meant.
						if (event.key === 'Enter') event.preventDefault();
					}}
				/>
				<!-- Always in the DOM: a live region inserted together with its text is often not announced. -->
				<p class="sr-only" role="status">
					{open && !remoteFailed ? resultsAnnouncement : ''}
				</p>
				<Command.List>
					{#if remote && remoteFailed}
						<Command.Empty>{failedText ?? m.field_search_failed()}</Command.Empty>
					{:else}
						<Command.Empty>{noneText ?? m.field_search_none()}</Command.Empty>
					{/if}
					{#each candidates as option (option.value)}
						<Command.Item
							value={option.value}
							disabled={option.disabled || disabledValues.includes(option.value)}
							onSelect={() => select(option)}
							aria-selected={multiple ? values.includes(option.value) : undefined}
						>
							{#if multiple && values.includes(option.value)}
								<span aria-hidden="true">✓</span>
							{/if}
							{option.label}
							{#if disabledValues.includes(option.value) && disabledNote}
								<span class="ml-auto text-xs text-[var(--ink-muted)]">{disabledNote}</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}

	{#if error}
		<p id={errorId} class={styles.help()}>{error}</p>
	{/if}
</div>
