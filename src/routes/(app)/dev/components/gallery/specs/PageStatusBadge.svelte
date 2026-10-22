<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import PageStatusBadge from '#lib/components/unitati/PageStatusBadge.svelte';
</script>

<ComponentDocPage
	name="PageStatusBadge"
	summary="Estado de una página de la base de conocimiento: borrador, publicada o archivada."
	role="Una insignia por estado de ciclo de vida de la página. Borrador (ámbar) avisa de que los empleados aún no la ven; Publicada (verde) es la que leen; Archivada (neutra) solo la ve el personal con «Mostrar archivadas». El estado es una clave cerrada, nunca texto libre: el componente resuelve el tono y la etiqueta."
	whenToUse={[
		'Junto al título de una página en el árbol, en su cabecera o en un selector.',
		'Una página publicada en el árbol no muestra insignia (es el caso normal); aquí se muestra para documentarla.'
	]}
	whenNotToUse={[
		'Para estados de tickets, prioridades o activos: usa StatusBadge.',
		'Para la audiencia de un espacio (Personal / Portal): es una propiedad del espacio, no de la página.'
	]}
	propsDoc={[
		{
			name: 'status',
			type: "'draft' | 'published' | 'archived'",
			description: 'El estado de la página, tal como lo devuelve listSpaceTree.'
		}
	]}
	usage={`<PageStatusBadge status={page.status} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0031-knowledge-base-spaces-page-tree-and-revisions.md"
	referenceLabel="ADR 0031 — espacios, árbol de páginas y revisiones"
>
	{#snippet demo()}
		<div class="flex flex-wrap items-center gap-[var(--space-2)]">
			<PageStatusBadge status="draft" />
			<PageStatusBadge status="published" />
			<PageStatusBadge status="archived" />
		</div>
	{/snippet}
</ComponentDocPage>
