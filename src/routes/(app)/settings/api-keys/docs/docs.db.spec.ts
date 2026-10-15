import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import { ENDPOINTS } from '#lib/server/api/index.js';
import { APP_VERSION } from '#lib/version.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { load } from './+page.server';

/** The documentation page's server seam: who gets in, and what it is sent. */

const event = (user: SessionUser | null) =>
	({ locals: { user }, url: new URL('https://desk.example.com/settings/api-keys/docs') }) as never;

async function workspace() {
	const organisation = await createOrganisation();
	return {
		technician: await createViewer(organisation.id, 'technician', 'Tom Technician'),
		employee: await createViewer(organisation.id, 'employee', 'Eva Employee')
	};
}

describe('/settings/api-keys/docs', () => {
	it('denies the employee with a 403', async () => {
		const { employee } = await workspace();

		expect(() => load(event(employee))).toThrowError(expect.objectContaining({ status: 403 }));
	});

	it('sends the technician the document of every registered use case', async () => {
		const { technician } = await workspace();

		const data = load(event(technician));
		const ids = Object.values(data.document.paths).flatMap((methods) =>
			Object.values(methods).map((operation) => operation.operationId)
		);

		expect(ids.sort()).toEqual(ENDPOINTS.map((endpoint) => endpoint.id).sort());
		expect(data.document.info.version).toBe(APP_VERSION);
		expect(data.document.servers[0].url).toBe('https://desk.example.com/api/v1');
	});

	it("sends what the technician's role holds, and not what only an admin does", async () => {
		const { technician } = await workspace();

		const data = load(event(technician));

		expect(data.held).toContain('tickets.manage');
		expect(data.held).not.toContain('api.keys.manage.all');
	});
});
