<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Field from '#lib/components/unitati/Field.svelte';

	let plain = $state('');
	let withHint = $state('');
	let withError = $state('valor inválido');
	let longLabel = $state(
		'Un valor bastante largo que pone a prueba el ancho mínimo del campo y su recorte visual'
	);
</script>

<ComponentDocPage
	name="Field"
	summary="Campo de texto con etiqueta, ayuda y error."
	role="Un `<input>` con su etiqueta, una línea de ayuda y, cuando hay `error`, esa misma línea se convierte en el mensaje de error — nunca ambas a la vez, para que un campo inválido no pueda parecer válido."
	whenToUse={[
		'Cualquier campo de texto de un formulario de alta o edición.',
		'Cuando el valor puede ser inválido y hace falta explicar por qué (error).',
		'Cuando conviene una pista permanente bajo el campo (hint).'
	]}
	whenNotToUse={[
		'Para una selección entre opciones fijas: usa SelectField.',
		'Para elegir uno o varios activos existentes: usa SearchSelectField con multiple, no un Field libre.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta.' },
		{
			name: 'error',
			type: 'string',
			description: 'Renderizado y anunciado; su sola presencia marca el control como inválido.'
		},
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el campo.' },
		{
			name: 'trailing',
			type: 'Snippet',
			description:
				'Decoración dentro del borde derecho del input (una tecla de atajo); no interactiva.'
		},
		{
			name: 'value',
			type: 'string | null',
			description: 'null es lo que entrega una columna anulable; se muestra como caja vacía.'
		}
	]}
	usage={`<Field label="Nombre" bind:value={name} hint="Nombre completo, como figura en el DNI" />
<Field label="Código" bind:value={code} error={errors.code} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-field"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
			<Field label="Vacío" bind:value={plain} />
			<Field label="Con ayuda" bind:value={withHint} hint="Se guarda automáticamente." />
			<Field label="Con error" bind:value={withError} error="Este campo es obligatorio." />
			<Field label="Deshabilitado" value="No editable" disabled />
			<Field label={longLabel} bind:value={plain} />
			<Field label="Con kbd al final" type="search" bind:value={plain}>
				{#snippet trailing()}<span class="ut-kbd" aria-hidden="true">/</span>{/snippet}
			</Field>
		</div>
	{/snippet}
</ComponentDocPage>
