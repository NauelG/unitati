<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import ListToolbar from '#lib/components/unitati/ListToolbar.svelte';

	interface Row {
		id: string;
		tag: string;
		subject: string;
	}

	const rows: Row[] = [
		{ id: '1', tag: 'TCK-0001', subject: 'No arranca el portátil' },
		{ id: '2', tag: 'TCK-0002', subject: 'Alta de usuario nuevo' }
	];

	const columns: DataTableColumn<Row>[] = [
		{ key: 'tag', header: 'Código', cell: tagCell },
		{ key: 'subject', header: 'Asunto', cell: subjectCell }
	];

	let term = $state('');
</script>

{#snippet tagCell(row: Row)}{row.tag}{/snippet}
{#snippet subjectCell(row: Row)}{row.subject}{/snippet}

{#snippet attached()}
	<div>
		<ListToolbar onsubmit={(event) => event.preventDefault()}>
			<Field label="Buscar" name="q" type="search" bind:value={term} class="w-full sm:w-72">
				{#snippet trailing()}<span class="ut-kbd" aria-hidden="true">/</span>{/snippet}
			</Field>
			<Button type="submit" variant="secondary">Buscar</Button>
		</ListToolbar>
		<DataTable
			{columns}
			{rows}
			rowKey={(row) => row.id}
			emptyMessage="Sin resultados."
			class="rounded-t-none"
		/>
	</div>
{/snippet}

<ComponentDocPage
	name="ListToolbar"
	summary="La franja de búsqueda y filtros de un índice, pegada al panel de la tabla (ADR 0019)."
	role="El <form method=GET role=search> de un índice. Conserva las esquinas superiores y los bordes laterales y renuncia a su borde inferior: el borde de la DataTable lo cierra, y las dos leen como un solo panel. No hay selector en la hoja de estilos de referencia; es el patrón de ADR 0019 escrito una vez."
	whenToUse={[
		'Buscador y filtros encima de una DataTable en una pantalla de índice.',
		'Siempre dentro del mismo <div> que la DataTable, que recibe class="rounded-t-none".'
	]}
	whenNotToUse={[
		'Un formulario de edición o de alta: eso es un form normal con Field y FormActions.',
		'Una ficha de un solo registro: ADR 0019 sólo ve el problema de pegar-a-la-tabla en los índices.'
	]}
	propsDoc={[
		{
			name: 'action',
			type: 'string',
			description: 'Opcional; por defecto la URL actual, que es lo que quiere un GET.'
		},
		{ name: 'onsubmit', type: 'FormEventHandler', description: 'Opcional.' },
		{ name: 'children', type: 'Snippet', description: 'Los campos y el botón de enviar.' }
	]}
	usage={`<div>
  <ListToolbar>
    <Field label="Buscar" name="q" type="search" bind:value={term} />
    <Button type="submit" variant="secondary">Buscar</Button>
  </ListToolbar>
  <DataTable {columns} {rows} {rowKey} emptyMessage="…" class="rounded-t-none" />
</div>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — la barra se pega a la tabla"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				A ancho completo (1280 px)
			</p>
			{@render attached()}
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				A 480 px: la barra hace wrap
			</p>
			<div class="max-w-[480px]">
				{@render attached()}
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
