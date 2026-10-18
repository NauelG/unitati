import { count, eq } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { listPeople } from '../directory';
import { emailFor } from './plan';
import {
	addComment,
	assignTicket,
	changeTicketStatus,
	createQueue,
	createTicket,
	listQueues,
	setTicketPriority,
	tickets,
	type Deps
} from '../service-desk';

/**
 * A small, believable service desk: three queues and a spread of tickets in
 * every status, with replies and internal notes. #13 takes it to volume.
 *
 * Written through the domain functions, so the thread a seeded ticket shows is
 * the thread the app would have written. Mail is switched off here on purpose:
 * seeding must never email anyone.
 *
 * **Idempotent by presence.** Tickets get server-generated tags, so unlike
 * assets there is nothing to collide on; a second run is skipped whenever the
 * organisation already has any ticket.
 */

const QUEUES = ['Hardware', 'Software', 'Accesos'] as const;

interface PlannedTicket {
	subject: string;
	body: string;
	queue: (typeof QUEUES)[number];
	steps: ('in_progress' | 'waiting_on_user' | 'resolved' | 'closed')[];
	/** Who asks, when it matters; otherwise requesters are dealt out in turn. */
	requesterEmail?: string;
	priority?: 'low' | 'high' | 'urgent';
	reply?: string;
	note?: string;
}

const PLAN: PlannedTicket[] = [
	{
		subject: 'La impresora de la planta 2 no imprime',
		body: 'Desde esta mañana se queda en cola y no sale nada.',
		queue: 'Hardware',
		steps: ['in_progress'],
		priority: 'high',
		reply: 'Estamos revisándolo, te aviso en cuanto funcione.',
		note: 'Parece el spooler otra vez.'
	},
	{
		subject: 'No puedo conectarme a la VPN desde casa',
		body: 'Me dice que las credenciales no son válidas.',
		queue: 'Accesos',
		steps: ['in_progress', 'waiting_on_user'],
		reply: '¿Puedes confirmar si te funciona con el móvil en datos?'
	},
	{
		subject: 'Necesito Office en el portátil nuevo',
		body: 'Me han dado el equipo hoy y no tiene Office instalado.',
		queue: 'Software',
		steps: ['in_progress', 'resolved'],
		reply: 'Instalado. Reinicia y comprueba que abre.'
	},
	{
		subject: 'El ratón va a saltos',
		body: 'El puntero se queda parado a ratos.',
		queue: 'Hardware',
		steps: ['in_progress', 'resolved', 'closed'],
		priority: 'low',
		reply: 'Te lo hemos cambiado por uno nuevo.'
	},
	{
		subject: 'Alta en la carpeta compartida de contabilidad',
		body: 'Necesito acceso de lectura a la carpeta de facturas.',
		queue: 'Accesos',
		steps: [],
		priority: 'urgent'
	},
	{
		subject: 'El monitor parpadea',
		body: 'Parpadea cuando cambio de ventana.',
		queue: 'Hardware',
		steps: []
	},
	{
		// The seeded employee's own ticket, so signing in as them shows a request
		// with something escalated from it (see `buildEscalationsPlan`).
		subject: 'Quiero cambiar mi puesto de sitio',
		body: 'Con la mudanza, ¿puedo sentarme junto a mi equipo?',
		queue: 'Accesos',
		steps: [],
		requesterEmail: emailFor('Eva Employee')
	},
	// More of the same words, so a search has something to rank (#12): "impresora"
	// in a subject, in a body only, and "portátil" / "monitor" repeated across queues.
	// None is Eva's: the escalations seed looks up her one ticket by requester.
	{
		subject: 'La impresora de contabilidad atasca el papel',
		body: 'Cada tres hojas se queda atascada en la bandeja.',
		queue: 'Hardware',
		requesterEmail: emailFor('Ada Lovelace'),
		steps: ['in_progress'],
		reply: 'Vamos a cambiar los rodillos.'
	},
	{
		subject: 'Instalar el driver de la impresora en el portátil',
		body: 'No aparece como impresora disponible desde el equipo nuevo.',
		queue: 'Software',
		requesterEmail: emailFor('Alan Turing'),
		steps: ['in_progress', 'resolved']
	},
	{
		subject: 'Cambio de tóner',
		body: 'La impresora de la recepción avisa de que queda poco tóner.',
		queue: 'Hardware',
		requesterEmail: emailFor('Grace Hopper'),
		steps: [],
		priority: 'low'
	},
	{
		subject: 'El portátil se apaga solo',
		body: 'Se apaga cuando pasa un rato sin cargador.',
		queue: 'Hardware',
		requesterEmail: emailFor('Tom Technician'),
		steps: ['in_progress', 'waiting_on_user'],
		priority: 'high',
		reply: '¿Puedes traerlo a la oficina para revisar la batería?'
	},
	{
		subject: 'El portátil va muy lento al arrancar',
		body: 'Tarda más de cinco minutos en llegar al escritorio.',
		queue: 'Software',
		requesterEmail: emailFor('Ada Lovelace'),
		steps: []
	},
	{
		subject: 'Segundo monitor para la mesa de diseño',
		body: 'Necesito un monitor adicional, a ser posible de 27 pulgadas.',
		queue: 'Hardware',
		requesterEmail: emailFor('Alan Turing'),
		steps: ['in_progress', 'resolved', 'closed'],
		priority: 'low'
	},
	{
		subject: 'Restablecer la contraseña de la VPN',
		body: 'Caducó la semana pasada y no puedo entrar.',
		queue: 'Accesos',
		requesterEmail: emailFor('Grace Hopper'),
		steps: ['in_progress', 'resolved']
	},
	{
		subject: 'MacBook sin sonido tras la actualización',
		body: 'Los altavoces no suenan desde que se actualizó el sistema.',
		queue: 'Software',
		requesterEmail: emailFor('Tom Technician'),
		steps: ['in_progress']
	}
];

export async function seedTickets(actor: SessionUser): Promise<number> {
	const organisationId = actor.organisationId;

	const [existing] = await getDb()
		.select({ total: count() })
		.from(tickets)
		.where(eq(tickets.organisationId, organisationId));
	if (existing.total > 0) return 0;

	const deps: Deps = { mailer: null };

	for (const name of QUEUES) await createQueue(actor, { name });
	const queueIds = new Map((await listQueues(actor)).map((queue) => [queue.name, queue.id]));

	const requesters = (await listPeople(organisationId)).filter((person) => person.active);
	if (requesters.length === 0) return 0;

	let created = 0;
	for (const [index, planned] of PLAN.entries()) {
		const requester =
			requesters.find((person) => person.email === planned.requesterEmail) ??
			requesters[index % requesters.length];

		const opened = await createTicket(
			actor,
			{
				subject: planned.subject,
				body: planned.body,
				queueId: queueIds.get(planned.queue)!,
				requesterPersonId: requester.id,
				priority: planned.priority
			},
			[],
			deps
		);
		if (!opened.ok) continue;

		const { ticketTag } = opened.value;
		created += 1;

		if (planned.priority) await setTicketPriority(actor, ticketTag, planned.priority);
		if (planned.steps.length > 0) await assignTicket(actor, ticketTag, actor.personId);
		if (planned.note) {
			await addComment(actor, ticketTag, { body: planned.note, visibility: 'internal' }, [], deps);
		}
		if (planned.reply) {
			await addComment(actor, ticketTag, { body: planned.reply, visibility: 'public' }, [], deps);
		}
		for (const step of planned.steps) await changeTicketStatus(actor, ticketTag, step, deps);
	}

	return created;
}
