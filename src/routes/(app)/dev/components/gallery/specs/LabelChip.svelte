<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import LabelChip from '#lib/components/unitati/LabelChip.svelte';
	import { CATALOGUE_COLORS } from '#lib/domain/catalogue-color.js';

	const usage = '<LabelChip name="VPN" color="blue" description="Acceso remoto" />';
</script>

<ComponentDocPage
	name="LabelChip"
	summary="Una etiqueta de solicitud: un punto de color, su nombre y, como ayuda, su descripción."
	role="Clasifica una solicitud con el vocabulario propio de la organización. El color ayuda a reconocerla, pero nunca es la única señal: el nombre siempre se muestra y el punto es decorativo para lectores de pantalla."
	whenToUse={[
		'Donde se muestran las etiquetas de una solicitud: el detalle y los ajustes de etiquetas.',
		'Solo para el personal: las etiquetas nunca se enseñan al solicitante en el portal.'
	]}
	whenNotToUse={[
		'Para la cola de una solicitud: usa QueueLabel.',
		'Para el estado o la prioridad: usa StatusBadge.'
	]}
	propsDoc={[
		{
			name: 'name',
			type: 'string',
			description: 'El nombre de la etiqueta; se recorta con puntos suspensivos.'
		},
		{
			name: 'color',
			type: 'CatalogueColor',
			description: 'Clave de la paleta; el color real sale de --catalogue-<clave>.'
		},
		{
			name: 'description',
			type: 'string | null',
			description: 'Se muestra como ayuda al pasar el cursor.'
		}
	]}
	{usage}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0053-labels-on-tickets.md"
	referenceLabel="ADR 0053"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-3)]">
			{#each CATALOGUE_COLORS as color (color)}
				<LabelChip name={color} {color} description="Etiqueta {color}" />
			{/each}
		</div>
	{/snippet}
</ComponentDocPage>
