<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import KpiCardSkeleton from '#lib/components/unitati/KpiCardSkeleton.svelte';
</script>

<ComponentDocPage
	name="KpiCardSkeleton"
	summary="La caja de KpiCard — etiqueta + número de 28/34 — antes de conocer el recuento real."
	role="Mismo root/label/value que KpiCard (su propio export kpiCard), así que el número skeleton ocupa exactamente la misma caja de 28/34 que el número real: cero salto al llegar el dato."
	whenToUse={['Una fila de KpiCard en un dashboard cuyo recuento depende de una consulta lenta.']}
	whenNotToUse={['Un KpiCard cuyo valor ya está disponible sin red — no hay nada que esperar.']}
	propsDoc={[
		{ name: 'class', type: 'string', description: 'Clases extra para el panel exterior.' }
	]}
	usage="<KpiCardSkeleton />"
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — qué entra en la fase 8"
>
	{#snippet demo()}
		<div class="grid grid-cols-2 gap-[var(--space-3)] sm:grid-cols-4">
			<KpiCardSkeleton />
			<KpiCardSkeleton />
			<KpiCardSkeleton />
			<KpiCardSkeleton />
		</div>
	{/snippet}
</ComponentDocPage>
