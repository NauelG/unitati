<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { hashMatches } from './editable/editable.js';

	interface Props {
		value: string;
		/** Without permission: plain text, no outline, nothing to activate. */
		editable: boolean;
		action: string;
		name: string;
		optimistic: (formData: FormData) => () => void;
		/** Accessible name of the property, e.g. "Título". */
		label: string;
		/** Heading level to render at; omit for inline text (a "Detalles" row). */
		level?: 1 | 2 | 3 | 4 | 5 | 6;
		/** Monospace, for a record code. */
		mono?: boolean;
		/** Shown, muted, when the value is empty. */
		placeholder?: string;
		/**
		 * A validation message from the server (a duplicate code). It shows under the input and
		 * keeps it in edit mode; every other failure is a rollback and a toast.
		 */
		error?: string;
		openOnHash?: string;
		extraFields?: Record<string, string>;
		class?: string;
	}

	let {
		value,
		editable,
		action,
		name,
		optimistic,
		label,
		level,
		mono = false,
		placeholder,
		error,
		openOnHash,
		extraFields,
		class: className
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let formEl = $state<HTMLFormElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	// The tag is chosen by `level`; a `<svelte:element>` keeps one template for h1..h6 and span.
	const tag = $derived(level ? `h${level}` : 'span');
	const errorId = $props.id();

	async function edit() {
		draft = value;
		editing = true;
		await tick();
		inputEl?.focus();
		inputEl?.select();
	}

	async function commit() {
		// Enter removes the input, which fires blur: the second call must be a no-op.
		if (!editing) return;
		editing = false;
		if (draft === value) return;
		await tick();
		formEl?.requestSubmit();
	}

	function cancel() {
		editing = false;
	}

	// A validation error reopens the input with what the visitor typed.
	// Keyed on `error` alone: Escape must be able to close the input while the message stands.
	$effect(() => {
		if (error && !untrack(() => editing)) {
			editing = true;
			void tick().then(() => inputEl?.focus());
		}
	});

	function openFromHash() {
		if (editable && hashMatches(openOnHash, location.hash)) void edit();
	}
	onMount(openFromHash);
</script>

<svelte:window onhashchange={openFromHash} />

{#if !editable}
	<svelte:element this={tag} class={[mono && 'font-mono', className]}>
		{value || placeholder || ''}
	</svelte:element>
{:else}
	<form method="POST" {action} bind:this={formEl} use:optimisticEnhance={optimistic} class="hidden">
		<input type="hidden" {name} value={draft} />
		{#each Object.entries(extraFields ?? {}) as [fieldName, fieldValue] (fieldName)}
			<input type="hidden" name={fieldName} value={fieldValue} />
		{/each}
	</form>
	<svelte:element this={tag} class={['min-w-0', mono && 'font-mono', className]}>
		{#if editing}
			<input
				bind:this={inputEl}
				bind:value={draft}
				type="text"
				aria-label={label}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? errorId : undefined}
				class="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-transparent px-[var(--space-2)] font-[inherit] text-[length:inherit] leading-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						event.stopPropagation();
						cancel();
					}
				}}
				onblur={() => void commit()}
			/>
			{#if error}
				<span id={errorId} role="alert" class="block text-small font-normal text-[var(--danger)]"
					>{error}</span
				>
			{/if}
		{:else}
			<button
				type="button"
				aria-label={`${label}: ${value || placeholder || ''}`}
				class="group w-full cursor-text rounded-[var(--radius-md)] border border-[var(--border)] px-[var(--space-2)] text-left font-[inherit] text-[length:inherit] leading-[inherit] outline-none hover:border-[var(--border-strong)] focus-visible:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
				onclick={edit}
			>
				{#if value}
					{value}
				{:else}
					<span class="text-[var(--ink-muted)]">{placeholder ?? ''}</span>
				{/if}
			</button>
		{/if}
	</svelte:element>
{/if}
