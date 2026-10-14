<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import BoardColumn from '#lib/components/unitati/BoardColumn.svelte';

	const states = [
		{ id: 'todo', name: 'Por hacer', group: 'unstarted' as const, position: 1 },
		{ id: 'doing', name: 'En curso', group: 'started' as const, position: 1 }
	];
	const items = [
		{
			id: '1',
			stateId: 'todo',
			taskTag: 'OBR-1',
			title: 'Embalar el material',
			dueDate: null,
			assignees: [{ personId: 'a', fullName: 'Ada Lovelace' }]
		}
	];
</script>

<ComponentDocPage
	name="BoardColumn"
	summary="Una columna del tablero: cabecera con nombre, tono del grupo y recuento, y la zona de tarjetas."
	role="Una columna por estado. Con tareas, una columna de 18 rem; sin ninguna, una tira estrecha con el nombre y un 0 que sigue siendo un destino válido para «Mover a…» y para soltar. Editable, trae zona de arrastre y «+» de creación rápida; de solo lectura, ninguno de los dos existe en el DOM."
	whenToUse={['Dentro de TaskBoard, una por estado, ordenadas por (grupo, posición).']}
	whenNotToUse={['Fuera de un tablero: es una columna, no un panel; usa WorkPanel.']}
	propsDoc={[
		{ name: 'state', type: 'BoardState', description: 'Estado de la columna: nombre y grupo.' },
		{ name: 'items', type: 'BoardTask[]', description: 'Tareas en orden de columna.' },
		{
			name: 'editable',
			type: 'boolean',
			default: 'false',
			description: 'Zona de arrastre, menú de las tarjetas y creación rápida.'
		},
		{
			name: 'onquickcreate',
			type: '(stateId: string) => void',
			default: 'undefined',
			description: 'Se llama al pulsar «+» en la cabecera.'
		}
	]}
	usage={`<BoardColumn {state} {items} {states} editable onquickcreate={open} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — superficies de trabajo"
>
	{#snippet demo()}
		<div class="flex items-start gap-[var(--space-3)]">
			<BoardColumn state={states[0]} {items} {states} editable onquickcreate={() => {}} />
			<BoardColumn state={states[1]} items={[]} {states} editable onquickcreate={() => {}} />
			<BoardColumn state={states[0]} {items} {states} />
		</div>
	{/snippet}
</ComponentDocPage>
