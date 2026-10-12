<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import DataTableSkeleton from '#lib/components/unitati/DataTableSkeleton.svelte';
</script>

<ComponentDocPage
	name="DataTableSkeleton"
	summary="La geometría exacta de DataTable — cabecera + N filas — antes de que lleguen las filas reales."
	role="Compone Skeleton con las mismas clases head/cell que DataTable (su propio export dataTable), así que una cabecera de 3 columnas pinta 3 celdas de cabecera, nunca un bloque genérico que no coincide con la tabla real."
	whenToUse={[
		'Una lista que carga de forma streamed (#89) o tras una navegación lenta, cuando el número de columnas ya se conoce.'
	]}
	whenNotToUse={[
		'Una tabla cuyo número de columnas varía según el viewport: pasa el mismo columns que usará DataTable en ese momento, nunca uno fijo.'
	]}
	propsDoc={[
		{
			name: 'columns',
			type: 'number',
			description:
				'Igual que columns.length de la tabla real, para que la cabecera coincida exactamente.'
		},
		{
			name: 'rows',
			type: 'number',
			default: '5',
			description: 'Filas a pintar mientras se desconoce el total real.'
		},
		{ name: 'class', type: 'string', description: 'Clases extra para el panel exterior.' }
	]}
	usage={`<DataTableSkeleton columns={4} rows={6} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — qué entra en la fase 8"
>
	{#snippet demo()}
		<DataTableSkeleton columns={4} rows={4} />
	{/snippet}
</ComponentDocPage>
