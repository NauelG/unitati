<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import KpiCard from '#lib/components/unitati/KpiCard.svelte';
</script>

<ComponentDocPage
	name="KpiCard"
	summary="Un recuento de un vistazo: etiqueta corta y número tabular, sin decoración."
	role="Panel blanco de 12px con una etiqueta y un número en Instrument Sans tabular — nunca Unbounded, que es una tipografía de display y el peso equivocado para un número que alguien mira sesenta veces al día. tone dibuja un borde izquierdo de acento y es el único gesto semántico: ausente para un recuento normal (neutral), presente solo cuando el número en sí espera algo (warning) o va mal (danger)."
	whenToUse={[
		'Un recuento de la organización en el Overview o en la cabecera de una lista: solicitudes abiertas, activos sin asignar.',
		'Cuando el número en sí, y no una palabra al lado, es la información principal.'
	]}
	whenNotToUse={[
		'Para el resumen en una línea del PageHeader: ese texto compone frases pluralizadas, no tarjetas.',
		'Para un estado de registro (nuevo, en curso…): usa StatusBadge, que es una insignia, no un recuento.'
	]}
	propsDoc={[
		{
			name: 'label',
			type: 'string',
			description: 'Corto, texto plano: nombra qué se cuenta, no qué significa el número.'
		},
		{
			name: 'value',
			type: 'number | string',
			description: 'Un número ya formateado; el componente no decide separadores ni unidades.'
		},
		{
			name: 'tone',
			type: `'neutral' | 'warning' | 'danger' | 'success' | 'brand'`,
			default: `'neutral'`,
			description:
				'Borde izquierdo de acento. Ausente (neutral) para un recuento sin significado propio.'
		},
		{
			name: 'href',
			type: 'string',
			description:
				'Convierte la tarjeta entera en un enlace y activa la elevación al pasar por encima. Ausente: panel plano que no se mueve.'
		},
		{
			name: 'sparkline',
			type: 'Snippet',
			description: 'La línea de tendencia de 7/30 días (#90). Ver el componente Sparkline.'
		}
	]}
	usage={`<KpiCard label="Solicitudes abiertas" value={37} href="/service-desk">
  {#snippet sparkline()}
    <Sparkline points={data.ticketTrend} tone="desk" label="Solicitudes, 7 días" />
  {/snippet}
</KpiCard>

<!-- Sin href: estático, sin elevación -->
<KpiCard label="Esperando al usuario" value={4} tone="warning" />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0019-visual-language-and-work-surfaces.md"
	referenceLabel="ADR 0019 — superficies, radios y tipografía"
>
	{#snippet demo()}
		<div class="grid grid-cols-2 gap-[var(--space-3)] sm:grid-cols-4">
			<KpiCard label="Activos" value="0" />
			<KpiCard label="Solicitudes abiertas" value={37} />
			<KpiCard label="Esperando al usuario" value={4} tone="warning" />
			<KpiCard label="Sin asignar" value={1248} tone="danger" />
		</div>

		<div class="flex flex-col gap-[var(--space-3)]">
			<p class="text-small text-[var(--ink-muted)]">
				Con destino y sin destino. Pasa el ratón por encima de las dos: solo la primera se eleva.
			</p>
			<div class="grid grid-cols-2 gap-[var(--space-3)] sm:grid-cols-4">
				<KpiCard label="Con href · se eleva" value={37} href="#kpi-card" />
				<KpiCard label="Sin href · plana" value={37} />
			</div>
		</div>
	{/snippet}
	{#snippet notes()}
		<div class="flex flex-col gap-[var(--space-3)] text-sm text-[var(--ink)]">
			<p>
				La primera tarjeta muestra el caso vacío: "0" es un valor legítimo, no un hueco en blanco.
				Un <code>tone</code> solo aparece cuando el número en sí espera algo o va mal — una tarjeta de
				más no inventa un estado para parecer completa.
			</p>
			<p>
				<strong>El lenguaje de profundidad (#90): solo lo accionable se eleva.</strong> Con
				<code>href</code>, la tarjeta descansa en <code>--shadow-sm</code> y sube a
				<code>--shadow-md</code> al pasar por encima; sin él no tiene sombra y no se mueve nunca. La elevación
				es una promesa de que al pulsar pasa algo, así que una tarjeta estática que la tomara prestada
				estaría mintiendo.
			</p>
			<p>
				Un <code>value</code> numérico rueda <em>al cambiar</em> (NumberFlow), nunca al montar: en
				el primer pintado es estático, que es la regla 1 de la constitución de movimiento. Con
				<code>prefers-reduced-motion</code> no se mueve — y eso lo garantiza la librería, no
				<code>app.css</code>, porque estas animaciones corren vía
				<code>Element.animate()</code> dentro de un shadow root al que la capa global de CSS no llega.
			</p>
		</div>
	{/snippet}
</ComponentDocPage>
