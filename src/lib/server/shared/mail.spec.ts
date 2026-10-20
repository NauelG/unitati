import { describe, expect, it, vi } from 'vitest';
import { sendQuietly, smtpMailerOver, type Mailer } from './mail';

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

describe('smtpMailerOver', () => {
	it('passes attachments to the transport with filename, type and bytes', async () => {
		const sendMail = vi.fn().mockResolvedValue(undefined);
		const mailer = smtpMailerOver({ from: 'no-reply@acme.test' }, { sendMail } as never);
		const content = new Uint8Array([1, 2, 3]);

		await mailer.send({
			...message,
			attachments: [{ filename: 'handover.pdf', contentType: 'application/pdf', content }]
		});

		const sent = sendMail.mock.calls[0][0];
		expect(sent.from).toBe('no-reply@acme.test');
		expect(sent.attachments).toHaveLength(1);
		expect(sent.attachments[0].filename).toBe('handover.pdf');
		expect(sent.attachments[0].contentType).toBe('application/pdf');
		expect([...sent.attachments[0].content]).toEqual([1, 2, 3]);
	});

	it('sends a plain message without attachments', async () => {
		const sendMail = vi.fn().mockResolvedValue(undefined);

		await smtpMailerOver({ from: 'a@b.test' }, { sendMail } as never).send(message);

		expect(sendMail.mock.calls[0][0].attachments).toBeUndefined();
	});
});
