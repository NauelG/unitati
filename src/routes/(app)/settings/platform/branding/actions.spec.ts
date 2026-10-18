import { beforeEach, describe, expect, it, vi } from 'vitest';

const setBrandAsset = vi.fn();
const removeBrandAsset = vi.fn();
vi.mock('#lib/server/directory/index.js', () => ({
	getBrand: vi.fn(),
	updateBranding: vi.fn(),
	setBrandAsset,
	removeBrandAsset
}));

const { actions } = await import('./+page.server');

const admin = { id: 'u1', name: 'A', email: 'a@x.test', role: 'admin', organisationId: 'org-1' };
const technician = { ...admin, role: 'technician' };

function post(
	action: 'uploadAsset' | 'removeAsset',
	fields: Record<string, string | File>,
	user: object | null = admin
) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return actions[action]({
		locals: { user },
		request: new Request('http://localhost/settings/platform/branding', { method: 'POST', body })
	} as unknown as Parameters<(typeof actions)['uploadAsset']>[0]);
}

const png = () => new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });

beforeEach(() => {
	setBrandAsset.mockReset();
	removeBrandAsset.mockReset();
	setBrandAsset.mockResolvedValue({ ok: true, value: {} });
	removeBrandAsset.mockResolvedValue({ ok: true, value: {} });
});

describe('?/uploadAsset', () => {
	it('stores the bytes in the named slot', async () => {
		const result = await post('uploadAsset', { slot: 'lockup_dark', file: png() });

		expect(result).toMatchObject({ uploaded: 'lockup_dark' });
		expect(setBrandAsset).toHaveBeenCalledWith(admin, 'lockup_dark', new Uint8Array([1, 2, 3]));
	});

	it.each(['hacker', 'favicon', 'apple_touch', ''])(
		'is a 400 for the slot %j, writing nothing',
		async (slot) => {
			const result = await post('uploadAsset', { slot, file: png() });

			expect(result).toMatchObject({ status: 400 });
			expect(setBrandAsset).not.toHaveBeenCalled();
		}
	);

	it('is a 400 when no file was chosen', async () => {
		const result = await post('uploadAsset', { slot: 'mark' });

		expect(result).toMatchObject({ status: 400 });
		expect(setBrandAsset).not.toHaveBeenCalled();
	});

	it('is a 403 for a technician, writing nothing', async () => {
		await expect(
			post('uploadAsset', { slot: 'mark', file: png() }, technician)
		).rejects.toMatchObject({
			status: 403
		});
		expect(setBrandAsset).not.toHaveBeenCalled();
	});

	it('answers a refused image with a Spanish message for its code', async () => {
		setBrandAsset.mockResolvedValue({ ok: false, error: 'unsupported-type' });

		const result = await post('uploadAsset', { slot: 'mark', file: png() });

		expect(result).toMatchObject({
			status: 400,
			data: {
				assetError: { slot: 'mark', message: 'Formato no admitido. Usa SVG, PNG, WebP o JPEG.' }
			}
		});
	});
});

describe('?/removeAsset', () => {
	it('removes the named slot', async () => {
		const result = await post('removeAsset', { slot: 'mark' });

		expect(result).toMatchObject({ removed: 'mark' });
		expect(removeBrandAsset).toHaveBeenCalledWith(admin, 'mark');
	});

	it('is a 400 for an unknown slot, removing nothing', async () => {
		const result = await post('removeAsset', { slot: 'favicon' });

		expect(result).toMatchObject({ status: 400 });
		expect(removeBrandAsset).not.toHaveBeenCalled();
	});

	it('is a 403 for a technician', async () => {
		await expect(post('removeAsset', { slot: 'mark' }, technician)).rejects.toMatchObject({
			status: 403
		});
	});
});
