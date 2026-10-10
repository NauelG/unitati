<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TicketThread from '#lib/components/unitati/TicketThread.svelte';
	import type { ThreadItem } from '#lib/server/service-desk/comments.js';

	const attachmentHref = (id: string) => `/attachments/${id}`;

	const staffView: ThreadItem[] = [
		{
			kind: 'event',
			at: new Date('2026-03-01T09:00:00Z'),
			entry: {
				id: 'e1',
				verb: 'ticket.created',
				occurredAt: new Date('2026-03-01T09:00:00Z'),
				actorPersonId: null,
				actorName: null,
				payload: { ticketTag: 'TCK-0042', subject: 'No enciende el portátil', channel: 'portal' }
			}
		},
		{
			kind: 'comment',
			id: 'c1',
			authorPersonId: 'p1',
			authorName: 'Ada Lovelace',
			body: 'Lo intenté cargar toda la noche y sigue sin encender.',
			visibility: 'public',
			createdAt: new Date('2026-03-01T09:05:00Z'),
			attachments: []
		},
		{
			kind: 'comment',
			id: 'c2',
			authorPersonId: 'p2',
			authorName: 'Soporte técnico',
			body: 'Nota interna: revisar si está en garantía antes de ofrecer sustitución.',
			visibility: 'internal',
			createdAt: new Date('2026-03-01T10:00:00Z'),
			attachments: []
		},
		{
			kind: 'comment',
			id: 'c3',
			authorPersonId: 'p2',
			authorName: 'Soporte técnico',
			body: 'Hemos abierto una incidencia con el proveedor. Adjunto el diagnóstico.',
			visibility: 'public',
			createdAt: new Date('2026-03-01T10:30:00Z'),
			attachments: [
				{ id: 'f1', filename: 'diagnostico.pdf', contentType: 'application/pdf', byteSize: 2048 }
			]
		}
	];

	const requesterView: ThreadItem[] = staffView.filter(
		(item) => item.kind !== 'comment' || item.visibility !== 'internal'
	);
</script>

<ComponentDocPage
	name="TicketThread"
	summary="Carril cronológico de una conversación: comentarios y eventos del sistema."
	role="Renderiza lo que ticketThread devuelve — comentarios fusionados con eventos de activity en el momento de leer; nunca reordena y nunca decide quién ve una nota interna, eso ya lo hizo la consulta. Toda respuesta es ahora una tarjeta acotada (ADR 0019): pública en surface-1 con borde, interna en warning-soft con su insignia."
	whenToUse={['La conversación de un ticket, tanto en la vista de personal como en el portal.']}
	whenNotToUse={[
		'Para la actividad de un activo sin conversación: usa AssetTimeline.',
		'Para componer un mensaje nuevo: eso es TicketComposer, separado.'
	]}
	propsDoc={[
		{
			name: 'items',
			type: 'ThreadItem[]',
			description: 'Más antiguo primero, como ticketThread las devuelve.'
		},
		{
			name: 'attachmentHref',
			type: '(id: string) => string',
			description: 'Dónde se sirve un adjunto; personal y portal tienen rutas distintas.'
		}
	]}
	usage={`<TicketThread items={await ticketThread(viewer, ticket.id)} {attachmentHref} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-thread"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Vista de personal (con nota interna)
			</p>
			<TicketThread items={staffView} {attachmentHref} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Vista del portal (sin nota interna)
			</p>
			<TicketThread items={requesterView} {attachmentHref} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Vacío</p>
			<TicketThread items={[]} {attachmentHref} />
		</div>
	{/snippet}
</ComponentDocPage>
