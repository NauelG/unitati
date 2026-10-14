<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import BoardColumn from '#lib/components/unitati/BoardColumn.svelte';

	const states = [
		{ id: 'todo', name: 'Por hacer', group: 'unstarted' as const, position: 1 },
		{ id: 'doing', name: 'En curso', group: 'started' as const, position: 1 }
	];
	type Preference = 'collapsed' | 'expanded';
	/** Each specimen keeps its own fold choice, so the toggle can be tried. */
	let choices = $state<Record<string, Preference | undefined>>({});
	const stored = (key: string) => {
		const choice = choices[key];
		return choice === undefined ? {} : { [key.split(':')[1]]: choice };
	};
	const fold = (key: string) => (_stateId: string, choice: Preference) => (choices[key] = choice);
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
	summary="Una columna del tablero: cabecera con nombre, tono del grupo, recuento y botón de plegar, y la zona de tarjetas."
	role="Una columna por estado. Con tareas, una columna de 18 rem; plegada, una tira estrecha con el nombre y el recuento que sigue siendo un destino válido para «Mover a…» y para soltar, sin desplegarse. La persona decide a mano (la elección se guarda por estado, en toda la organización); sin elección, se pliega sola cuando está vacía. El botón de plegar también existe en un tablero de solo lectura: plegar es una preferencia de vista, no una escritura. Editable, trae zona de arrastre y «+» de creación rápida; de solo lectura, ninguno de los dos existe en el DOM."
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
			name: 'collapsedStates',
			type: "Record<string, 'collapsed' | 'expanded'>",
			default: '{}',
			description:
				'Elección guardada de la persona por estado; sin entrada, se pliega si está vacía.'
		},
		{
			name: 'ontogglecollapse',
			type: "(stateId: string, preference: 'collapsed' | 'expanded') => void",
			default: 'undefined',
			description: 'Se llama al pulsar el botón de plegar con la elección a guardar.'
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
		<div class="flex flex-wrap items-start gap-[var(--space-3)]">
			<!-- Populated, expanded -->
			<BoardColumn
				state={states[0]}
				{items}
				{states}
				editable
				collapsedStates={stored('expanded:todo')}
				ontogglecollapse={fold('expanded:todo')}
				onquickcreate={() => {}}
			/>
			<!-- Populated, collapsed by hand -->
			<BoardColumn
				state={states[0]}
				{items}
				{states}
				editable
				collapsedStates={{ todo: choices['hand:todo'] ?? 'collapsed' }}
				ontogglecollapse={fold('hand:todo')}
				onquickcreate={() => {}}
			/>
			<!-- Empty, expanded by hand -->
			<BoardColumn
				state={states[1]}
				items={[]}
				{states}
				editable
				collapsedStates={{ doing: choices['open:doing'] ?? 'expanded' }}
				ontogglecollapse={fold('open:doing')}
				onquickcreate={() => {}}
			/>
			<!-- Empty, collapsed by default -->
			<BoardColumn
				state={states[1]}
				items={[]}
				{states}
				editable
				collapsedStates={stored('default:doing')}
				ontogglecollapse={fold('default:doing')}
				onquickcreate={() => {}}
			/>
			<!-- Read-only: the toggle is still there -->
			<BoardColumn
				state={states[0]}
				{items}
				{states}
				collapsedStates={stored('readonly:todo')}
				ontogglecollapse={fold('readonly:todo')}
			/>
		</div>
	{/snippet}
</ComponentDocPage>
