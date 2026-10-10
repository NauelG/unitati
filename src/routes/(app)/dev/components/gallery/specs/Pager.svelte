<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
</script>

<ComponentDocPage
	name="Pager"
	summary="Anterior/siguiente como enlaces, porque una página es una URL."
	role="Enlaces, no botones: una página sobrevive a una recarga, un marcador y el botón atrás, cosas que un manejador de clic no da gratis. Un extremo sin siguiente página se renderiza como <span aria-disabled>, no como un enlace inerte."
	whenToUse={[
		'Cualquier lista paginada en el servidor: el componente nunca reordena ni refiltra, solo enlaza.'
	]}
	whenNotToUse={[
		'Para una lista infinita cargada por scroll: ese patrón no existe en este sistema todavía.',
		'Para navegar entre pasos de un asistente: eso no es paginación de una colección.'
	]}
	propsDoc={[
		{ name: 'page', type: 'number', description: 'Base 1, como en la URL.' },
		{ name: 'pageCount', type: 'number', description: 'Total de páginas.' },
		{ name: 'perPage', type: 'number', description: 'Filas por página.' },
		{
			name: 'total',
			type: 'number',
			description: 'Toda fila que coincide, no solo las de esta página.'
		},
		{
			name: 'href',
			type: '(page: number) => string',
			description: 'URL de una página dada; el caller mantiene su propio query string.'
		}
	]}
	usage={`<Pager
  {page}
  {pageCount}
  {perPage}
  {total}
  href={(page) => \`?page=\${page}\`}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — paginación"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Primera página</p>
			<Pager page={1} pageCount={5} perPage={20} total={97} href={(page) => `?page=${page}`} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Página intermedia
			</p>
			<Pager page={3} pageCount={5} perPage={20} total={97} href={(page) => `?page=${page}`} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Última página</p>
			<Pager page={5} pageCount={5} perPage={20} total={97} href={(page) => `?page=${page}`} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Una sola página</p>
			<Pager page={1} pageCount={1} perPage={20} total={8} href={(page) => `?page=${page}`} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Sin resultados</p>
			<Pager page={1} pageCount={0} perPage={20} total={0} href={(page) => `?page=${page}`} />
		</div>
	{/snippet}
</ComponentDocPage>
