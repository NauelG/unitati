<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
</script>

<ComponentDocPage
	name="WorkPanel"
	summary="Región secundaria acotada (ADR 0019): un panel con cabecera y acciones opcionales."
	role="Una región secundaria o contenida — una tarjeta lateral, un grupo de acciones — distinta del lienzo de la app (--surface-0) y del área de trabajo primaria propia de una ficha. heading/actions son opcionales: un panel sin ninguno renderiza solo el cuerpo con relleno."
	whenToUse={[
		'Cualquier región secundaria con bordes propios: la columna lateral de una ficha, un grupo de ajustes.',
		'Para dar forma exacta a .ut-panel/.ut-panel-head/.ut-panel-title/.ut-panel-body.'
	]}
	whenNotToUse={[
		'Para el área de trabajo primaria de una conversación: TicketDetailLayout la compone directamente, sin pasar por aquí.',
		'Para la lista de registros vinculados: usa RelatedRecords, que ya es su propio panel con su propia lógica.'
	]}
	propsDoc={[
		{
			name: 'heading',
			type: 'string',
			description: 'Texto plano: nombra un grupo, no lleva su propio markup.'
		},
		{ name: 'actions', type: 'Snippet', description: 'A la derecha de heading.' }
	]}
	usage={`<WorkPanel heading="Detalles">
  {#snippet actions()}<Button size="sm">Editar</Button>{/snippet}
  {content}
</WorkPanel>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — tres niveles de superficie"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
			<WorkPanel heading="Con cabecera y acciones">
				{#snippet actions()}<Button size="sm">Editar</Button>{/snippet}
				<p class="text-sm text-[var(--ink-muted)]">
					Título y, opcionalmente, acciones alineadas a la derecha.
				</p>
			</WorkPanel>
			<WorkPanel>
				<p class="text-sm text-[var(--ink-muted)]">
					Sin cabecera: solo el cuerpo con relleno, para una región secundaria sin título propio.
				</p>
			</WorkPanel>
		</div>
	{/snippet}
</ComponentDocPage>
