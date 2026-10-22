<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SpaceIconPicker from '#lib/components/unitati/SpaceIconPicker.svelte';
	import type { SpaceIcon } from '#lib/domain/knowledge.js';

	let icon = $state<SpaceIcon>('life-buoy');
</script>

<ComponentDocPage
	name="SpaceIconPicker"
	summary="Rejilla para elegir el icono de un espacio de conocimiento entre un conjunto cerrado."
	role="Un grupo de radios, no un campo de texto: el icono es una clave del conjunto cerrado `SPACE_ICONS` (`domain/knowledge.ts`), que el servidor vuelve a validar. Cada celda es un `<input type=&quot;radio&quot;>` con su etiqueta, así que el formulario funciona sin JavaScript, se recorre con las flechas y la selección se anuncia por el navegador, no solo por el color."
	whenToUse={[
		'Elegir el icono de un espacio en el catálogo de Configuración › Base de conocimiento.'
	]}
	whenNotToUse={[
		'Elegir entre pocas opciones con texto: usa SegmentedControl o SelectField.',
		'Un icono libre o subido por la persona: el conjunto es cerrado a propósito y crece con el producto.'
	]}
	propsDoc={[
		{ name: 'name', type: 'string', description: 'El nombre del campo que se envía.' },
		{
			name: 'value',
			type: 'SpaceIcon',
			description: 'La clave elegida. Enlazable con `bind:value`.'
		},
		{
			name: 'label',
			type: 'string',
			default: 'm.knowledge_icon_picker_label()',
			description: 'La leyenda del grupo.'
		},
		{ name: 'error', type: 'string', description: 'Frase de error, anunciada con role=alert.' }
	]}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0031-knowledge-base-spaces-page-tree-and-revisions.md"
	referenceLabel="ADR 0031 — los espacios de la base de conocimiento"
	usage={`<SpaceIconPicker name="icon" bind:value={draft.icon} error={errors.icon} />`}
>
	{#snippet demo()}
		<SpaceIconPicker name="gallery-icon" bind:value={icon} />
		<p class="mt-[var(--space-3)] text-small text-[var(--ink-muted)]">Elegido: {icon}</p>
	{/snippet}
</ComponentDocPage>
