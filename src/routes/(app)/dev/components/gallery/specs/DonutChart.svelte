<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import DonutChart, { type DonutSlice } from '#lib/components/unitati/DonutChart.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { statusColour, statusLabel } from '#lib/components/unitati/status.js';
	import { ASSET_STATES } from '#lib/domain/status.js';

	/** Built exactly the way `/assets` builds it: labels and colours from `status.ts`. */
	const slices = (counts: Partial<Record<(typeof ASSET_STATES)[number], number>>): DonutSlice[] =>
		ASSET_STATES.map((state) => ({
			key: state,
			label: statusLabel(state),
			count: counts[state] ?? 0,
			colour: statusColour(state)
		}));

	const spread = slices({ in_use: 112, in_stock: 44, in_repair: 9, retired: 19 });
	const lopsided = slices({ in_use: 184 });
	const empty = slices({});
</script>

<ComponentDocPage
	name="DonutChart"
	summary="Un reparto como anillo, con el total en el hueco. Con estado vacío real."
	role="Cómo se divide un total entre unas pocas partes con nombre. De un vistazo, como Sparkline: sin tooltip, sin interacción, sin leyenda propia — las palabras y su orden pertenecen al dominio, no a la geometría, así que la leyenda la dibuja quien lo usa. Anillo y no tarta a propósito: el hueco es donde va el total, que es el número que el lector quiere de verdad, y un anillo compara longitudes de arco en vez de pedir que alguien juzgue el área de una porción."
	whenToUse={[
		'Un reparto de pocas categorías con nombre y un total que importa: activos por estado.',
		'Cuando las partes suman un todo cerrado. Si no suman, es una barra, no un anillo.'
	]}
	whenNotToUse={[
		'Con muchas categorías: por encima de cinco o seis los arcos dejan de ser comparables.',
		'Para una serie temporal: eso es Sparkline.',
		'Sin leyenda al lado: el color nunca es la única pista (ADR 0019), y cuatro arcos no pueden decir "En reparación 3".'
	]}
	propsDoc={[
		{
			name: 'slices',
			type: 'readonly DonutSlice[]',
			description:
				'{ key, label, count, colour }. La etiqueta ya traducida y el color ya resuelto: el gráfico no tiene paleta propia.'
		},
		{
			name: 'label',
			type: 'string',
			description: 'Nombre accesible, en forma de frase: lo único que recibe un lector de pantalla.'
		},
		{ name: 'size', type: 'number', default: '132', description: 'Diámetro exterior en px.' },
		{ name: 'thickness', type: 'number', default: '16', description: 'Grosor del anillo en px.' }
	]}
	usage={`const slices = data.distribution.map((entry) => ({
  key: entry.state,
  label: statusLabel(entry.state),
  count: entry.count,
  colour: statusColour(entry.state)
}));

<DonutChart {slices} label="Activos por estado" />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — stack de experiencia (layerchart)"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-start gap-[var(--space-8)]">
			<div>
				<p class="mb-[var(--space-3)] font-mono text-xs text-[var(--ink-muted)]">reparto normal</p>
				<DonutChart slices={spread} label="Activos por estado" />
			</div>
			<div>
				<p class="mb-[var(--space-3)] font-mono text-xs text-[var(--ink-muted)]">
					una sola categoría
				</p>
				<DonutChart slices={lopsided} label="Activos por estado" />
			</div>
			<div>
				<p class="mb-[var(--space-3)] font-mono text-xs text-[var(--ink-muted)]">
					vacío · estado vacío
				</p>
				<DonutChart slices={empty} label="Activos por estado" />
			</div>
		</div>

		<div class="flex flex-col gap-[var(--space-3)]">
			<p class="text-[13px] text-[var(--ink-muted)]">
				El color de cada porción sale de la misma tabla que lee StatusBadge, así que una porción y
				la insignia del mismo estado no pueden discrepar:
			</p>
			<div class="flex flex-wrap items-center gap-[var(--space-4)]">
				{#each ASSET_STATES as state (state)}
					<div class="flex items-center gap-[var(--space-2)]">
						<span
							class="size-3 rounded-[var(--radius-full)]"
							style:background-color={statusColour(state)}
							aria-hidden="true"
						></span>
						<StatusBadge status={state} />
					</div>
				{/each}
			</div>
		</div>
	{/snippet}

	{#snippet notes()}
		<div class="flex flex-col gap-[var(--space-3)] text-sm leading-[22px] text-[var(--ink)]">
			<p>
				<strong
					>La regla dura de la fase 9: todo gráfico se entrega con estado vacío o no se entrega.</strong
				>
				Aquí, sin datos, es un anillo completo en
				<code>--surface-2</code> con una raya en el centro: la forma que el gráfico
				<em>va</em> a tener, visiblemente sin ningún valor. La alternativa que una librería regala sin
				que se la pidas es una única porción de 360° en el primer color de la paleta, que se lee como
				"100% en servicio" cuando la verdad es que no hay nada registrado. Una mentira con aplomo, y el
				peor de los dos fallos.
			</p>
			<p>
				A diferencia de <code>Sparkline</code>, esto <strong>sí</strong> se renderiza en el
				servidor: el tamaño de un anillo es intrínseco, así que
				<code>width</code>/<code>height</code> se saben sin medir ningún contenedor y nada salta al hidratar.
			</p>
			<p>
				<code>sort={'{null}'}</code> conserva el orden de los datos. d3-pie ordena por valor por
				defecto, lo que reordenaría las porciones — y con ellas sus colores — cada vez que dos
				recuentos se cruzaran, haciendo que el mismo inventario pareciese otro gráfico entre dos
				recargas. El servidor ya devuelve el orden del vocabulario (<code>ASSET_STATES</code>); esto
				es lo que lo preserva.
			</p>
			<p>
				Las porciones a cero se descartan antes de dibujar: una porción de ancho cero igual consume
				su hueco de <code>padAngle</code>, así que cuatro estados vacíos dibujarían cuatro astillas
				de separación en un círculo por lo demás limpio. La leyenda, en cambio, las conserva — por
				eso "no hay nada en reparación" se sigue leyendo.
			</p>
		</div>
	{/snippet}
</ComponentDocPage>
