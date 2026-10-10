<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
</script>

{#snippet side()}
	<div class="h-16 rounded-[var(--radius-md)] bg-[var(--surface-2)]"></div>
{/snippet}

<ComponentDocPage
	name="PageLayout"
	summary="El vocabulario de ancho de página (ADR 0018): tres formas, ningún contenedor propio."
	role="Tres formas, nada de contenedor por página. index y record son fluidos hasta el techo --size-page-max y se centran más allá; form es una medida fija de la escala 2xl que nunca lee el techo, porque un formulario ancho hasta el infinito no gana nada. Ninguna ruta bajo (app), (portal) o (auth) declara su propio contenedor de ancho — el guardia de regresión page-layout.guard.spec.ts lo impide."
	whenToUse={[
		'index: listas y tablas.',
		'record: ficha de un registro, con columna lateral a 340px por encima de 1100px.',
		'form: formularios de alta/edición y prosa. Qué formulario de ticket/alta concreto usa esta variante y a qué medida — un formulario del tamaño de la tarea — sigue pendiente de #100; esta página documenta la regla de PageLayout, no esa decisión.'
	]}
	whenNotToUse={[
		'Para anidar un PageLayout dentro de otro: cada ruta usa exactamente uno.',
		'Para una medida interna legítima (un buscador, una línea de prosa): esa es una excepción documentada con un comentario layout-ok, no una nueva variante.'
	]}
	propsDoc={[
		{ name: 'variant', type: "'index' | 'record' | 'form'", description: 'La forma de la página.' },
		{
			name: 'side',
			type: 'Snippet',
			description: 'Solo con variant="record": panel lateral a 340px por encima de 1100px.'
		}
	]}
	usage={`<PageLayout variant="record">
  {mainContent}
  {#snippet side()}{sidePanel}{/snippet}
</PageLayout>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0018-page-layout-vocabulary.md"
	referenceLabel="ADR 0018 — vocabulario de layout de página"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				index — fluido hasta el techo, centrado más allá
			</p>
			<div
				class="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
			>
				<PageLayout variant="index">
					<div class="h-16 rounded-[var(--radius-md)] bg-[var(--asset-soft)]"></div>
				</PageLayout>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				record — el mismo techo, más columna lateral a 340px
			</p>
			<div
				class="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
			>
				<PageLayout variant="record" {side}>
					<div class="h-16 rounded-[var(--radius-md)] bg-[var(--desk-soft)]"></div>
				</PageLayout>
			</div>
		</div>
		<div>
			<!-- layout-ok: prosa que documenta la medida fija, no un contenedor nuevo -->
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				form — max-w-2xl, nunca lee el techo
			</p>
			<div
				class="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-4)]"
			>
				<PageLayout variant="form">
					<div class="h-16 rounded-[var(--radius-md)] bg-[var(--project-soft)]"></div>
				</PageLayout>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Las tres variantes a 375 / 1440 / 1920px — móvil, portátil, escritorio ancho
			</p>
			<p class="mb-2 text-[13px] leading-[18px] text-[var(--ink-muted)]">
				Cada caja fija su propio ancho solo para simular el viewport de la especimen — nunca el
				ancho de la página real, que PageLayout decide él mismo. A 375px, record pone la columna
				lateral primero (max-[1099px]:order-first).
			</p>
			<!-- layout-ok: anchos fijos de la especimen de viewport, no contenedores de página -->
			<div class="flex gap-[var(--space-4)] overflow-x-auto pb-2">
				{#each [{ px: 375, label: '375px · móvil' }, { px: 1440, label: '1440px · portátil' }, { px: 1920, label: '1920px · escritorio ancho' }] as frame (frame.px)}
					<div class="shrink-0" style:width="{frame.px}px">
						<p class="mb-1 font-mono text-xs text-[var(--ink-muted)]">{frame.label}</p>
						<div
							class="overflow-hidden rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-[var(--space-3)]"
						>
							<PageLayout variant="record" {side}>
								<div class="h-10 rounded-[var(--radius-md)] bg-[var(--desk-soft)]"></div>
								<div class="h-24 rounded-[var(--radius-md)] bg-[var(--surface-2)]"></div>
							</PageLayout>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
