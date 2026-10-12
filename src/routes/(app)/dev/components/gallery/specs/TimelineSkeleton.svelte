<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
</script>

<ComponentDocPage
	name="TimelineSkeleton"
	summary="El punto + carril + dos líneas de AssetTimeline, antes de que llegue el historial real."
	role="La mitad streamed de la ficha de activo (#89): el rail de historial es el read más lento de esa página y nada más depende de él, así que pinta detrás de esto mientras el resto ya es interactivo."
	whenToUse={[
		'El rail lateral de la ficha de activo mientras su timelineRail (una promesa sin await) aún no resuelve.'
	]}
	whenNotToUse={[
		'Un hilo de ticket (ThreadSkeleton es la forma correcta) o una tabla (DataTableSkeleton).'
	]}
	propsDoc={[
		{
			name: 'rows',
			type: 'number',
			default: '3',
			description: 'Entradas a pintar mientras se desconoce el total real.'
		},
		{ name: 'class', type: 'string', description: 'Clases extra para la lista exterior.' }
	]}
	usage={`<TimelineSkeleton rows={4} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — qué entra en la fase 8"
>
	{#snippet demo()}
		<TimelineSkeleton rows={3} />
	{/snippet}
</ComponentDocPage>
