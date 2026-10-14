<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import RollingNumber from '#lib/components/unitati/RollingNumber.svelte';

	let value = $state(12);
</script>

<ComponentDocPage
	name="RollingNumber"
	summary="Un recuento que rueda cuando cambia y se queda quieto el resto del tiempo (S2)."
	role="Envuelve NumberFlow con los tiempos de la constitución de movimiento (240ms de rodado, 160ms de fundido). Anima solo cuando el valor cambia después del montaje: la primera pintura es el número plano. Con prefers-reduced-motion se queda estático."
	whenToUse={[
		'Un contador que refleja datos que cambian por una acción del usuario: el del sidebar, el de una cabecera, un KPI.',
		'Cuando el cambio del número explica una causa visible (asignaste un activo → baja «sin asignar»).'
	]}
	whenNotToUse={[
		'Un número que nunca cambia en la vida de la página: no hay nada que explicar.',
		'Dentro de una frase traducida: usa RollingText, que conserva la gramática del mensaje.'
	]}
	propsDoc={[{ name: 'value', type: 'number', description: 'El recuento actual.' }]}
	usage={`<RollingNumber value={count} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — NumberFlow"
>
	{#snippet demo()}
		<div class="flex items-center gap-[var(--space-4)]">
			<span class="font-sans text-[28px] font-semibold text-[var(--ink)]">
				<RollingNumber {value} />
			</span>
			<Button size="sm" variant="secondary" onclick={() => (value -= 1)}>−1</Button>
			<Button size="sm" variant="secondary" onclick={() => (value += 1)}>+1</Button>
			<Button size="sm" variant="secondary" onclick={() => (value += 88)}>+88</Button>
		</div>
	{/snippet}
</ComponentDocPage>
