<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
</script>

{#snippet badge()}<StatusBadge status="in_use" />{/snippet}

<ComponentDocPage
	name="DescriptionList"
	summary="Pares etiqueta/valor de una ficha: rejilla de 104 px + 1fr, valores alineados a la izquierda."
	role=".ut-dl: un <dl> en rejilla. La etiqueta ocupa 104 px y el valor el resto; un valor largo se parte dentro de su columna en vez de huir de su etiqueta o desbordar una columna lateral de 340 px."
	whenToUse={[
		'El panel Detalles de una ficha: responsable, fecha, ubicación.',
		'El valor puede ser un componente (insignia, enlace): pásalo como snippet.'
	]}
	whenNotToUse={[
		'Datos tabulares con muchas filas y columnas: usa DataTable.',
		'Un valor con números alineados a la derecha: esto es una lista de lectura, no una tabla.'
	]}
	propsDoc={[
		{
			name: 'items',
			type: '{ label: string; value: Snippet | string }[]',
			description: 'En orden de lectura. Un snippet cuando el valor es un componente.'
		}
	]}
	usage={`<DescriptionList
  items={[
    { label: 'Responsable', value: owner },
    { label: 'Estado', value: badgeSnippet }
  ]}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — .ut-dl"
>
	{#snippet demo()}
		<div class="max-w-[340px]">
			<WorkPanel heading="Detalles">
				<DescriptionList
					items={[
						{ label: 'Responsable', value: 'Ana Pérez' },
						{ label: 'Estado', value: badge },
						{ label: 'Solicitante', value: 'Maximiliano Fernández-Villanueva Ortega' }
					]}
				/>
			</WorkPanel>
		</div>
	{/snippet}
</ComponentDocPage>
