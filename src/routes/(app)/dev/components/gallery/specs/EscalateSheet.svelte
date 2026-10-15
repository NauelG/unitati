<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import EscalateSheet from '#lib/components/unitati/EscalateSheet.svelte';
	import type { EscalateTarget, ProjectMode } from '#lib/components/unitati/escalation-form.js';

	type Variant = {
		id: string;
		label: string;
		target?: { target: EscalateTarget; mode?: ProjectMode };
		canCreate?: boolean;
		assignee?: string | null;
		error?: string;
	};

	const variants: Variant[] = [
		{ id: 'new-task', label: 'Tarea nueva', target: { target: 'new_task' } },
		{ id: 'existing-task', label: 'Tarea existente', target: { target: 'existing_task' } },
		{
			id: 'existing-project',
			label: 'Proyecto existente',
			target: { target: 'project', mode: 'existing' }
		},
		{ id: 'new-project', label: 'Proyecto nuevo', target: { target: 'project', mode: 'new' } },
		{ id: 'no-manage', label: 'Sin projects.manage (no ofrece lo nuevo)', canCreate: false },
		{ id: 'no-assignee', label: 'Ticket sin asignado', assignee: null },
		{
			id: 'error',
			label: 'Error de dominio',
			error: 'Ese proyecto está archivado: no admite trabajo nuevo.'
		}
	];

	let openId: string | null = $state(null);

	const people = [
		{ value: 'p1', label: 'Marta Puig' },
		{ value: 'p2', label: 'Laura Serra' }
	];
</script>

<ComponentDocPage
	name="EscalateSheet"
	summary="Escalar un ticket a trabajo: crear o vincular una tarea o un proyecto, sin salir de la ficha."
	role="Un Sheet sobre la ficha del ticket (ADR 0020): se escala mientras se lee el ticket, así que no tapa lo que se está resumiendo. Un control segmentado elige el destino (Tarea nueva, Tarea existente, Proyecto con su propio nuevo/existente). Bajo los campos, un Alert informativo dice qué se crea, qué se vincula, que el ticket no cambia y a quién se avisa. El botón primario nombra el acto, así que no hay segunda confirmación. Sin projects.manage no se ofrecen Tarea nueva ni Proyecto nuevo."
	whenToUse={[
		'La acción Escalar de la ficha de un ticket; la paleta y la tecla E abren este mismo Sheet.'
	]}
	whenNotToUse={[
		'Vincular un activo desde la ficha: es otra superficie, con otras consecuencias.',
		'Crear un proyecto con más que nombre y responsable: eso es /projects/new.'
	]}
	propsDoc={[
		{
			name: 'open / onOpenChange',
			type: 'boolean / (open) => void',
			description:
				'Los controla el llamador. Cerrar con campos editados pregunta antes por un ConfirmDialog.'
		},
		{
			name: 'ticket',
			type: '{ tag, statusLabel, assigneeName }',
			description: 'Lo que las frases de consecuencia necesitan del ticket.'
		},
		{
			name: 'draft',
			type: '{ title, description }',
			description: 'Lo que escalationDraft precarga para la tarea nueva.'
		},
		{
			name: 'canCreate',
			type: 'boolean',
			description:
				'projects.manage. Sin él, lo nuevo no se ofrece y el Sheet abre en Tarea existente.'
		},
		{
			name: 'searchBase',
			type: 'string',
			description:
				'Raíz de los endpoints de los selectores: /tasks, /projects y /linkable-projects.'
		}
	]}
	usage={`<EscalateSheet
  open={escalateOpen}
  onOpenChange={(next) => (escalateOpen = next)}
  ticket={{ tag, statusLabel, assigneeName }}
  draft={data.escalation.draft}
  projectName={ticket.subject}
  canCreate={data.escalation.canCreate}
  people={peopleOptions}
  defaultOwnerId={data.user.personId}
  searchBase="/service-desk/{tag}/escalate"
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0020-form-workflow-shapes.md"
	referenceLabel="ADR 0020 — formas de formulario"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-3)] sm:grid-cols-2">
			{#each variants as variant (variant.id)}
				<div>
					<Button variant="secondary" size="sm" onclick={() => (openId = variant.id)}>
						{variant.label}
					</Button>
					<EscalateSheet
						open={openId === variant.id}
						onOpenChange={(next) => (openId = next ? variant.id : null)}
						ticket={{
							tag: 'TCK-0093',
							statusLabel: 'En curso',
							assigneeName: variant.assignee === undefined ? 'Marta Puig' : variant.assignee
						}}
						draft={{
							title: 'La impresora de planta 2 no imprime',
							description: 'Atasca cada página.'
						}}
						projectName="La impresora de planta 2 no imprime"
						canCreate={variant.canCreate ?? true}
						{people}
						defaultOwnerId="p1"
						searchBase="/dev/components/none"
						startTarget={variant.target}
						startError={variant.error}
					/>
				</div>
			{/each}
		</div>
	{/snippet}
</ComponentDocPage>
