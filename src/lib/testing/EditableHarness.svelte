<script lang="ts">
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import EditableText from '#lib/components/unitati/EditableText.svelte';

	/**
	 * Test fixture: what a record page does around the editable components. It owns the
	 * `$state` mirror, writes it in `optimistic` and hands back the rollback.
	 */
	interface Props {
		component: 'chip' | 'row' | 'text';
		initial: string;
		editable?: boolean;
		openOnHash?: string;
		error?: string;
		/** `row` only: routes the empty choice to another action. */
		routed?: boolean;
		noneLabel?: string;
	}
	let {
		component,
		initial,
		editable = true,
		openOnHash,
		error,
		routed = false,
		noneLabel
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let current = $state(initial);

	const options = [
		{ value: 'new', label: 'Nuevo', tone: 'brand' as const },
		{ value: 'in_progress', label: 'En curso', tone: 'desk' as const },
		{ value: 'closed', label: 'Cerrado', tone: 'neutral' as const }
	];

	function optimistic(formData: FormData) {
		const before = current;
		current = String(formData.get('field'));
		return () => {
			current = before;
		};
	}

	const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
</script>

{#if component === 'chip'}
	<EditableChip
		value={current}
		{options}
		action="?/save"
		name="field"
		{editable}
		{optimistic}
		{openOnHash}
		label="Estado"
	/>
{:else if component === 'row'}
	<EditableDetailRow
		kind="select"
		label="Estado"
		value={current}
		display={label(current)}
		{options}
		{noneLabel}
		action="?/save"
		actionFor={routed ? (v) => (v === '' ? '?/clear' : '?/save') : undefined}
		name="field"
		{editable}
		{optimistic}
		{openOnHash}
	/>
{:else}
	<EditableText
		value={current}
		label="Título"
		action="?/save"
		name="field"
		{editable}
		{optimistic}
		{error}
	/>
{/if}
<output data-testid="mirror">{current}</output>
