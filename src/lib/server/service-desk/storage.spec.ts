import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStorage, LocalStorage, type Storage } from './storage';

const bytes = new TextEncoder().encode('screenshot');

function contract(
	name: string,
	create: () => Promise<{ storage: Storage; cleanup?: () => Promise<void> }>
) {
	describe(name, () => {
		let storage: Storage;
		let cleanup: (() => Promise<void>) | undefined;

		beforeEach(async () => {
			({ storage, cleanup } = await create());
		});
		afterEach(async () => cleanup?.());

		it('returns what was put', async () => {
			await storage.put('org/file', bytes);
			expect(await storage.get('org/file')).toEqual(bytes);
		});

		it('returns null for an unknown key', async () => {
			expect(await storage.get('org/missing')).toBeNull();
		});

		it('forgets a deleted key, and deleting twice is harmless', async () => {
			await storage.put('org/file', bytes);
			await storage.delete('org/file');
			await storage.delete('org/file');
			expect(await storage.get('org/file')).toBeNull();
		});
	});
}

contract('InMemoryStorage', async () => ({ storage: new InMemoryStorage() }));

contract('LocalStorage', async () => {
	const root = await mkdtemp(join(tmpdir(), 'unitati-uploads-'));
	return {
		storage: new LocalStorage(root),
		cleanup: () => rm(root, { recursive: true, force: true })
	};
});

describe('LocalStorage path safety', () => {
	it('refuses a key that climbs out of the uploads directory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'unitati-uploads-'));
		const storage = new LocalStorage(root);

		await expect(storage.put('../escape', bytes)).rejects.toThrow(/escapes/);
		await expect(storage.get('../../etc/passwd')).rejects.toThrow(/escapes/);

		await rm(root, { recursive: true, force: true });
	});
});
