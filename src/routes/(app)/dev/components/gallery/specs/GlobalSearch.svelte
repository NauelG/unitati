<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import GlobalSearch from '#lib/components/unitati/GlobalSearch.svelte';

	let open = $state(true);
</script>

<ComponentDocPage
	name="GlobalSearch"
	summary="Búsqueda global ⌘K: una caja sobre todos los registros, agrupada y con permisos aplicados en la consulta, más las acciones permitidas."
	role="El punto de entrada de todo el producto sin ratón (#12, #88): abre con ⌘K/Ctrl+K o desde la entrada Buscar de la barra lateral. Los registros salen de search(), una sola consulta con UNION ALL en la que cada dominio aporta su subconsulta ya limitada por el permiso del visitante: grupos en orden fijo (código exacto, activos, tickets, proyectos y tareas, personas), cinco por grupo, y el total de cada grupo cuenta solo lo que el visitante puede ver. Escribir un código exacto y pulsar Enter salta directamente al registro; un código ajeno no encuentra nada. Cuando el mejor resultado es un activo, sus tickets van como siguiente grupo. Las acciones salen del mismo vocabulario de permisos que la navegación y el keymap."
	whenToUse={[
		'Siempre disponible en (app): es la superficie de comandos de toda la app, no de una pantalla.'
	]}
	whenNotToUse={[
		'Para los verbos de una fila concreta de una tabla: esos viven en el keymap de la propia lista (a/e/l/s), no en la búsqueda.',
		'Para filtrar, facetar o guardar vistas de una lista: eso es de cada lista, no de la búsqueda global.'
	]}
	propsDoc={[
		{
			name: 'permissions',
			type: 'readonly string[]',
			description: 'El vocabulario de permisos del visitante — filtra qué acciones aparecen.'
		},
		{
			name: 'personId',
			type: 'string | null',
			default: 'null',
			description: 'El registro de directorio del visitante, para "Asignar a mí".'
		},
		{
			name: 'open',
			type: 'boolean',
			default: 'false',
			description: 'Bindable; AppShell nunca la enlaza — la demo sí, para mostrarla abierta.'
		}
	]}
	usage={`<GlobalSearch permissions={data.permissions} personId={data.user.personId} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — GlobalSearch, ut-kbd"
>
	{#snippet demo()}
		<div
			class="relative h-[420px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]"
		>
			<GlobalSearch
				bind:open
				permissions={[
					'assets.view',
					'assets.manage',
					'assets.checkout',
					'tickets.view',
					'tickets.create',
					'tickets.manage',
					'people.view'
				]}
			/>
		</div>
	{/snippet}
</ComponentDocPage>
