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
			name: 'sparkline',
			type: 'Snippet',
			description: 'Reservado para la fase #90. Nada se renderiza aquí todavía.'
		}
	]}
	usage={`<KpiCard label="Solicitudes abiertas" value={37} />
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
	{/snippet}
	{#snippet notes()}
		<p>
			La primera tarjeta muestra el caso vacío: "0" es un valor legítimo, no un hueco en blanco. Un
			<code>tone</code> solo aparece cuando el número en sí espera algo o va mal — una tarjeta de más
			no inventa un estado para parecer completa.
		</p>
	{/snippet}
</ComponentDocPage>
