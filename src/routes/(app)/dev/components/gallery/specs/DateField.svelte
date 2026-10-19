<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import DateField from '#lib/components/unitati/DateField.svelte';

	let due = $state<string | null>(null);
</script>

<ComponentDocPage
	name="DateField"
	summary="Campo de fecha: segmentos dd/mm/aaaa que se pueden teclear y un calendario en popover."
	role="Sustituye al <input type=date> nativo, que usa la tipografía y los colores del navegador. Mide lo mismo que Field, así que alinea con los campos de texto del formulario. Envía YYYY-MM-DD (o vacío al borrar) bajo el mismo name."
	whenToUse={[
		'Una fecha de calendario: vencimiento de un proyecto o de una tarea.',
		'Cualquier fecha que se edite en una fila editable (usa onchange para guardar al elegir).'
	]}
	whenNotToUse={[
		'Rangos de fechas u horas: no existen en la app.',
		'Una fecha que solo se muestra: formatéala como texto.'
	]}
	propsDoc={[
		{ name: 'label', type: 'string', description: 'Texto de la etiqueta.' },
		{ name: 'name', type: 'string', description: 'Nombre del input oculto que envía YYYY-MM-DD.' },
		{
			name: 'value',
			type: 'string | null',
			description: 'Bindable. YYYY-MM-DD; null se muestra vacío.'
		},
		{ name: 'error', type: 'string', description: 'Igual que en Field: presencia marca inválido.' },
		{ name: 'hint', type: 'string', description: 'Pista permanente bajo el control.' },
		{
			name: 'onchange',
			type: '(value: string | null) => void',
			description: 'Se llama al elegir, teclear una fecha completa, "Hoy" o "Borrar".'
		}
	]}
	usage={`<DateField label="Vencimiento" name="dueDate" bind:value={due} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-field"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<DateField label="Vacío" name="empty" />
			<DateField label="Con valor" name="filled" value="2026-11-30" />
			<DateField
				label="Con error"
				name="invalid"
				error="Indica una fecha válida."
				hint="Una pista."
			/>
			<DateField label="Deshabilitado" name="off" value="2026-11-30" disabled />
			<DateField label="Enlazado" name="bound" bind:value={due} hint={`Valor: ${due ?? '—'}`} />
		</div>
	{/snippet}
</ComponentDocPage>
