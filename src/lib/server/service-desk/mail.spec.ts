import { describe, expect, it, vi } from 'vitest';
import { sendQuietly, taskCompletedMail, type Mailer } from './mail';

const message = { to: 'ada@acme.test', subject: 's', text: 't' };

describe('sendQuietly', () => {
	it('does nothing when mail is not configured', async () => {
		await expect(sendQuietly(null, message)).resolves.toBeUndefined();
	});

	it('logs and swallows a delivery failure instead of throwing', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const mailer: Mailer = { send: () => Promise.reject(new Error('ECONNREFUSED')) };

		await expect(sendQuietly(mailer, message)).resolves.toBeUndefined();

		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});

	it('hands the message to the mailer', async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await sendQuietly({ send }, message);

		expect(send).toHaveBeenCalledWith(message);
	});
});

describe('taskCompletedMail', () => {
	it('names the task and its state, lists tickets with absolute links, and leaves the decision', () => {
		const mail = taskCompletedMail(
			{ taskTag: 'TSK-0007', taskTitle: 'Replace the switch', toStateName: 'Hecho' },
			[
				{ ticketTag: 'TCK-0001', subject: 'No network' },
				{ ticketTag: 'TCK-0002', subject: 'Slow wifi' }
			],
			(tag) => `https://unitati.test/service-desk/${tag}`
		);

		expect(mail.subject).toBe('[TSK-0007] Tarea completada: Replace the switch');
		expect(mail.text).toBe(
			[
				'La tarea TSK-0007 «Replace the switch» ha pasado a «Hecho».',
				'Tickets tuyos que se resolvían en ella:\n- TCK-0001 No network: https://unitati.test/service-desk/TCK-0001\n- TCK-0002 Slow wifi: https://unitati.test/service-desk/TCK-0002',
				'El ticket no se ha modificado. Decide si está resuelto.'
			].join('\n\n')
		);
	});
});
