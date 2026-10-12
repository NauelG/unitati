<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Skeleton from '#lib/components/unitati/Skeleton.svelte';
</script>

<ComponentDocPage
	name="Skeleton"
	summary="Un bloque `surface-2` con un único barrido de luz: la forma de un contenido que aún no ha llegado."
	role="La única animación en bucle que la constitución de movimiento (fase 6) sanciona (#89) — un pase de ≤1.2s, ya colapsado a ~0 bajo prefers-reduced-motion por la capa global de src/app.css. Pinta una forma, nunca una frase: el llamador lo dimensiona con class para que el cambio a datos reales mueva cero píxeles (CLS 0)."
	whenToUse={[
		'La mitad lenta de una página streamed (#89): el rail de historial/relacionados de una ficha, detrás de un {#await}.',
		'Cualquier región cuyo contenido final ya se conoce en forma (ancho, alto, número de líneas) antes de tener los datos.'
	]}
	whenNotToUse={[
		'Un spinner de página completa: la constitución de #89 los prohíbe — la navegación ya tiene su propio shell persistente.',
		'Un envío de formulario sin valor local que mostrar: eso es el busy de Button, no un Skeleton.',
		'Contenido cuyo tamaño final es impredecible: un skeleton que no coincide con el contenido real introduce el mismo CLS que pretende evitar.'
	]}
	propsDoc={[
		{
			name: 'class',
			type: 'string',
			description:
				'Dimensiona la forma — w-24 h-4, size-9 rounded-full… — para que coincida exactamente con el contenido real.'
		},
		{
			name: 'label',
			type: 'string',
			description:
				'Anunciado una vez por un lector de pantalla. Omítelo en un skeleton junto a otro ya anunciado por su contenedor (p. ej. cada fila de DataTableSkeleton bajo una sola etiqueta).'
		}
	]}
	usage={`<Skeleton class="h-4 w-24" />
<Skeleton class="size-9 rounded-full" label="Cargando avatar…" />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — qué entra en la fase 8"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Formas</p>
			<div class="flex flex-wrap items-center gap-[var(--space-4)]">
				<Skeleton class="h-4 w-24" />
				<Skeleton class="h-[28px] w-16" />
				<Skeleton class="size-9 rounded-full" />
				<Skeleton class="h-20 w-40 rounded-[var(--radius-lg)]" />
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Variantes compuestas
			</p>
			<p class="text-sm text-[var(--ink-muted)]">
				<code>DataTableSkeleton</code>, <code>KpiCardSkeleton</code>,
				<code>TimelineSkeleton</code> y <code>ThreadSkeleton</code> componen este bloque con la
				geometría exacta de <code>DataTable</code>, <code>KpiCard</code>, <code>AssetTimeline</code>
				y <code>TicketThread</code> — cada una tiene su propia página en esta galería.
			</p>
		</div>
	{/snippet}
	{#snippet notes()}
		<p>
			El barrido usa <code>ut-shimmer</code>, un <code>@keyframes</code> propio en
			<code>src/app.css</code> con la misma convención que <code>ut-spin</code> (el punto busy de
			<code>Button</code>): solo un <code>to</code>, porque el estado inicial ya lo fija la clase
			Tailwind <code>before:-translate-x-full</code>.
		</p>
	{/snippet}
</ComponentDocPage>
