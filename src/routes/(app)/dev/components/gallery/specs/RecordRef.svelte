<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import RecordRef from '#lib/components/unitati/RecordRef.svelte';
</script>

<ComponentDocPage
	name="RecordRef"
	summary="Chip de referencia en línea, con tinte, a un registro (activo o ticket)."
	role="La unidad visual de la idea central del producto — las relaciones entre registros — por lo que luce igual en una tabla, un panel de relación, una línea de tiempo y un hilo. Tinte por el dominio del registro. El tag nunca se recorta (es cómo se reconoce el registro); el título sí."
	whenToUse={[
		'Cualquier mención en línea a un activo o ticket concreto, dentro de prosa, una tabla o un hilo.'
	]}
	whenNotToUse={[
		'Para listar varios registros relacionados con acciones de desvinculación: usa RelatedRecords.',
		'Para una persona: usa Avatar, nunca este componente — las personas no son "registros" del dominio aquí.'
	]}
	propsDoc={[
		{
			name: 'record',
			type: "{ kind: 'asset' | 'ticket'; tag: string; title: string; href: string }",
			description: 'Exactamente lo que relatedTo devuelve.'
		}
	]}
	usage={`<RecordRef record={{ kind: 'asset', tag: 'AST-0231', title: 'MacBook Pro 14"', href: '/assets/AST-0231' }} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-ref"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Activo</p>
			<RecordRef
				record={{
					kind: 'asset',
					tag: 'AST-0231',
					title: 'MacBook Pro 14"',
					href: '/assets/AST-0231'
				}}
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Ticket</p>
			<RecordRef
				record={{
					kind: 'ticket',
					tag: 'TCK-0042',
					title: 'No enciende el portátil',
					href: '/service-desk/TCK-0042'
				}}
			/>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Título largo (se recorta; el tag nunca)
			</p>
			<div class="max-w-[220px]">
				<!-- layout-ok: medida fija del contenedor de la demo, no un contenedor de página -->
				<RecordRef
					record={{
						kind: 'asset',
						tag: 'AST-0999',
						title: 'Un título de activo deliberadamente largo que debe recortarse con elipsis',
						href: '/assets/AST-0999'
					}}
				/>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
