<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TaskBoard from '#lib/components/unitati/TaskBoard.svelte';

	const states = [
		{ id: 'todo', name: 'Por hacer', group: 'unstarted' as const, position: 1 },
		{ id: 'doing', name: 'En curso', group: 'started' as const, position: 1 },
		{ id: 'done', name: 'Hecho', group: 'completed' as const, position: 1 }
	];
	const person = (fullName: string) => ({ personId: fullName, fullName });
	const tasks = [
		{
			id: '1',
			stateId: 'todo',
			taskTag: 'OBR-1',
			title: 'Embalar el material',
			dueDate: '2030-01-31',
			assignees: []
		},
		{
			id: '2',
			stateId: 'todo',
			taskTag: 'OBR-2',
			title: 'Reservar el transporte',
			dueDate: null,
			assignees: [person('Ada Lovelace')]
		},
		{
			id: '3',
			stateId: 'doing',
			taskTag: 'OBR-3',
			title: 'Revisar el cableado',
			dueDate: null,
			assignees: [person('Ada Lovelace'), person('Grace Hopper'), person('Alan Turing')]
		}
	];
</script>

<ComponentDocPage
	name="TaskBoard"
	summary="El tablero kanban de un proyecto: una columna por estado, «Mover a…» y arrastre."
	role="Columnas ordenadas por (grupo, posición). El menú «Mover a…» es la acción; el arrastre (svelte-dnd-action) solo la dispara: ambos envían el mismo formulario `moveTask` a través de optimisticEnhance y revierten si el servidor lo rechaza. Los anuncios de arrastre para lectores de pantalla son mensajes de paraglide. De solo lectura (proyecto archivado o vista de trabajo asignado) no hay menú, ni zona de arrastre, ni creación rápida."
	whenToUse={['La ficha de un proyecto, vista `?view=board`.']}
	whenNotToUse={[
		'Para listas planas y ordenables: usa DataTable.',
		'Para mover tareas entre proyectos: no está en el MVP (#120).'
	]}
	propsDoc={[
		{
			name: 'states',
			type: 'BoardState[]',
			description: 'Todos los estados: cada uno, una columna.'
		},
		{ name: 'tasks', type: 'BoardTask[]', description: 'Las tareas visibles para quien mira.' },
		{
			name: 'editable',
			type: 'boolean',
			default: 'false',
			description: 'Menú, arrastre y creación rápida. Falso: ninguno existe en el DOM.'
		},
		{
			name: 'action',
			type: 'string',
			default: "'?/moveTask'",
			description: 'La acción de formulario que hace de `moveTask`.'
		}
	]}
	usage={`<TaskBoard states={data.states} tasks={data.tasks} editable={writable} onquickcreate={open} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — stack de experiencia"
>
	{#snippet demo()}
		<div class="space-y-[var(--space-6)]">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Editable: columna con tareas y columna vacía colapsada
				</p>
				<TaskBoard {states} {tasks} editable onquickcreate={() => {}} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					De solo lectura (proyecto archivado o trabajo asignado)
				</p>
				<TaskBoard {states} {tasks} />
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
