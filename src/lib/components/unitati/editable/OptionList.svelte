<script lang="ts" module>
	export interface EditableOption {
		value: string;
		label: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import * as Command from '#lib/components/ui/command/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { FILTER_THRESHOLD } from './editable.js';

	interface Props {
		options: EditableOption[];
		/** Values currently chosen; one for a single choice, any number for a multiple one. */
		selected: readonly string[];
		onpick: (option: EditableOption) => void;
		label: string;
		multiple?: boolean;
	}

	let { options, selected, onpick, label, multiple = false }: Props = $props();

	let query = $state('');
	const filterable = $derived(options.length > FILTER_THRESHOLD);
	const matches = $derived(
		filterable
			? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
			: options
	);
</script>

<!-- Filtered here, not by Command: its fuzzy match runs on the value, which is an id. -->
<Command.Root shouldFilter={false} aria-label={label}>
	{#if filterable}
		<Command.Input
			bind:value={query}
			placeholder={m.editable_filter()}
			onkeydown={(event) => {
				// Enter inside the filter must pick, never submit a surrounding form.
				if (event.key === 'Enter') event.preventDefault();
			}}
		/>
	{/if}
	<Command.List aria-multiselectable={multiple ? 'true' : undefined}>
		<Command.Empty>{m.field_search_none()}</Command.Empty>
		{#each matches as option (option.value)}
			{@const isSelected = selected.includes(option.value)}
			<Command.Item
				value={option.value}
				disabled={option.disabled}
				onSelect={() => onpick(option)}
				data-checked={isSelected ? 'true' : 'false'}
				aria-selected={isSelected}
			>
				{option.label}
			</Command.Item>
		{/each}
	</Command.List>
</Command.Root>
