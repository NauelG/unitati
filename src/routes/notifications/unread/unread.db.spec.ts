import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import { GET } from './+server';

describe('GET /notifications/unread', () => {
	it('answers 401 without a session', async () => {
		await expect(GET({ locals: { user: null } } as never)).rejects.toMatchObject({ status: 401 });
	});

	it('returns the count, uncached, to any signed-in user', async () => {
		const organisation = await createOrganisation();
		const employee = await createViewer(organisation.id, 'employee');

		const response = await GET({ locals: { user: employee } } as never);

		expect(await response.json()).toEqual({ count: 0 });
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
