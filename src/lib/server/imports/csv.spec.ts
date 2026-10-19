import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '#lib/domain/imports.js';
import { parseCsv } from './csv';

const utf8 = (text: string) => new TextEncoder().encode(text);

function parsed(bytes: Uint8Array) {
	const outcome = parseCsv(bytes);
	if (!outcome.ok) throw new Error(`expected a parse, got ${JSON.stringify(outcome.error)}`);
	return outcome.value;
}

const failed = (bytes: Uint8Array) => {
	const outcome = parseCsv(bytes);
	if (outcome.ok) throw new Error('expected a failure');
	return outcome.error;
};

describe('parseCsv', () => {
	it('reads headers and rows, and drops a leading BOM', () => {
		const bytes = new Uint8Array([
			0xef,
			0xbb,
			0xbf,
			...utf8('Nombre,Correo\nAda,ada@example.com\n')
		]);
		expect(parsed(bytes)).toEqual({
			headers: ['Nombre', 'Correo'],
			rows: [['Ada', 'ada@example.com']]
		});
	});

	it('falls back to Windows-1252 when the bytes are not UTF-8', () => {
		// "Ubicación,Nombre\nPeña,Ada" with í = 0xED and ñ = 0xF1
		const bytes = Uint8Array.from(
			[...'Ubicaci\u00f3n,Nombre\nPe\u00f1a,Ada'].map((char) => char.charCodeAt(0))
		);
		expect(parsed(bytes)).toEqual({ headers: ['Ubicación', 'Nombre'], rows: [['Peña', 'Ada']] });
	});

	it('detects a semicolon delimiter on the first line', () => {
		expect(parsed(utf8('a;b;c\n1;2;3\n'))).toEqual({
			headers: ['a', 'b', 'c'],
			rows: [['1', '2', '3']]
		});
	});

	it('ignores delimiters inside quotes when detecting', () => {
		expect(parsed(utf8('"a;b;c",d\n1,2\n')).headers).toEqual(['a;b;c', 'd']);
	});

	it('reads a quoted field with a newline and an escaped quote', () => {
		const { rows } = parsed(utf8('name,notes\nAda,"line one\nline ""two"""\n'));
		expect(rows).toEqual([['Ada', 'line one\nline "two"']]);
	});

	it('trims cells and skips empty lines', () => {
		expect(parsed(utf8('a,b\n\n  x , y \n')).rows).toEqual([['x', 'y']]);
	});

	it('refuses an empty file and a whitespace-only one', () => {
		expect(failed(new Uint8Array())).toBe('empty');
		expect(failed(utf8(' \n\n  '))).toBe('empty');
	});

	it('refuses a header with no rows', () => {
		expect(failed(utf8('a,b\n'))).toBe('no_rows');
	});

	it('refuses a file whose header row is blank', () => {
		expect(failed(utf8(',,\n1,2,3\n'))).toBe('no_header');
	});

	it('refuses duplicate headers after normalisation', () => {
		expect(failed(utf8('E-mail,e mail\n1,2\n'))).toBe('duplicate_header');
		expect(failed(utf8('Correo,CORREO\n1,2\n'))).toBe('duplicate_header');
	});

	it('accepts 5,000 rows and refuses 5,001', () => {
		const body = (n: number) => 'a\n' + Array.from({ length: n }, (_, i) => `r${i}`).join('\n');
		expect(parsed(utf8(body(IMPORT_MAX_ROWS))).rows).toHaveLength(IMPORT_MAX_ROWS);
		expect(failed(utf8(body(IMPORT_MAX_ROWS + 1)))).toBe('too_many_rows');
	});

	it('refuses 5 MB + 1 byte before decoding, and accepts exactly 5 MB', () => {
		expect(failed(new Uint8Array(IMPORT_MAX_BYTES + 1))).toBe('too_large');
		const header = utf8('a\n');
		const exactly = new Uint8Array(IMPORT_MAX_BYTES).fill(0x20);
		exactly.set(header);
		exactly.set(utf8('x'), header.length);
		expect(parsed(exactly).headers).toEqual(['a']);
	});

	it('reports an unparseable file with its line', () => {
		expect(failed(utf8('a,b\n"unterminated,2\n'))).toEqual({ kind: 'unparseable', line: 2 });
	});
});
