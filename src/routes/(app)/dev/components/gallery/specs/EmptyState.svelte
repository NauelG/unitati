<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import SearchX from '@lucide/svelte/icons/search-x';
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
</script>

<ComponentDocPage
	name="EmptyState"
	summary="La rejilla vacía compartida: título opcional, una frase, icono en un disco suave y una acción."
	role="&quot;Todavía no hay nada&quot; y &quot;ningún resultado coincide con el filtro&quot; son dos frases distintas, nunca la misma: el caller decide cuál es pasando title/description/action diferentes — este componente no tiene opinión sobre cuál es, solo sobre cómo se enmarca una. Deliberadamente compacto: la queja original de #86 era una tarjeta de 450px para una sola frase, así que no hay una forma «hero» a pantalla completa — ninguna página de la app la necesita todavía."
	whenToUse={[
		'El grid vacío de una DataTable o un catálogo entero.',
		'Una página índice sin datos todavía: icono y acción de alta.',
		'Una búsqueda/filtro sin resultados: title distinto al de "sin datos", acción de limpiar filtro en vez de "crear el primero".'
	]}
	whenNotToUse={[
		'Un error de formulario o de red: eso es Alert, no una ausencia de datos.',
		'Una confirmación de que algo se borró con éxito: eso es un toast (#89), no un estado permanente.'
	]}
	propsDoc={[
		{
			name: 'icon',
			type: 'LucideIcon',
			description: 'Se muestra dentro de un disco neutro (--surface-2). Omítelo para solo texto.'
		},
		{
			name: 'title',
			type: 'string',
			description: 'Omítelo para la forma compacta sin titular, la que usa DataTable.'
		},
		{ name: 'description', type: 'string', description: 'Una frase. Lo único que es obligatorio.' },
		{
			name: 'action',
			type: 'Snippet',
			description: 'La acción primaria que resuelve la vacuidad: "Registrar…", "Borrar filtro".'
		},
		{
			name: 'kbdHint',
			type: 'Snippet',
			description: 'Un atajo de teclado junto a la acción, p. ej. ⌘K.'
		}
	]}
	usage={`<EmptyState
  icon={Inbox}
  title="Todavía no hay activos"
  description="Registra el primero para empezar."
>
  {#snippet action()}
    <Button href="/assets/new" size="sm">Registrar un activo</Button>
  {/snippet}
</EmptyState>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — estados vacíos"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Compacta, en el grid de una tabla
			</p>
			<div class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]">
				<EmptyState description="Todavía no hay activos registrados." />
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Con título e icono, sin datos todavía
			</p>
			<div class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]">
				<EmptyState
					icon={Inbox}
					title="Todavía no hay activos"
					description="Registra el primero para empezar a llevar el inventario."
				>
					{#snippet action()}
						<Button href="/assets/new" size="sm">Registrar un activo</Button>
					{/snippet}
				</EmptyState>
			</div>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Sin resultados de filtro
			</p>
			<div class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]">
				<EmptyState
					icon={SearchX}
					title="Sin resultados"
					description="Ningún activo coincide con «portátil rojo»."
				>
					{#snippet action()}
						<Button href="?" variant="secondary" size="sm">Borrar filtro</Button>
					{/snippet}
				</EmptyState>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
