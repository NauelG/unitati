<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import KeymapOverlay from '#lib/components/unitati/KeymapOverlay.svelte';

	let open = $state(true);
</script>

<ComponentDocPage
	name="KeymapOverlay"
	summary="La ayuda `?`: cada atajo registrado, agrupado por zona, generada desde keymap.ts."
	role="El keymap es la fuente única (#88): esta ayuda no mantiene su propia lista, lee en vivo lo que cada página haya registrado en keymapRegistry. Añadir un atajo a una página lo añade aquí; no hay una segunda lista que sincronizar a mano."
	whenToUse={['Siempre disponible en (app): `?` la abre desde cualquier pantalla.']}
	whenNotToUse={['No tiene sentido fuera de (app): el portal no tiene superficie de comandos.']}
	propsDoc={[
		{ name: 'open', type: 'boolean', description: 'Bindable, como cualquier Dialog de la app.' }
	]}
	usage={`<KeymapOverlay bind:open={keymapOverlayOpen} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — ut-kbd"
>
	{#snippet demo()}
		<div
			class="relative h-[420px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]"
		>
			<KeymapOverlay bind:open />
		</div>
	{/snippet}
</ComponentDocPage>
