<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import RollingText from '#lib/components/unitati/RollingText.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { rollingPlural } from '#lib/rolling.js';

	let total = $state(12);
	let unassigned = $state(3);
</script>

<ComponentDocPage
	name="RollingText"
	summary="Una frase traducida cuyos números ruedan, con la frase entera como nombre accesible."
	role="La frase sigue siendo un mensaje de Paraglide, con su propio singular/plural: se renderiza con countToken(i) donde va cada número y RollingText lo corta en texto y números. Los números van en NumberFlow; un lector de pantalla lee la frase una sola vez, no cada rodado."
	whenToUse={[
		'El resumen de una línea de PageHeader («12 activos · 3 sin asignar»).',
		'Cualquier frase con recuentos vivos que no puede salir de un mensaje traducido.'
	]}
	whenNotToUse={[
		'Un recuento suelto: RollingNumber.',
		'Una frase sin números que cambien: texto normal.'
	]}
	propsDoc={[
		{
			name: 'text',
			type: 'string',
			description:
				'El mensaje con countToken(i) en lugar de cada número; rollingPlural elige singular/plural.'
		},
		{ name: 'counts', type: 'readonly number[]', description: 'Los números reales, por índice.' }
	]}
	usage={`<RollingText
  text={rollingPlural(n, m.assets_summary_total_one, m.assets_summary_total_other, 0)}
  counts={[n]}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — NumberFlow"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-4)]">
			<p class="text-[var(--ink-muted)]">
				<RollingText
					text={`${rollingPlural(total, m.assets_summary_total_one, m.assets_summary_total_other, 0)} · ${rollingPlural(unassigned, m.assets_summary_unassigned_one, m.assets_summary_unassigned_other, 1)}`}
					counts={[total, unassigned]}
				/>
			</p>
			<Button
				size="sm"
				variant="secondary"
				onclick={() => (unassigned = Math.max(0, unassigned - 1))}>Asignar uno</Button
			>
			<Button size="sm" variant="secondary" onclick={() => (total = total === 1 ? 12 : 1)}>
				Singular / plural
			</Button>
		</div>
	{/snippet}
</ComponentDocPage>
