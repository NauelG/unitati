<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SpaceColourPicker from '#lib/components/unitati/SpaceColourPicker.svelte';
	import type { SpaceColour } from '#lib/domain/knowledge.js';

	let colour = $state<SpaceColour>('teal');
</script>

<ComponentDocPage
	name="SpaceColourPicker"
	summary="Muestras para elegir el color de un espacio entre una paleta cerrada."
	role="Un grupo de radios sobre `SPACE_COLOURS`. Cada clave tiene un valor claro y otro oscuro en `app.css` (`--kb-<clave>`), así que la muestra se lee en ambos temas y nadie elige un color que desaparezca en uno de ellos. No hay hex libre: lo que se guarda es la clave."
	whenToUse={[
		'Elegir el color de un espacio en el catálogo de Configuración › Base de conocimiento.'
	]}
	whenNotToUse={[
		'Un color de marca de la organización: tiene su propio campo y su guarda de contraste (ADR 0026).',
		'Un color por dominio (activos, soporte, proyectos): son tokens semánticos, no una elección.'
	]}
	propsDoc={[
		{ name: 'name', type: 'string', description: 'El nombre del campo que se envía.' },
		{
			name: 'value',
			type: 'SpaceColour',
			description: 'La clave elegida. Enlazable con `bind:value`.'
		},
		{
			name: 'label',
			type: 'string',
			default: 'm.knowledge_colour_picker_label()',
			description: 'La leyenda del grupo.'
		},
		{ name: 'error', type: 'string', description: 'Frase de error, anunciada con role=alert.' }
	]}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0031-knowledge-base-spaces-page-tree-and-revisions.md"
	referenceLabel="ADR 0031 — los espacios de la base de conocimiento"
	usage={`<SpaceColourPicker name="colour" bind:value={draft.colour} error={errors.colour} />`}
>
	{#snippet demo()}
		<SpaceColourPicker name="gallery-colour" bind:value={colour} />
		<p class="mt-[var(--space-3)] text-small text-[var(--ink-muted)]">Elegido: {colour}</p>
	{/snippet}
</ComponentDocPage>
