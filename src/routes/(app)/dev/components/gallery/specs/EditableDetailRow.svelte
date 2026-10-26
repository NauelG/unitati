<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';

	const people = [
		{ value: 'p-1', label: 'Anna Puig' },
		{ value: 'p-2', label: 'Bernat Soler' },
		{ value: 'p-3', label: 'Clara Roig' },
		{ value: 'p-4', label: 'David Camps' }
	];
	const nameOf = (id: string | null) => people.find((p) => p.value === id)?.label ?? '';

	let owner = $state<string | null>('p-1');
	let failing = $state<string | null>('p-2');
	let team = $state<string[]>(['p-1', 'p-3']);
	let due = $state<string | null>('2026-11-03');
	let title = $state('Migrar el correo');
	let readOnly = $state<string | null>('p-4');

	function single(set: (v: string | null) => void, get: () => string | null) {
		return (formData: FormData) => {
			const before = get();
			set(String(formData.get('value')) || null);
			return () => set(before);
		};
	}
</script>

{#snippet ownerRow()}
	<EditableDetailRow
		kind="select"
		label="Responsable"
		value={owner}
		display={nameOf(owner)}
		options={people}
		noneLabel="Sin asignar"
		placeholder="Sin asignar"
		action="?/save"
		name="value"
		editable
		optimistic={single(
			(v) => (owner = v),
			() => owner
		)}
	/>
{/snippet}
{#snippet failingRow()}
	<EditableDetailRow
		kind="select"
		label="Custodio"
		value={failing}
		display={nameOf(failing)}
		options={people}
		action="?/fail"
		name="value"
		editable
		optimistic={single(
			(v) => (failing = v),
			() => failing
		)}
	/>
{/snippet}
{#snippet teamRow()}
	<EditableDetailRow
		kind="multiselect"
		label="Asignados"
		values={team}
		display={team.map(nameOf).join(', ')}
		options={people}
		placeholder="Sin asignar"
		action="?/save"
		name="value"
		editable
		optimistic={(formData) => {
			const before = team;
			team = formData.getAll('value').map(String);
			return () => (team = before);
		}}
	/>
{/snippet}
{#snippet dueRow()}
	<EditableDetailRow
		kind="custom"
		label="Vencimiento"
		value={due}
		display={due ?? ''}
		placeholder="Sin fecha"
		action="?/save"
		name="value"
		editable
		optimistic={single(
			(v) => (due = v),
			() => due
		)}
	>
		{#snippet editor({ value, commit, cancel })}
			<!-- Stand-in for the calendar the project and task pages supply (#210). -->
			<div class="flex flex-col gap-[var(--space-2)] p-[var(--space-3)]">
				<input
					type="date"
					class="rounded-[var(--radius-md)] border border-[var(--border)] px-[var(--space-2)]"
					aria-label="Fecha"
					{value}
					onchange={(event) => commit(event.currentTarget.value)}
				/>
				<button type="button" class="text-left text-small underline" onclick={cancel}>
					Cancelar
				</button>
			</div>
		{/snippet}
	</EditableDetailRow>
{/snippet}
{#snippet titleRow()}
	<EditableDetailRow
		kind="text"
		label="Título"
		value={title}
		display={title}
		action="?/save"
		name="value"
		editable
		optimistic={(formData) => {
			const before = title;
			title = String(formData.get('value'));
			return () => (title = before);
		}}
	/>
{/snippet}
{#snippet readOnlyRow()}
	<EditableDetailRow
		kind="select"
		label="Responsable"
		value={readOnly}
		display={nameOf(readOnly)}
		options={people}
		action="?/save"
		name="value"
		editable={false}
		optimistic={() => () => {}}
	/>
{/snippet}

<ComponentDocPage
	name="EditableDetailRow"
	summary="Valor editable en el sitio dentro de «Detalles»: elección, múltiple, propio o texto."
	role="El valor de una fila de DescriptionList que se edita donde se muestra (ADR 0029). Solo el valor lleva borde de 1 px, y ocupa la columna entera para que las filas se alineen. Cuatro tipos: select (guarda al elegir, con una opción «ninguno» opcional), multiselect (guarda al cerrar el popover, si cambió), custom (un snippet editor recibe value, commit y cancel, p. ej. un calendario) y text (Enter o salir guarda, Escape cancela). Sin permiso es texto plano."
	whenToUse={[
		'Responsable, cola, custodio, ubicación, propietario o vencimiento en el panel «Detalles».',
		'Cualquier propiedad de un registro abierto que se cambia con frecuencia.'
	]}
	whenNotToUse={[
		'Estado y prioridad de la cabecera: usa EditableChip.',
		'Texto largo: usa el editor de texto enriquecido con Guardar/Cancelar.',
		'Varios campos a la vez: usa un Sheet (ADR 0020).'
	]}
	propsDoc={[
		{
			name: 'kind',
			type: "'select' | 'multiselect' | 'custom' | 'text'",
			description: 'Cómo se elige el valor.'
		},
		{ name: 'label', type: 'string', description: 'Nombre accesible de la propiedad.' },
		{
			name: 'value / values',
			type: 'string | null / string[]',
			description: 'El espejo de la página.'
		},
		{
			name: 'display',
			type: 'string',
			description: 'El valor ya formateado para el modo lectura.'
		},
		{
			name: 'displayContent',
			type: 'Snippet',
			description:
				'Marcado más rico para el valor (un chip por etiqueta); `display` sigue siendo el texto equivalente.'
		},
		{
			name: 'action / name',
			type: 'string',
			description: 'Acción del formulario y campo enviado.'
		},
		{
			name: 'editable',
			type: 'boolean',
			description: 'Sin permiso: texto plano, sin borde ni botón.'
		},
		{
			name: 'optimistic',
			type: '(formData) => () => void',
			description: 'Escribe el espejo y devuelve el deshacer.'
		},
		{
			name: 'placeholder',
			type: 'string',
			description: 'Se muestra, atenuado, cuando no hay valor.'
		},
		{
			name: 'options',
			type: '{ value, label, disabled? }[]',
			description: 'Para select y multiselect.'
		},
		{ name: 'noneLabel', type: 'string', description: 'select: etiqueta de la opción vacía.' },
		{
			name: 'editor',
			type: 'Snippet<[{ value, commit, cancel }]>',
			description: 'custom: el contenido del popover.'
		},
		{ name: 'error', type: 'string', description: 'text: error de validación bajo el campo.' },
		{ name: 'openOnHash', type: 'string', description: 'Fragmento que abre el popover al cargar.' }
	]}
	usage={`<DescriptionList
  items={[
    { label: 'Responsable', value: ownerRow }
  ]}
/>

{#snippet ownerRow()}
  <EditableDetailRow
    kind="select"
    label="Responsable"
    value={owner}
    display={ownerName}
    options={people}
    noneLabel="Sin asignar"
    action="?/assign"
    name="personId"
    editable={canManage}
    optimistic={applyOwner}
  />
{/snippet}`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0029-in-place-editing-on-record-pages.md"
	referenceLabel="ADR 0029 — edición en el sitio"
>
	{#snippet demo()}
		<div class="max-w-[340px]">
			<WorkPanel heading="Detalles">
				<DescriptionList
					items={[
						{ label: 'Responsable', value: ownerRow },
						{ label: 'Falla', value: failingRow },
						{ label: 'Equipo', value: teamRow },
						{ label: 'Vence', value: dueRow },
						{ label: 'Título', value: titleRow },
						{ label: 'Sin permiso', value: readOnlyRow }
					]}
				/>
			</WorkPanel>
		</div>
	{/snippet}
</ComponentDocPage>
