<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { EditableOption } from './editable/OptionList.svelte';

	export type RowOption = EditableOption;

	/** What a `custom` editor receives: commit a new value (closes and saves) or cancel (closes). */
	export interface RowEditorContext {
		value: string | null;
		commit: (value: string) => void;
		cancel: () => void;
	}
</script>

<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { onMount, tick } from 'svelte';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import EditableText from './EditableText.svelte';
	import OptionList from './editable/OptionList.svelte';
	import {
		EDITABLE_CHEVRON,
		EDITABLE_OUTLINE,
		EDITABLE_POPOVER,
		hashMatches
	} from './editable/editable.js';

	interface Props {
		/** `select` and `multiselect` take `options`; `custom` takes `editor`; `text` is an inline input. */
		kind: 'select' | 'multiselect' | 'custom' | 'text';
		/** Accessible name of the property. The visible label is the `DescriptionList` term beside it. */
		label: string;
		/** The current value (`select`, `custom`, `text`); `null` is "none". */
		value?: string | null;
		/** The current values (`multiselect`). */
		values?: string[];
		/** The value formatted for read mode: a person's name, a formatted date. */
		display: string;
		action: string;
		/**
		 * Picks the action URL from the submitted value, for a row whose choices post to different
		 * actions (a custodian row: a person assigns, "nobody" returns). `''` is the empty choice.
		 */
		actionFor?: (value: string) => string;
		name: string;
		editable: boolean;
		optimistic: (formData: FormData) => () => void;
		openOnHash?: string;
		/** Shown, muted, when there is no value (e.g. "Sin asignar"). */
		placeholder?: string;
		options?: RowOption[];
		/** `select` only: the label of the empty choice. Without it the value cannot be cleared. */
		noneLabel?: string;
		/** `custom` only: the editor shown in the popover. */
		editor?: Snippet<[RowEditorContext]>;
		/** `text` only: a server validation message, shown under the input. */
		error?: string;
		extraFields?: Record<string, string>;
		class?: string;
	}

	let {
		kind,
		label,
		value = null,
		values = [],
		display,
		action,
		actionFor,
		name,
		editable,
		optimistic,
		openOnHash,
		placeholder,
		options = [],
		noneLabel,
		editor,
		error,
		extraFields,
		class: className
	}: Props = $props();

	let open = $state(false);
	let submitted = $state<string[]>([]);
	let draft = $state<string[]>([]);
	let formEl = $state<HTMLFormElement | null>(null);

	const NONE = '\u0000none';
	const shown = $derived(display || placeholder || '');
	const choices = $derived<RowOption[]>(
		kind === 'select' && noneLabel ? [{ value: NONE, label: noneLabel }, ...options] : options
	);
	const selected = $derived(
		kind === 'multiselect' ? draft : value ? [value] : noneLabel ? [NONE] : []
	);

	function openFromHash() {
		if (editable && kind !== 'text' && hashMatches(openOnHash, location.hash)) open = true;
	}
	onMount(openFromHash);

	async function submit(next: string[]) {
		submitted = next;
		await tick();
		formEl?.requestSubmit();
	}

	function pick(option: RowOption) {
		if (kind === 'multiselect') {
			draft = draft.includes(option.value)
				? draft.filter((v) => v !== option.value)
				: [...draft, option.value];
			return;
		}
		open = false;
		const next = option.value === NONE ? '' : option.value;
		if (next === (value ?? '')) return;
		void submit([next]);
	}

	function onOpenChange(next: boolean) {
		if (kind !== 'multiselect') return;
		if (next) {
			draft = [...values];
			return;
		}
		// Saves when the popover closes, and only if something changed.
		const before = [...values].sort().join('\u0000');
		if (draft.slice().sort().join('\u0000') !== before) void submit(draft);
	}

	const context: RowEditorContext = {
		get value() {
			return value;
		},
		commit(next) {
			open = false;
			void submit([next]);
		},
		cancel() {
			open = false;
		}
	};
</script>

<svelte:window onhashchange={openFromHash} />

{#if !editable}
	<span class={className}
		>{#if display}{display}{:else if placeholder}<span class="text-[var(--ink-muted)]"
				>{placeholder}</span
			>{:else}—{/if}</span
	>
{:else if kind === 'text'}
	<EditableText
		value={value ?? ''}
		editable
		{action}
		{name}
		{optimistic}
		{label}
		{placeholder}
		{error}
		{openOnHash}
		{extraFields}
		class={className}
	/>
{:else}
	<form
		method="POST"
		action={actionFor ? actionFor(submitted[0] ?? '') : action}
		bind:this={formEl}
		use:optimisticEnhance={optimistic}
		class="hidden"
	>
		{#each submitted as v (v)}
			<input type="hidden" {name} value={v} />
		{/each}
		{#each Object.entries(extraFields ?? {}) as [fieldName, fieldValue] (fieldName)}
			<input type="hidden" name={fieldName} value={fieldValue} />
		{/each}
	</form>
	<Popover.Root bind:open {onOpenChange}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<!-- bits sets aria-haspopup="dialog"; a choice list is a listbox. -->
				<button
					{...props}
					type="button"
					aria-haspopup={kind === 'custom' ? 'dialog' : 'listbox'}
					aria-expanded={open}
					aria-label={`${label}: ${shown}`}
					class={`flex min-h-[26px] w-full items-center justify-between gap-[var(--space-2)] px-[var(--space-2)] text-left text-sm ${EDITABLE_OUTLINE} ${className ?? ''}`}
				>
					<span class={['min-w-0 break-words', !display && 'text-[var(--ink-muted)]']}>{shown}</span
					>
					<ChevronDownIcon class={EDITABLE_CHEVRON} aria-hidden="true" />
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class={EDITABLE_POPOVER}>
			{#if kind === 'custom'}
				{@render editor?.(context)}
			{:else}
				<OptionList
					options={choices}
					{selected}
					{label}
					multiple={kind === 'multiselect'}
					onpick={pick}
				/>
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}
