<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
</script>

<ComponentDocPage
	name="Breadcrumbs"
	summary="El rastro de ruta de una ficha de registro: una sola línea de 32px, sin barra ni regla propias."
	role="Los segmentos los pasa el caller desde su propio +page.server.ts — nunca se reconstruyen leyendo la URL de vuelta, porque una ruta reservada o una etiqueta a medida lo hacen poco fiable. El último segmento es siempre el registro actual: sin href, aria-current=&quot;page&quot;. Es una línea de 32px sin borde (.ut-crumbs no tiene alto ni regla): la separación con la cabecera del registro la pone el espaciado, y la topbar fija del shell sigue siendo la única barra."
	whenToUse={[
		'La ficha de un registro con un padre claro: activo → Activos, ticket → Soporte → su cola.',
		'Cuando el servidor ya conoce el nombre real del padre (una cola, una categoría) y no hay que adivinarlo del slug de la URL.'
	]}
	whenNotToUse={[
		'Una página índice sin jerarquía por encima: su propio PageHeader ya la sitúa.',
		'Para volver atrás sin más: eso es la navegación del navegador, no un rastro de ruta.'
	]}
	propsDoc={[
		{
			name: 'segments',
			type: 'BreadcrumbSegment[]',
			description: '{ label, href? } en orden; el último sin href es el registro actual.'
		}
	]}
	usage={`<Breadcrumbs
  segments={[
    { label: 'Activos', href: '/assets' },
    { label: asset.assetTag }
  ]}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — .ut-crumbs"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Dos segmentos — detalle de activo
			</p>
			<Breadcrumbs segments={[{ label: 'Activos', href: '/assets' }, { label: 'AST-0042' }]} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Tres segmentos — detalle de ticket
			</p>
			<Breadcrumbs
				segments={[
					{ label: 'Soporte', href: '/service-desk' },
					{ label: 'Hardware', href: '/service-desk?queue=1' },
					{ label: 'TCK-1093' }
				]}
			/>
		</div>
	{/snippet}
</ComponentDocPage>
