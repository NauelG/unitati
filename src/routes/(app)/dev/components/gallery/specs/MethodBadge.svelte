<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import MethodBadge, { HTTP_METHODS } from '#lib/components/unitati/MethodBadge.svelte';

	const usage = '<MethodBadge method="POST" />';
</script>

<ComponentDocPage
	name="MethodBadge"
	summary="El método HTTP de un caso de uso, tal como se escribe en la documentación de la API."
	role="Un método nombra una clase de petición, no un estado: por eso comparte la píldora de StatusBadge pero sin punto. El tono dice cuánto cambia la petición — GET lee, POST crea o aplica, PATCH modifica, DELETE borra."
	whenToUse={[
		'En la documentación de la API, junto a la ruta de cada caso de uso.',
		'Siempre con un método del registro de endpoints: el tipo cierra el conjunto.'
	]}
	whenNotToUse={[
		'Para el estado de un ticket o un activo: usa StatusBadge.',
		'Para etiquetar cualquier otra cosa en mayúsculas: el tono significa algo de HTTP.'
	]}
	propsDoc={[
		{
			name: 'method',
			type: "'GET' | 'POST' | 'PATCH' | 'DELETE'",
			description: 'El método; también es el texto de la insignia.'
		}
	]}
	{usage}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0022-api-layer-and-api-keys.md"
	referenceLabel="ADR 0022 — la API y las claves"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-3)]">
			{#each HTTP_METHODS as method (method)}
				<MethodBadge {method} />
			{/each}
		</div>
	{/snippet}
</ComponentDocPage>
