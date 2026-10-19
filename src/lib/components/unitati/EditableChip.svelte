<script lang="ts" module>
	import type { Tone } from './status.js';

	export interface ChipOption {
		value: string;
		label: string;
		tone?: Tone;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { onMount, tick } from 'svelte';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { badge } from './StatusBadge.svelte';
	import OptionList from './editable/OptionList.svelte';
	import {
		EDITABLE_CHEVRON,
		EDITABLE_OUTLINE,
		EDITABLE_POPOVER,
		hashMatches
	} from './editable/editable.js';

	interface Props {
		value: string;
		options: ChipOption[];
		/** The form action URL the pick posts to, e.g. `?/changeStatus`. */
		action: string;
		/** The field name posted with the chosen value. */
		name: string;
		/** Without permission the chip is a bare badge: no outline, no chevron, nothing to activate. */
		editable: boolean;
		/** Handed to `optimisticEnhance`: writes the page's mirror, returns the rollback. */
		optimistic: (formData: FormData) => () => void;
		/** A deep-link hash (`#action-status`) that opens the popover on load. */
		openOnHash?: string;
		/** Accessible name of the property, e.g. "Estado". */
		label: string;
		/** Extra hidden inputs posted with the pick. */
		extraFields?: Record<string, string>;
		class?: string;
	}

	let {
		value,
		options,
		action,
		name,
		editable,
		optimistic,
		openOnHash,
		label,
		extraFields,
		class: className
	}: Props = $props();

	let open = $state(false);
	let picked = $state('');
	let formEl = $state<HTMLFormElement | null>(null);

	const current = $derived(options.find((o) => o.value === value));
	const chipClass = $derived(badge({ tone: current?.tone ?? 'neutral', plain: false }));
	const currentLabel = $derived(current?.label ?? value);

	function openFromHash() {
		if (editable && hashMatches(openOnHash, location.hash)) open = true;
	}
	onMount(openFromHash);

	async function pick(option: ChipOption) {
		open = false;
		if (option.value === value) return;
		picked = option.value;
		await tick();
		formEl?.requestSubmit();
	}
</script>

<svelte:window onhashchange={openFromHash} />

{#if editable}
	<span class={`inline-flex ${className ?? ''}`}>
		<form
			method="POST"
			{action}
			bind:this={formEl}
			use:optimisticEnhance={optimistic}
			class="hidden"
		>
			<input type="hidden" {name} value={picked} />
			{#each Object.entries(extraFields ?? {}) as [fieldName, fieldValue] (fieldName)}
				<input type="hidden" name={fieldName} value={fieldValue} />
			{/each}
		</form>
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<!-- bits sets aria-haspopup="dialog"; this one opens a listbox. -->
					<button
						{...props}
						type="button"
						aria-haspopup="listbox"
						aria-expanded={open}
						aria-label={`${label}: ${currentLabel}`}
						class={`${chipClass} ${EDITABLE_OUTLINE}`}
					>
						<span class="min-w-0 truncate">{currentLabel}</span>
						<ChevronDownIcon class={EDITABLE_CHEVRON} aria-hidden="true" />
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="start" class={EDITABLE_POPOVER}>
				<OptionList {options} selected={[value]} {label} onpick={pick} />
			</Popover.Content>
		</Popover.Root>
	</span>
{:else}
	<span class={`${chipClass} ${className ?? ''}`}
		><span class="min-w-0 truncate">{currentLabel}</span></span
	>
{/if}
