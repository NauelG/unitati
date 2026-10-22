import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPACE_DESCRIPTION_MAX, SPACE_ICONS, SPACE_NAME_MAX } from '#lib/domain/knowledge.js';
import { spaceInput, spaceUpdateInput } from './validation';

const valid = {
	name: ' Ayuda ',
	description: '  ',
	icon: 'life-buoy',
	colour: 'teal',
	audience: 'portal'
};

describe('spaceInput', () => {
	it('trims the name and turns a blank description into null', () => {
		expect(spaceInput.parse(valid)).toEqual({ ...valid, name: 'Ayuda', description: null });
	});

	it('refuses an icon or a colour outside the closed sets', () => {
		expect(spaceInput.safeParse({ ...valid, icon: 'skull' }).success).toBe(false);
		expect(spaceInput.safeParse({ ...valid, colour: '#ff00ff' }).success).toBe(false);
		for (const icon of SPACE_ICONS) {
			expect(spaceInput.safeParse({ ...valid, icon }).success).toBe(true);
		}
	});

	it('bounds the name and the description', () => {
		expect(spaceInput.safeParse({ ...valid, name: 'a'.repeat(SPACE_NAME_MAX) }).success).toBe(true);
		expect(spaceInput.safeParse({ ...valid, name: 'a'.repeat(SPACE_NAME_MAX + 1) }).success).toBe(
			false
		);
		expect(spaceInput.safeParse({ ...valid, name: '  ' }).success).toBe(false);
		expect(
			spaceInput.safeParse({ ...valid, description: 'a'.repeat(SPACE_DESCRIPTION_MAX) }).success
		).toBe(true);
		expect(
			spaceInput.safeParse({ ...valid, description: 'a'.repeat(SPACE_DESCRIPTION_MAX + 1) }).success
		).toBe(false);
	});

	it('refuses an unknown audience', () => {
		expect(spaceInput.safeParse({ ...valid, audience: 'everyone' }).success).toBe(false);
	});
});

describe('spaceUpdateInput', () => {
	it('carries no audience: changing it has its own confirmed path', () => {
		expect(spaceUpdateInput.parse(valid)).not.toHaveProperty('audience');
	});
});

describe('page_tag', () => {
	/**
	 * The code is the canonical link (`/knowledge/DOC-0042`), so nothing may write
	 * it after the insert (ADR 0031). A structural guard rather than a type test:
	 * no non-test source in the domain may name the column in a `.set(...)`.
	 */
	it('has no update path in the domain', () => {
		const sources = readdirSync(import.meta.dirname).filter(
			(file) => file.endsWith('.ts') && !file.includes('.spec.')
		);
		for (const file of sources) {
			const text = readFileSync(join(import.meta.dirname, file), 'utf8');
			const sets = text.match(/\.set\(\s*\{[^}]*\}/gs) ?? [];
			for (const set of sets) {
				expect(set, `${file} sets the page tag`).not.toMatch(/pageTag/);
			}
			expect(text, `${file} writes page_tag by hand`).not.toMatch(/set\s+"?page_tag"?\s*=/i);
		}
	});
});
