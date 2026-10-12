<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import ThreadSkeleton from '#lib/components/unitati/ThreadSkeleton.svelte';
</script>

<ComponentDocPage
	name="ThreadSkeleton"
	summary="El avatar + tarjeta de TicketThread, antes de que llegue el hilo real."
	role="El hilo de un ticket se espera siempre (#89: es el punto de la página), así que esta forma no cubre la primera carga — cubre la navegación entre tickets mientras el nuevo hilo todavía no resuelve."
	whenToUse={[
		'La navegación entre fichas de ticket, si el hilo se trata como streamed en un punto futuro de la app.'
	]}
	whenNotToUse={[
		'El mensaje que el propio visitante acaba de enviar: eso es PendingThreadItem (TicketThread), no este skeleton — ya conoce su contenido, solo espera confirmación.'
	]}
	propsDoc={[
		{
			name: 'rows',
			type: 'number',
			default: '2',
			description: 'Mensajes a pintar mientras se desconoce el total real.'
		},
		{ name: 'class', type: 'string', description: 'Clases extra para la lista exterior.' }
	]}
	usage={`<ThreadSkeleton rows={3} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0017-experience-stack.md"
	referenceLabel="ADR 0017 — qué entra en la fase 8"
>
	{#snippet demo()}
		<ThreadSkeleton rows={2} />
	{/snippet}
</ComponentDocPage>
