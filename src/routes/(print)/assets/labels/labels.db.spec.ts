import QRCode from 'qrcode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ BETTER_AUTH_URL: 'https://unitati.example.com/' }));

import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { load } from './+page.server';

interface LoadData {
	format: string;
	skip: number;
	labels: { tag: string; name: string; qrSvg: string }[];
	missing: string[];
	origin: string;
	requestOrigin: string;
	originMismatch: boolean;
}

function event(user: SessionUser | null, query: string, origin = 'https://unitati.example.com') {
	return {
		locals: { user },
		url: new URL(`${origin}/assets/labels?${query}`)
	} as never;
}

async function run(user: SessionUser | null, query: string, origin?: string) {
	try {
		return { data: (await load(event(user, query, origin))) as LoadData };
	} catch (thrown) {
		return { status: (thrown as { status: number }).status };
	}
}

let technician: SessionUser;
let employee: SessionUser;

beforeEach(async () => {
	const organisation = await createOrganisation();
	technician = await createViewer(organisation.id, 'technician', 'Tess Technician');
	employee = await createViewer(organisation.id, 'employee', 'Eva Employee');
	const { modelId } = await createCatalogue(organisation.id, 'ThinkPad', 'Lenovo', 'Laptops');
	for (const [index, name] of ['Alpha', 'Beta'].entries()) {
		await createAsset(organisation.id, modelId, {
			name,
			assetTag: `AST-000${index + 1}`,
			serial: `SECRET-SERIAL-${index}`
		});
	}
});

describe('/assets/labels load', () => {
	it('points every QR at the installation origin, not the request origin', async () => {
		const result = await run(technician, 'tag=AST-0001', 'http://192.168.1.10:3000');

		expect(result.data?.labels).toHaveLength(1);
		const expected = await QRCode.toString('https://unitati.example.com/s/AST-0001', {
			type: 'svg',
			errorCorrectionLevel: 'M',
			margin: 0
		});
		expect(result.data?.labels[0].qrSvg).toBe(expected);
		expect(result.data?.origin).toBe('https://unitati.example.com');
	});

	it('warns when the request origin differs and stays quiet when it matches', async () => {
		const lan = await run(technician, 'tag=AST-0001', 'http://192.168.1.10:3000');
		const same = await run(technician, 'tag=AST-0001');

		expect(lan.data?.originMismatch).toBe(true);
		expect(lan.data?.requestOrigin).toBe('http://192.168.1.10:3000');
		expect(same.data?.originMismatch).toBe(false);
	});

	it('keeps the order of the tags, drops duplicates and lists unknown ones as missing', async () => {
		const result = await run(technician, 'tag=AST-0002&tag=AST-0001&tag=AST-0002&tag=AST-9999');

		expect(result.data?.labels.map((label: { tag: string }) => label.tag)).toEqual([
			'AST-0002',
			'AST-0001'
		]);
		expect(result.data?.missing).toEqual(['AST-9999']);
	});

	it('carries the tag and the name and nothing else about the asset', async () => {
		const result = await run(technician, 'tag=AST-0001');

		expect(Object.keys(result.data?.labels[0] ?? {}).sort()).toEqual(['name', 'qrSvg', 'tag']);
		expect(JSON.stringify(result.data)).not.toContain('SECRET-SERIAL');
	});

	it('refuses more than 500 tags and accepts exactly 500', async () => {
		const tags = (count: number) => Array.from({ length: count }, (_, i) => `tag=X-${i}`).join('&');

		expect((await run(technician, tags(501))).status).toBe(400);
		const ok = await run(technician, tags(500));
		expect(ok.data?.missing).toHaveLength(500);
	});

	it('answers 400 when no tag is given', async () => {
		expect((await run(technician, 'format=a4-3x8')).status).toBe(400);
	});

	it('falls back to the default format and ignores skip on the roll', async () => {
		const unknown = await run(technician, 'tag=AST-0001&format=zzz&skip=3');
		const roll = await run(technician, 'tag=AST-0001&format=roll-62x29&skip=3');

		expect(unknown.data?.format).toBe('a4-3x8');
		expect(unknown.data?.skip).toBe(3);
		expect(roll.data?.skip).toBe(0);
	});

	it('is closed to an employee and to a visitor', async () => {
		expect((await run(employee, 'tag=AST-0001')).status).toBe(404);
		expect((await run(null, 'tag=AST-0001')).status).toBe(303);
	});
});
