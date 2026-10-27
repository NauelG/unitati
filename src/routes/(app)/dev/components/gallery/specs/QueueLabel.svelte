<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import QueueLabel from '#lib/components/unitati/QueueLabel.svelte';
	import { CATALOGUE_COLORS } from '#lib/domain/catalogue-color.js';

	const usage = '<QueueLabel name="Incidencias" color="blue" />';
</script>

<ComponentDocPage
	name="QueueLabel"
	summary="El nombre de una cola con un punto del color que se le asignó."
	role="El color ayuda a reconocer de un vistazo a qué cola pertenece una solicitud, pero nunca es la única señal: el nombre siempre se muestra y el punto es decorativo para lectores de pantalla."
	whenToUse={[
		'Donde una solicitud muestra su cola: la lista, el detalle y los ajustes de colas.',
		'Siempre con una clave de la paleta de colas: una clave desconocida cae en gris.'
	]}
	whenNotToUse={[
		'Para el estado o la prioridad de una solicitud: usa StatusBadge.',
		'Para colores libres: la paleta es cerrada para que el punto se lea en claro y oscuro.'
	]}
	propsDoc={[
		{
			name: 'name',
			type: 'string',
			description: 'El nombre de la cola; se recorta con puntos suspensivos.'
		},
		{
			name: 'color',
			type: 'CatalogueColor',
			description: 'Clave de la paleta; el color real sale de --catalogue-<clave>.'
		}
	]}
	{usage}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/domain-model.md"
	referenceLabel="Modelo de dominio"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-4)] text-sm">
			{#each CATALOGUE_COLORS as color (color)}
				<QueueLabel name={color} {color} />
			{/each}
		</div>
	{/snippet}
</ComponentDocPage>
