<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';

	let description = $state('');
</script>

<ComponentDocPage
	name="TextAreaField"
	summary="Campo de texto multilínea: etiqueta, control y una línea de ayuda que se convierte en error."
	role="La hermana de Field para prosa: una descripción, una nota. Comparte con Field los mismos estilos (.ut-field), así que un campo inválido no puede parecer válido. Crece en vertical a criterio de quien escribe."
	whenToUse={[
		'Texto libre de varias líneas: la descripción de un proyecto o de una tarea.',
		'Cualquier campo opcional que admita párrafos.'
	]}
	whenNotToUse={[
		'Un valor de una línea (nombre, etiqueta, fecha): usa Field.',
		'El mensaje de una conversación: TicketComposer ya trae su propio cuadro.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta.' },
		{ name: 'value', type: 'string | null', description: 'Bindable. null se muestra vacío.' },
		{ name: 'error', type: 'string', description: 'Igual que en Field: presencia marca inválido.' },
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el control.' }
	]}
	usage={`<TextAreaField label="Descripción" name="description" bind:value={description} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-field"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<TextAreaField label="Descripción" name="description" bind:value={description} />
			<TextAreaField
				label="Con error"
				name="other"
				value=""
				error="Escribe una descripción."
				hint="Una pista."
			/>
		</div>
	{/snippet}
</ComponentDocPage>
