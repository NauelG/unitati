import { describe, expect, it, vi } from 'vitest';
import type { Mailer, MailMessage } from '../shared/mail';
import { plainExcerpt } from '../shared/markdown';
import {
	linkedTaskMail,
	notificationMail,
	sendLinkedTaskEmails,
	sendNotificationEmails
} from './mail';
import type { PendingEmail } from './notify';

const origin = 'https://unitati.test/';

function pending(overrides: Partial<PendingEmail> = {}): PendingEmail {
	return {
		to: 'eve@acme.test',
		type: 'ticket.replied',
		personId: 'p-eve',
		role: 'employee',
		target: { ticketId: 't-1' },
		snapshot: { code: 'TCK-0042', title: 'La impresora no responde', actorName: 'Tess Tech' },
		...overrides
	};
}

function recorder() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return { sent, mailer };
}

describe('notificationMail', () => {
	it('adds how to stop following to the mail of a followed record, and only to it', () => {
		const followed = notificationMail(
			pending({
				type: 'followed.activity',
				role: 'technician',
				target: { projectId: 'p-1' },
				snapshot: { code: 'PRJ-0001', title: 'Mudanza', summary: 'El proyecto se ha archivado' }
			}),
			origin
		);
		expect(followed.text).toContain('Dejar de seguir: https://unitati.test/projects/PRJ-0001');
		expect(notificationMail(pending(), origin).text).not.toContain('Dejar de seguir');
	});

	it('subjects with the code first, so mail clients keep threading', () => {
		expect(notificationMail(pending(), origin).subject).toBe('[TCK-0042] La impresora no responde');
		expect(
			notificationMail(pending({ type: 'ticket.assigned', role: 'technician' }), origin).subject
		).toBe('[TCK-0042] La impresora no responde');
	});

	it('keeps the resolved subject of the mail it replaces', () => {
		expect(notificationMail(pending({ type: 'ticket.resolved' }), origin).subject).toBe(
			'[TCK-0042] Resuelta: La impresora no responde'
		);
	});

	it('says what happened in the inbox’s words, quotes the excerpt and ends with the footer', () => {
		const excerpt = plainExcerpt('Ya está **arreglada**: [ver guía](https://x.test)', 280);
		const mail = notificationMail(
			pending({ snapshot: { ...pending().snapshot, excerpt } }),
			origin
		);

		expect(mail.to).toBe('eve@acme.test');
		expect(mail.text).toBe(
			[
				'Tess Tech ha respondido en TCK-0042 · La impresora no responde',
				'«Ya está arreglada: ver guía»',
				'https://unitati.test/portal/tickets/TCK-0042',
				'Gestiona tus notificaciones en https://unitati.test/account/notifications'
			].join('\n\n')
		);
	});

	it('carries an excerpt of at most 280 characters and no markdown', () => {
		const excerpt = plainExcerpt(`**${'palabra '.repeat(80).trim()}**`, 280);
		const mail = notificationMail(
			pending({ snapshot: { ...pending().snapshot, excerpt } }),
			origin
		);
		const quoted = mail.text.split('\n\n')[1];

		expect(excerpt.length).toBeLessThanOrEqual(280);
		expect(quoted).toBe(`«${excerpt}»`);
		expect(quoted).not.toContain('*');
	});

	it('links staff to the service desk and a requester to the portal', () => {
		const staff = notificationMail(
			pending({ type: 'ticket.commented', role: 'technician' }),
			origin
		);
		expect(staff.text).toContain('https://unitati.test/service-desk/TCK-0042');

		const employee = notificationMail(pending({ role: 'employee' }), origin);
		expect(employee.text).toContain('https://unitati.test/portal/tickets/TCK-0042');

		// A requester without a user can only ever be given portal access.
		const noUser = notificationMail(pending({ role: null }), origin);
		expect(noUser.text).toContain('https://unitati.test/portal/tickets/TCK-0042');
	});

	it('links a task by its code', () => {
		const mail = notificationMail(
			pending({
				type: 'task.assigned',
				role: 'technician',
				target: { taskId: 'k-1' },
				snapshot: { code: 'TSK-0007', title: 'Cambiar el switch', actorName: 'Ada Admin' }
			}),
			origin
		);
		expect(mail.subject).toBe('[TSK-0007] Cambiar el switch');
		expect(mail.text).toContain('Ada Admin te ha asignado la tarea TSK-0007 · Cambiar el switch');
		expect(mail.text).toContain('https://unitati.test/tasks/TSK-0007');
	});

	it('builds links from the origin with or without a trailing slash', () => {
		const mail = notificationMail(pending(), 'https://unitati.test');
		expect(mail.text).toContain('https://unitati.test/portal/tickets/TCK-0042');
		expect(mail.text).toContain('https://unitati.test/account/notifications');
		expect(mail.text).not.toContain('test//');
	});
});

describe('linkedTaskMail', () => {
	const task = { taskTag: 'TSK-0007', taskTitle: 'Replace the switch', toStateName: 'Hecho' };
	const linked = (code: string, title: string) =>
		pending({
			to: 'tom@acme.test',
			personId: 'p-tom',
			role: 'technician',
			type: 'task.linked_completed',
			snapshot: { code, title, summary: 'TSK-0007 Replace the switch' }
		});

	it('names the task and its state, lists the tickets with links, and leaves the decision', () => {
		const mail = linkedTaskMail(
			task,
			[linked('TCK-0001', 'No network'), linked('TCK-0002', 'Slow wifi')],
			origin
		);

		expect(mail.to).toBe('tom@acme.test');
		expect(mail.subject).toBe('[TSK-0007] Tarea completada: Replace the switch');
		expect(mail.text).toBe(
			[
				'La tarea TSK-0007 «Replace the switch» ha pasado a «Hecho».',
				'Tickets tuyos que se resolvían en ella:\n- TCK-0001 No network: https://unitati.test/service-desk/TCK-0001\n- TCK-0002 Slow wifi: https://unitati.test/service-desk/TCK-0002',
				'El ticket no se ha modificado. Decide si está resuelto.',
				'Gestiona tus notificaciones en https://unitati.test/account/notifications'
			].join('\n\n')
		);
	});

	it('sends one mail per person', async () => {
		const { sent, mailer } = recorder();
		const other = {
			...linked('TCK-0003', 'Port dead'),
			to: 'tessa@acme.test',
			personId: 'p-tessa'
		};

		await sendLinkedTaskEmails(
			mailer,
			task,
			[linked('TCK-0001', 'No network'), other, linked('TCK-0002', 'Slow wifi')],
			origin
		);

		expect(sent.map((message) => message.to).sort()).toEqual(['tessa@acme.test', 'tom@acme.test']);
		expect(sent.find((message) => message.to === 'tom@acme.test')?.text).toContain('TCK-0002');
	});
});

describe('sendNotificationEmails', () => {
	it('sends one mail per pending email', async () => {
		const { sent, mailer } = recorder();
		await sendNotificationEmails(
			mailer,
			[pending(), pending({ to: 'tom@acme.test', type: 'ticket.assigned' })],
			origin
		);
		expect(sent.map((message) => message.to)).toEqual(['eve@acme.test', 'tom@acme.test']);
	});

	it('does nothing, and does not fail, without SMTP', async () => {
		await expect(sendNotificationEmails(null, [pending()], origin)).resolves.toBeUndefined();
	});

	it('logs a failed send instead of throwing', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		await sendNotificationEmails(
			{ send: () => Promise.reject(new Error('ECONNREFUSED')) },
			[pending()],
			origin
		);
		expect(error).toHaveBeenCalledWith('could not send mail to eve@acme.test', expect.any(Error));
		error.mockRestore();
	});
});
