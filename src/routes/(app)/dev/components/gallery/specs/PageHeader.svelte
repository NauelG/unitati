<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
</script>

<ComponentDocPage
	name="PageHeader"
	summary="Cabecera de página compartida: código, título, resumen y acciones."
	role="Código mono opcional sobre el título, el título en Unbounded (título propio de la página, ADR 0019), un resumen de una línea en ink-muted y acciones alineadas a la derecha. Ningún PageLayout dibuja su propia cabecera; es siempre este componente."
	whenToUse={['La cabecera de cualquier página index o record que no use TicketDetailLayout.']}
	whenNotToUse={[
		'La cabecera de un ticket: usa TicketDetailLayout, que ya compone sus propios chips de estado.',
		'Un título de sección dentro de un panel: eso es WorkPanel heading, no PageHeader.'
	]}
	propsDoc={[
		{ name: 'title', type: 'string', description: 'El título de la página, en Unbounded.' },
		{ name: 'code', type: 'string', description: 'Código mono opcional sobre el título.' },
		{ name: 'summary', type: 'Snippet', description: 'Una línea, en ink-muted, bajo el título.' },
		{ name: 'actions', type: 'Snippet', description: 'Alineadas a la derecha.' },
		{
			name: 'level',
			type: "'index' | 'record'",
			description:
				"'index' (por defecto) es el título de una página de módulo (title-1, 24/30); 'record' es el título de un registro en su detalle (title-2, 18/26)."
		}
	]}
	usage={`<PageHeader title="Activos" code="AST-0231">
  {#snippet summary()}Una línea, en ink-muted, bajo el título.{/snippet}
  {#snippet actions()}<Button size="sm">Registrar</Button>{/snippet}
</PageHeader>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0018-page-layout-vocabulary.md"
	referenceLabel="ADR 0018 — vocabulario de layout de página"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Con código, resumen y acciones
			</p>
			<PageHeader title="Activos" code="AST-0231">
				{#snippet summary()}Una línea, en ink-muted, bajo el título.{/snippet}
				{#snippet actions()}<Button size="sm">Registrar</Button>{/snippet}
			</PageHeader>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Solo título (sin código, sin resumen, sin acciones)
			</p>
			<PageHeader title="Directorio" />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				level="record" (title-2, 18/26)
			</p>
			<PageHeader title="MacBook Pro 14" code="AST-0231" level="record" />
		</div>
	{/snippet}
</ComponentDocPage>
