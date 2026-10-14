<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TaskBoardSkeleton from '#lib/components/unitati/TaskBoardSkeleton.svelte';
</script>

<ComponentDocPage
	name="TaskBoardSkeleton"
	summary="La silueta del tablero mientras carga: las mismas columnas, tarjetas en bloque."
	role="Pinta la forma del tablero —columnas de 18 rem con tarjetas— para que el cambio a los datos no mueva nada. Se anuncia una vez como «Cargando…»."
	whenToUse={['Mientras se navega a la vista de tablero de un proyecto.']}
	whenNotToUse={['Para la vista de lista: usa DataTableSkeleton.']}
	propsDoc={[
		{
			name: 'columns',
			type: 'number',
			default: '4',
			description: 'Columnas del tablero real.'
		}
	]}
	usage={`<TaskBoardSkeleton columns={data.states.length} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — superficies de trabajo"
>
	{#snippet demo()}
		<TaskBoardSkeleton columns={3} />
	{/snippet}
</ComponentDocPage>
