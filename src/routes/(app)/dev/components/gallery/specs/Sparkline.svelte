<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import KpiCard from '#lib/components/unitati/KpiCard.svelte';
	import Sparkline from '#lib/components/unitati/Sparkline.svelte';
	import type { SparklinePoint } from '#lib/domain/sparkline.js';

	/** A dense series, exactly as `densifyDailyCounts` returns one. */
	const series = (counts: number[]): SparklinePoint[] =>
		counts.map((count, index) => ({
			date: `2026-03-${String(index + 9).padStart(2, '0')}`,
			count
		}));

	const week = series([2, 5, 3, 8, 4, 1, 6]);
	const quiet = series([0, 0, 1, 0, 0, 0, 0]);
	const flat = series([4, 4, 4, 4, 4, 4, 4]);
	const empty = series([0, 0, 0, 0, 0, 0, 0]);
</script>

<ComponentDocPage
	name="Sparkline"
	summary="Tendencia diaria sin ejes, para el pie de un KpiCard. Con estado vacío real."
	role="La forma de un número, no su valor. Sin ejes, sin rejilla, sin tooltip: un sparkline se mira de un vistazo, no se explora — una superficie de informes explorable es posterior a la v1. El número que está encima es el dato; esto es solo su silueta. El eje y arranca siempre en cero, de modo que una semana de 3, 3, 3, 4 se ve como lo que es y no como un acantilado."
	whenToUse={[
		'Bajo un recuento que cuenta sucesos: solicitudes abiertas, altas de activos.',
		'Cuando la tendencia aporta algo que el número solo no dice.'
	]}
	whenNotToUse={[
		'Bajo un estado permanente (sin asignar, esperando al usuario): no existe "cuántos había el martes", e inventarlo dibujaría una magnitud que nadie registró.',
		'Cuando el lector necesita leer valores concretos: eso es una tabla, no una silueta.',
		'Con series no densas: el servidor rellena los días vacíos con cero; el componente no lo rehace, para que una consulta que deje de hacerlo se note.'
	]}
	propsDoc={[
		{
			name: 'points',
			type: 'readonly SparklinePoint[]',
			description:
				'Serie densa: un punto por día, ceros incluidos. La produce densifyDailyCounts en el servidor.'
		},
		{
			name: 'tone',
			type: `'asset' | 'desk' | 'project' | 'brand'`,
			default: `'brand'`,
			description: 'Color de dominio, el mismo que los puntos del sidebar y los chips RecordRef.'
		},
		{
			name: 'label',
			type: 'string',
			description:
				'Nombre accesible, en forma de frase: es lo único que recibe un lector de pantalla.'
		},
		{
			name: 'height',
			type: 'number',
			default: '32',
			description: 'Altura reservada en px. Fija, para que la tarjeta no salte al llegar la línea.'
		}
	]}
	usage={`<KpiCard label="Solicitudes abiertas" value={37} href="/service-desk">
  {#snippet sparkline()}
    <Sparkline points={data.ticketTrend} tone="desk" label="Solicitudes abiertas, últimos 7 días" />
  {/snippet}
</KpiCard>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — stack de experiencia (layerchart)"
>
	{#snippet demo()}
		<div class="flex flex-col gap-[var(--space-3)]">
			<p class="text-small text-[var(--ink-muted)]">En su sitio real, el pie de un KpiCard:</p>
			<div class="grid grid-cols-2 gap-[var(--space-3)] sm:grid-cols-4">
				<KpiCard label="Solicitudes abiertas" value={29} href="#sparkline">
					{#snippet sparkline()}
						<Sparkline points={week} tone="desk" label="Solicitudes, 7 días" />
					{/snippet}
				</KpiCard>
				<KpiCard label="Activos en servicio" value={184} href="#sparkline">
					{#snippet sparkline()}
						<Sparkline points={week} tone="asset" label="Altas, 7 días" />
					{/snippet}
				</KpiCard>
				<!-- The case the hard rule exists for: a fresh install. -->
				<KpiCard label="Altas este mes" value={0}>
					{#snippet sparkline()}
						<Sparkline points={empty} tone="asset" label="Altas, 7 días" />
					{/snippet}
				</KpiCard>
				<KpiCard label="Proyectos activos" value={3} href="#sparkline">
					{#snippet sparkline()}
						<Sparkline points={quiet} tone="project" label="Proyectos, 7 días" />
					{/snippet}
				</KpiCard>
			</div>
		</div>

		<div class="flex flex-col gap-[var(--space-3)]">
			<p class="text-small text-[var(--ink-muted)]">Los cuatro casos, aislados:</p>
			<div
				class="grid gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)] sm:grid-cols-4"
			>
				<div>
					<p class="mb-[var(--space-2)] font-mono text-xs text-[var(--ink-muted)]">con datos</p>
					<Sparkline points={week} tone="desk" label="Con datos" />
				</div>
				<div>
					<p class="mb-[var(--space-2)] font-mono text-xs text-[var(--ink-muted)]">un solo día</p>
					<Sparkline points={quiet} tone="desk" label="Un solo día" />
				</div>
				<div>
					<p class="mb-[var(--space-2)] font-mono text-xs text-[var(--ink-muted)]">
						constante (no es cero)
					</p>
					<Sparkline points={flat} tone="desk" label="Constante" />
				</div>
				<div>
					<p class="mb-[var(--space-2)] font-mono text-xs text-[var(--ink-muted)]">
						vacío · estado vacío
					</p>
					<Sparkline points={empty} tone="desk" label="Vacío" />
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet notes()}
		<div class="flex flex-col gap-[var(--space-3)] text-sm text-[var(--ink)]">
			<p>
				<strong
					>La regla dura de la fase 9: todo gráfico se entrega con estado vacío o no se entrega.</strong
				>
				El fallo que esta regla evita está documentado en el issue: a una librería de gráficos se le pasa
				una serie vacía y ella inventa un eje de −1,0 a 1,0 y dibuja un punto en el medio. Es un retrato
				de la nada que se lee como una medición. Aquí, sin datos, se dibuja una línea base en
				<code>--border</code> y la frase "Sin datos todavía": dice lo mismo y no se puede malinterpretar.
			</p>
			<p>
				<code>isEmptySeries</code> toma esa decisión en los términos del servidor:
				<strong>treinta cubos a cero son "sin datos", no una línea plana en cero.</strong> La cuarta muestra
				de arriba es constante en 4 y sí dibuja línea; la quinta es toda ceros y no.
			</p>
			<p>
				La mitad del gráfico se renderiza solo en el cliente: <code>layerchart</code> mide su
				contenedor y un sparkline es fluido por definición, así que se reserva
				<code>height</code> y no se renderiza nada hasta que el ancho es real — así la llegada no
				cuesta ningún salto de layout. El estado vacío, en cambio, es marcado plano y
				<em>sí</em> viaja desde el servidor, que es justo cuando hace falta: en una instalación nueva.
			</p>
			<p>
				Segmentos rectos, no curva suavizada: una spline dibujaría valores entre dos días que nadie
				midió, y estos cubos son recuentos discretos de día completo.
			</p>
		</div>
	{/snippet}
</ComponentDocPage>
