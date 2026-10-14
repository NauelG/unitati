<script lang="ts" module>
	/** Same pause as `AssetPicker`: one request per typed word, not per keystroke. */
	const SEARCH_DELAY_MS = 200;
</script>

<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
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
		 * (bindable) and post as repeated `name` fields, one hidden input each,
		 * the way `AssetPicker` does. The popover stays open between picks so a
		 * list of assignees is one gesture, not one per person. `value` is unused.
		 */
		multiple?: boolean;
		values?: string[];
		/** Labels for already-selected remote values not in the first page of results. */
		selectedLabels?: Record<string, string>;
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

	// Mirrors `AssetPicker`: asks the server once typing pauses, and a reply to a
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
	let pickedLabels = $state<Record<string, string>>({});
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

	function remove(event: MouseEvent, removed: string) {
		event.stopPropagation();
		values = values.filter((v) => v !== removed);
	}

	function select(option: SelectOption) {
		if (multiple) return toggle(option);
		value = option.value;
		pickedValue = option.value;
		pickedLabel = option.label;
		query = '';
		open = false;
	}

	function clear(event: MouseEvent) {
		event.stopPropagation();
		value = null;
		pickedValue = undefined;
		pickedLabel = undefined;
		query = '';
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

	<Popover.Root bind:open>
		<Popover.Trigger
			id={triggerId}
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
				<span class="flex min-w-0 flex-wrap gap-[var(--space-1)]">
					{#each chips as chip (chip.value)}
						<span
							class="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-2)] px-[var(--space-2)] text-xs leading-5"
						>
							{chip.label}
							<span
								role="button"
								tabindex="-1"
								class="grid size-4 place-items-center rounded-[var(--radius-full)] hover:bg-[var(--border)]"
								aria-label={m.field_remove_item({ item: chip.label, label })}
								onclick={(event) => remove(event, chip.value)}
								onkeydown={(event) => {
									if (event.key === 'Enter') remove(event as unknown as MouseEvent, chip.value);
								}}
							>
								<XIcon class="size-3" aria-hidden="true" />
							</span>
						</span>
					{:else}
						<span class="text-[var(--ink-muted)]">{placeholder ?? ''}</span>
					{/each}
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
						aria-label={`${label}: clear`}
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
				<Command.Input bind:value={query} placeholder={placeholder ?? ''} />
				<p class="sr-only" role="status">
					{open && !remoteFailed ? `${candidates.length}` : ''}
				</p>
				<Command.List>
					{#if remote && remoteFailed}
						<Command.Empty>Couldn't load results.</Command.Empty>
					{:else}
						<Command.Empty>No matches.</Command.Empty>
					{/if}
					{#each candidates as option (option.value)}
						<Command.Item
							value={option.value}
							disabled={option.disabled}
							onSelect={() => select(option)}
							aria-selected={multiple ? values.includes(option.value) : undefined}
						>
							{#if multiple && values.includes(option.value)}
								<span aria-hidden="true">✓</span>
							{/if}
							{option.label}
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
