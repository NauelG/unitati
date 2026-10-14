<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TaskCard from '#lib/components/unitati/TaskCard.svelte';

	const person = (fullName: string) => ({ personId: fullName, fullName });
	const base = {
		id: 'demo',
		stateId: 's',
		taskTag: 'OBR-12',
		title: 'Embalar el material de oficina',
		dueDate: '2030-01-31'
	};
	const targets = [
		{ id: 'a', name: 'En curso' },
		{ id: 'b', name: 'Hecho' }
	];
</script>

<ComponentDocPage
	name="TaskCard"
	summary="Tarjeta de una tarea en el tablero: código, título, personas asignadas y fecha límite."
	role="Una tarea dentro de una columna. Enlaza a la tarea, dibuja hasta tres avatares (el resto, como «+N») y, si recibe `moveTargets`, ofrece el menú «Mover a…»: el menú es la acción real y el arrastre solo la dispara. Sin `moveTargets` no hay menú en el DOM."
	whenToUse={[
		'Dentro de BoardColumn.',
		'Con `moveTargets` solo cuando quien mira puede mover tareas.'
	]}
	whenNotToUse={[
		'Para una fila de lista: usa la lista de tareas de la ficha del proyecto.',
		'Para un registro suelto fuera del tablero: usa RecordRef.'
	]}
	propsDoc={[
		{ name: 'task', type: 'BoardTask', description: 'Código, título, fecha y personas asignadas.' },
		{
			name: 'moveTargets',
			type: '{ id: string; name: string }[]',
			default: 'undefined',
			description: 'Estados a los que se puede mover, sin el actual. Omitido: sin menú.'
		},
		{
			name: 'onmove',
			type: '(stateId: string) => void',
			default: 'undefined',
			description: 'Se llama al elegir un estado en el menú.'
		}
	]}
	usage={`<TaskCard {task} moveTargets={others} onmove={(stateId) => move(task.id, stateId)} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — superficies de trabajo"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
			<TaskCard task={{ ...base, assignees: [] }} moveTargets={targets} onmove={() => {}} />
			<TaskCard
				task={{ ...base, assignees: [person('Ada Lovelace')] }}
				moveTargets={targets}
				onmove={() => {}}
			/>
			<TaskCard
				task={{
					...base,
					assignees: [person('Ada Lovelace'), person('Grace Hopper'), person('Alan Turing')]
				}}
				moveTargets={targets}
				onmove={() => {}}
			/>
			<TaskCard task={{ ...base, assignees: [person('Ada Lovelace')] }} />
		</div>
	{/snippet}
</ComponentDocPage>
