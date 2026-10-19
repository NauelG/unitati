import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { matchKey, normaliseHeader, resolveValue, suggestMapping } from './mapping';
import { ASSET_FIELDS } from './assets';
import { PEOPLE_FIELDS } from './people';

const fixture = (name: string) => {
	const outcome = parseCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
	if (!outcome.ok) throw new Error(`fixture ${name} does not parse`);
	return outcome.value;
};

describe('normaliseHeader', () => {
	it('lowercases, strips accents, turns _ and - into spaces and collapses whitespace', () => {
		expect(normaliseHeader('  Correo_Electrónico ')).toBe('correo electronico');
		expect(normaliseHeader('E-mail')).toBe('e mail');
		expect(normaliseHeader('First   NAME')).toBe('first name');
	});
});

describe('matchKey', () => {
	it('ignores case, accents and spacing', () => {
		expect(matchKey('  Ingeniería   de  Software ')).toBe('ingenieria de software');
	});
});

describe('suggestMapping', () => {
	it('maps the Unitati template without a manual change', () => {
		const { headers } = fixture('unitati-people.csv');
		expect(suggestMapping(PEOPLE_FIELDS, headers)).toEqual({
			fullName: { column: 'Nombre completo' },
			firstName: null,
			lastName: null,
			email: { column: 'Correo electrónico' },
			department: { column: 'Departamento' },
			location: { column: 'Ubicación' }
		});
	});

	it('maps a Snipe-IT users export with English headers', () => {
		const { headers } = fixture('snipe-it-users.csv');
		expect(suggestMapping(PEOPLE_FIELDS, headers)).toEqual({
			fullName: null,
			firstName: { column: 'First Name' },
			lastName: { column: 'Last Name' },
			email: { column: 'Email' },
			department: { column: 'Department' },
			location: { column: 'Location' }
		});
	});

	it('maps the same export with Spanish headers; "Nombre" goes to fullName by order', () => {
		const { headers } = fixture('snipe-it-users.es.csv');
		expect(suggestMapping(PEOPLE_FIELDS, headers)).toEqual({
			fullName: { column: 'Nombre' },
			firstName: null,
			lastName: { column: 'Apellidos' },
			email: { column: 'Correo electrónico' },
			department: { column: 'Departamento' },
			location: { column: 'Ubicación' }
		});
	});

	it('never gives one header to two fields', () => {
		const mapping = suggestMapping(
			[
				{ key: 'a', label: () => 'a', required: false, aliases: ['x'] },
				{ key: 'b', label: () => 'b', required: false, aliases: ['x'] }
			],
			['X']
		);
		expect(mapping).toEqual({ a: { column: 'X' }, b: null });
	});
});

describe('resolveValue', () => {
	const index = new Map([['A', 0]]);
	it('reads a column, a fixed value, and nothing', () => {
		expect(resolveValue({ column: 'A' }, [' x '], index)).toBe('x');
		expect(resolveValue({ column: 'A' }, [], index)).toBe('');
		expect(resolveValue({ fixed: ' IT ' }, [], index)).toBe('IT');
		expect(resolveValue(null, ['x'], index)).toBe('');
	});
});

describe('suggestMapping for assets', () => {
	it('maps the Unitati template without a manual change', () => {
		const { headers } = fixture('unitati-assets.csv');
		expect(suggestMapping(ASSET_FIELDS, headers)).toEqual({
			assetTag: { column: 'Etiqueta' },
			name: { column: 'Nombre' },
			serial: { column: 'Número de serie' },
			model: { column: 'Modelo' },
			manufacturer: { column: 'Fabricante' },
			category: { column: 'Categoría' },
			state: { column: 'Estado' },
			custodianEmail: { column: 'Correo del custodio' },
			custodianName: null,
			location: { column: 'Ubicación' },
			shared: { column: 'Compartido' },
			notes: { column: 'Notas' }
		});
	});

	it('maps a Snipe-IT custom asset report with English headers', () => {
		const { headers } = fixture('snipe-it-assets.csv');
		expect(suggestMapping(ASSET_FIELDS, headers)).toEqual({
			assetTag: { column: 'Asset Tag' },
			name: { column: 'Asset Name' },
			serial: { column: 'Serial Number' },
			model: { column: 'Asset Model' },
			manufacturer: { column: 'Manufacturer' },
			category: { column: 'Category' },
			state: { column: 'Status' },
			custodianEmail: { column: 'Email' },
			custodianName: { column: 'Checked Out To' },
			// "Default Location" stays unassigned.
			location: { column: 'Location' },
			shared: null,
			notes: { column: 'Notes' }
		});
	});

	it('maps the same report with Spanish headers', () => {
		const { headers } = fixture('snipe-it-assets.es.csv');
		expect(suggestMapping(ASSET_FIELDS, headers)).toEqual({
			assetTag: { column: 'Placa del activo' },
			name: { column: 'Activo Nombre' },
			serial: { column: 'Número de serie' },
			model: { column: 'Modelo' },
			manufacturer: { column: 'Fabricante' },
			category: { column: 'Categoría' },
			state: { column: 'Estado' },
			custodianEmail: { column: 'Email' },
			custodianName: { column: 'Asignado a' },
			location: { column: 'Ubicación' },
			shared: null,
			notes: { column: 'Notas' }
		});
	});

	it('maps a Shelf import-ready export; manufacturer and model are left to fixed values', () => {
		const { headers } = fixture('shelf-assets.csv');
		expect(suggestMapping(ASSET_FIELDS, headers)).toEqual({
			assetTag: null,
			name: { column: 'title' },
			serial: null,
			model: null,
			manufacturer: null,
			category: { column: 'category' },
			state: null,
			custodianEmail: null,
			custodianName: { column: 'custodian' },
			location: { column: 'location' },
			shared: null,
			notes: null
		});
	});
});
