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
	role="El Field de una lista desplegable: vendorizada sobre el primitivo select de bits-ui (shadcn-svelte), no sobre un <select> nativo, para que el menú lo pinte la aplicación en vez del sistema operativo. Comparte la función de estilos field() con Field; el teclado, el foco y el anuncio a lector de pantalla los da el primitivo."
	whenToUse={[
		'Elegir una entre un conjunto fijo y pequeño de opciones conocidas (estado, prioridad, cola…).',
		'Cuando el valor puede no tener respuesta aún: pasa placeholder para habilitar la opción vacía.'
	]}
	whenNotToUse={[
		'Elegir entre cientos de opciones buscables: usa SearchSelectField.',
		'Seleccionar varios registros existentes del dominio (activos): usa AssetPicker.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta.' },
		{
			name: 'options',
			type: 'SelectOption[]',
			description: '{ value, label, disabled? } en el orden que se muestran.'
		},
		{ name: 'name', type: 'string', description: 'Nombre bajo el que se envía el formulario.' },
		{
			name: 'placeholder',
			type: 'string',
			description:
				'Texto de la opción vacía. Sin esta prop el control no tiene opción vacía: es para un valor que siempre tiene respuesta.'
		},
		{ name: 'error', type: 'string', description: 'Igual que en Field: presencia marca inválido.' },
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el control.' },
		{ name: 'value', type: 'string | null', description: 'null selecciona la opción vacía.' },
		{ name: 'required', type: 'boolean', description: 'Marca el campo obligatorio en el envío.' },
		{ name: 'disabled', type: 'boolean', description: 'Deshabilita el control.' },
		{
			name: 'labelHidden',
			type: 'boolean',
			default: 'false',
			description:
				'Mantiene la etiqueta en el árbol de accesibilidad pero la oculta visualmente, para una fila densa cuyo encabezado de columna ya la nombra.'
		}
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
			<SelectField label="Obligatorio" {options} bind:value={withValue} required />
			<SelectField label="Con error" {options} bind:value={withError} error="Elige un estado." />
			<SelectField label="Deshabilitado" {options} value="retired" disabled />
			<SelectField
				label="Opción larga"
				options={[
					...options,
					{
						value: 'long',
						label:
							'Una etiqueta deliberadamente larga para comprobar el truncado accesible de la opción'
					}
				]}
				value="long"
			/>
		</div>
	{/snippet}
</ComponentDocPage>
