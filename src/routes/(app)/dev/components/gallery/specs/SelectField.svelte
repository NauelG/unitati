<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';

	const options = [
		{ value: 'in_stock', label: 'En stock' },
		{ value: 'in_use', label: 'En uso' },
		{ value: 'in_repair', label: 'En reparación' },
		{ value: 'retired', label: 'Retirado' }
	];

	let withPlaceholder: string | null = $state(null);
	let withValue = $state('in_use');
	let withError = $state('');
</script>

<ComponentDocPage
	name="SelectField"
	summary="El Field de un <select>, comparte sus estilos."
	role="No está en el design system; existió porque una pantalla necesitaba un <select> con la misma apariencia que Field. Comparte directamente la función de estilos field() — dos componentes, un solo tv()."
	whenToUse={[
		'Elegir una entre un conjunto fijo y pequeño de opciones conocidas.',
		'Cuando el valor puede no tener respuesta aún: pasa placeholder para habilitar la opción vacía.'
	]}
	whenNotToUse={[
		'Elegir entre cientos de opciones buscables: ese caso necesita un combobox con búsqueda, no existe todavía.',
		'Seleccionar registros existentes del dominio (activos, tickets): usa AssetPicker.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta.' },
		{
			name: 'options',
			type: 'SelectOption[]',
			description: '{ value, label } en el orden que se muestran.'
		},
		{
			name: 'placeholder',
			type: 'string',
			description:
				'Texto de la opción vacía. Sin esta prop el control no tiene opción vacía: es para un valor que siempre tiene respuesta.'
		},
		{ name: 'error', type: 'string', description: 'Igual que en Field: presencia marca inválido.' },
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el control.' },
		{ name: 'value', type: 'string | null', description: 'null selecciona la opción vacía.' }
	]}
	usage={`<SelectField
  label="Estado"
  {options}
  placeholder="Sin estado"
  bind:value={state}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-field"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
			<SelectField
				label="Con placeholder"
				{options}
				placeholder="Sin estado"
				bind:value={withPlaceholder}
			/>
			<SelectField label="Con valor prellenado" {options} bind:value={withValue} />
			<SelectField label="Sin placeholder" {options} bind:value={withValue} />
			<SelectField label="Con error" {options} bind:value={withError} error="Elige un estado." />
			<SelectField label="Deshabilitado" {options} value="retired" disabled />
		</div>
	{/snippet}
</ComponentDocPage>
