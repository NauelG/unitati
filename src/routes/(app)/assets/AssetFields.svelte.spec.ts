import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssetFields from './AssetFields.svelte';

const NOTE = 'Si ya has impreso la etiqueta de este activo, tendrás que reimprimirla.';

function draw(assetTag: string, storedTag?: string) {
	return render(AssetFields, {
		values: { name: 'Laptop', assetTag, serial: null, assetModelId: '' },
		errors: {},
		modelOptions: [],
		storedTag
	} as never);
}

describe('AssetFields reprint note', () => {
	it('stays quiet while the tag is the stored one', () => {
		draw('AST-0001', 'AST-0001');
		expect(screen.queryByText(NOTE)).toBeNull();
	});

	it('appears once the tag differs from the stored one', () => {
		draw('AST-0099', 'AST-0001');
		expect(screen.getByText(NOTE)).toBeTruthy();
	});

	it('never appears when registering (no stored tag)', () => {
		draw('AST-0099');
		expect(screen.queryByText(NOTE)).toBeNull();
	});
});
