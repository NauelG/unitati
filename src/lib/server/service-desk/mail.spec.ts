import { describe, expect, it } from 'vitest';
import { taskCompletedMail } from './mail';

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
