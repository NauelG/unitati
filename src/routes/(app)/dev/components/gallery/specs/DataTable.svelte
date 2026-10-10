<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';

	interface Row {
		id: string;
		tag: string;
		name: string;
		state: 'in_stock' | 'in_use' | 'in_repair' | 'retired';
	}

	const rows: Row[] = [
		{ id: '1', tag: 'AST-0001', name: 'MacBook Pro 14"', state: 'in_use' },
		{ id: '2', tag: 'AST-0002', name: 'Monitor Dell 27"', state: 'in_stock' },
		{
			id: '3',
			tag: 'AST-0003',
			name: 'Un nombre de equipo deliberadamente largo para probar el recorte de la celda de título',
			state: 'in_repair'
		}
	];

	let selected: string[] = $state([]);

	const columns = $derived<DataTableColumn<Row>[]>([
		{ key: 'tag', header: 'Código', cell: tagCell },
		{ key: 'name', header: 'Nombre', sortable: true, cell: nameCell },
		{ key: 'state', header: 'Estado', cell: stateCell }
	]);
</script>

{#snippet tagCell(row: Row)}{row.tag}{/snippet}
{#snippet nameCell(row: Row)}{row.name}{/snippet}
{#snippet stateCell(row: Row)}<StatusBadge status={row.state} />{/snippet}

<ComponentDocPage
	name="DataTable"
	summary="Tabla genérica ordenable y seleccionable, con fila-enlace y estado vacío."
	role="El cromado vive en el envoltorio: la cabecera es una banda surface-2 plana, sin esquinas propias. La tabla nunca reordena rows — el orden pertenece a quien las obtuvo — bind:sort y vuelve a consultar. Una fila con href se convierte en un enlace real estirado sobre toda la fila."
	whenToUse={[
		'Cualquier lista de registros con columnas: activos, tickets, personas.',
		'Cuando la fila debe ser clickable entera: pasa href.',
		'Cuando el usuario puede seleccionar varias filas: pasa (bind:)selected.'
	]}
	whenNotToUse={[
		'Para un solo registro con sus datos: usa PageLayout variant="record" + WorkPanel.',
		'Para una lista cronológica de eventos: usa AssetTimeline o TicketThread.'
	]}
	propsDoc={[
		{
			name: 'columns',
			type: 'DataTableColumn<Row>[]',
			description: 'key, header, align, sortable, cell.'
		},
		{
			name: 'rows',
			type: 'Row[]',
			description: 'Las filas de esta página, ya ordenadas por quien las obtuvo.'
		},
		{
			name: 'rowKey',
			type: '(row) => string',
			description: 'Identidad estable para {#each} y selección.'
		},
		{
			name: 'rowLabel',
			type: '(row) => string',
			description: 'Nombra la fila para su checkbox de selección.'
		},
		{
			name: 'href',
			type: '(row) => string',
			description: 'Convierte la primera celda en el enlace de la fila.'
		},
		{
			name: 'selected',
			type: 'string[]',
			description: 'Bindable; su sola presencia activa la columna de checkbox.'
		},
		{ name: 'sort', type: 'DataTableSort', description: 'Bindable; { key, direction }.' },
		{
			name: 'compact',
			type: 'boolean',
			default: 'false',
			description: 'Filas a --size-row-compact en vez de --size-row.'
		},
		{
			name: 'emptyMessage',
			type: 'string',
			description: 'Una frase, en vez de una rejilla vacía que no dice nada.'
		},
		{
			name: 'emptyAction',
			type: 'Snippet',
			description: 'La acción primaria que resuelve la vacuidad.'
		}
	]}
	usage={`<DataTable
  {columns}
  {rows}
  rowKey={(row) => row.id}
  href={(row) => \`/assets/\${row.tag}\`}
  bind:selected
  emptyMessage="Todavía no hay activos registrados."
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-table"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Completa, con selección y orden
			</p>
			<DataTable
				{columns}
				{rows}
				rowKey={(row) => row.id}
				rowLabel={(row) => row.name}
				href={(row) => `/dev/components/data-table#${row.tag}`}
				bind:selected
				emptyMessage="Todavía no hay activos registrados."
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Compacta</p>
			<DataTable
				{columns}
				{rows}
				rowKey={(row) => row.id}
				compact
				emptyMessage="Todavía no hay activos registrados."
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Vacía, con acción
			</p>
			<DataTable
				{columns}
				rows={[]}
				rowKey={(row) => row.id}
				emptyMessage="Todavía no hay activos registrados."
			>
				{#snippet emptyAction()}
					<Button size="sm" href="/assets/new">Registrar el primero</Button>
				{/snippet}
			</DataTable>
		</div>
	{/snippet}
</ComponentDocPage>
