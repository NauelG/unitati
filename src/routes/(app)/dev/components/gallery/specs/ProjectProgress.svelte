<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import ProjectProgress from '#lib/components/unitati/ProjectProgress.svelte';
</script>

<ComponentDocPage
	name="ProjectProgress"
	summary="Barra de progreso de un proyecto: completadas ÷ (total − canceladas)."
	role="Recibe el recuento de tareas por grupo de estado y dibuja una barra. Las canceladas no cuentan ni a favor ni en contra: salen del denominador. Su etiqueta accesible enumera el recuento por grupo. Sin tareas (o solo canceladas) muestra un estado vacío explícito: un 0 % afirmaría que el proyecto está parado."
	whenToUse={[
		'La ficha de un proyecto y cualquier lista donde el avance importe.',
		'Con el recuento que devuelve projectProgress, tal cual.'
	]}
	whenNotToUse={[
		'Para el estado de una sola tarea: usa StatusBadge con group.',
		'Para una distribución por categorías: usa DonutChart.'
	]}
	propsDoc={[
		{
			name: 'counts',
			type: 'Record<StateGroup, number>',
			description: 'Tareas por grupo; todos los grupos presentes, aunque sea a cero.'
		}
	]}
	usage={`<ProjectProgress counts={progress.counts} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — superficies de trabajo"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					A mitad (2 de 4, 1 cancelada)
				</p>
				<ProjectProgress
					counts={{ backlog: 0, unstarted: 1, started: 1, completed: 2, cancelled: 1 }}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Completo</p>
				<ProjectProgress
					counts={{ backlog: 0, unstarted: 0, started: 0, completed: 3, cancelled: 0 }}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Sin tareas (estado vacío)
				</p>
				<ProjectProgress
					counts={{ backlog: 0, unstarted: 0, started: 0, completed: 0, cancelled: 0 }}
				/>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
