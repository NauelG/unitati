import { describe, expect, it, vi } from 'vitest';
import { sendQuietly, type Mailer } from './mail';

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
