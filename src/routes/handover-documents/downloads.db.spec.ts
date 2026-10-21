import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db/index.js';
import {
	decideHandover,
	deliver,
	ensureDefaultHandoverTemplates,
	setCategoryRequiresHandover
} from '#lib/server/assets/index.js';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import { drawnSignature } from '#lib/server/assets/testing/png.js';
import { InMemoryStorage } from '#lib/server/shared/storage.js';
import { overrideRuntime } from '#lib/server/shared/runtime.js';
import { GET } from './[id]/+server';

async function signed() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const staff = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const person = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
	const otherEmployee = await createViewer(organisation.id, 'employee', 'Alan Turing');
	const catalogue = await createCatalogue(organisation.id);
	await setCategoryRequiresHandover(
		await createViewer(organisation.id, 'admin', 'Root Admin'),
		catalogue.categoryId,
		true
	);
	const asset = await createAsset(organisation.id, catalogue.modelId);
	const issued = await deliver(
		staff,
		{ personId: person.personId!, assetIds: [asset.id] },
		{ mailer: null }
	);
	if (!issued.ok || issued.value.handover?.status !== 'pending') {
		throw new Error('setup: no pending handover');
	}
	const storage = new InMemoryStorage();
	overrideRuntime({ storage, mailer: null });
	const { handover } = issued.value;
	await decideHandover(
		handover.token,
		'accept',
		{ ip: '203.0.113.7', userAgent: 'Mozilla/5.0', signature: drawnSignature() },
		{ storage, mailer: null }
	);
	return { handover, storage, staff, person, otherEmployee };
}

const call = (user: unknown, id: string) =>
	Promise.resolve(GET({ locals: { user }, params: { id } } as never)).then(
		(response) => ({ response }),
		(thrown: { status: number }) => ({ thrown })
	);

describe('handover document download', () => {
	it('serves the identical stored PDF to the signer and to staff', async () => {
		const { handover, person, staff } = await signed();
		const signer = (await call(person, handover.id)) as { response: Response };
		const technician = (await call(staff, handover.id)) as { response: Response };

		for (const { response } of [signer, technician]) {
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('application/pdf');
			expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		}
		expect(new Uint8Array(await signer.response.arrayBuffer())).toEqual(
			new Uint8Array(await technician.response.arrayBuffer())
		);
	});

	it('answers 404 to another employee and another organisation, without revealing the document', async () => {
		const { handover, otherEmployee } = await signed();
		const organisation = await createOrganisation('Other', 'other');
		const outsider = await createViewer(organisation.id, 'admin', 'Mallory');
		for (const user of [otherEmployee, outsider]) {
			expect((await call(user, handover.id)) as { thrown: { status: number } }).toMatchObject({
				thrown: { status: 404 }
			});
		}
		expect(
			(await call(otherEmployee, crypto.randomUUID())) as { thrown: { status: number } }
		).toMatchObject({
			thrown: { status: 404 }
		});
	});
});
