import { describe, expect, it } from 'vitest';
import { BOM, csvCell, parseCsvSeparator, timeEntriesCsv, CSV_COLUMNS } from './csv';
import type { ReportRow } from './report';

const row: ReportRow = {
	id: 'e1',
	workDate: '2026-10-24',
	personId: 'p1',
	personName: 'Tom Technician',
	typeId: 't1',
	typeName: 'General',
	minutes: 90,
	revision: 1,
	note: 'Swapped the toner',
	record: { kind: 'task', id: 'r1', tag: 'TSK-0001', title: 'Pack the boxes' },
	project: { tag: 'PRJ-0001', name: 'Office move' }
};

describe('csvCell', () => {
	it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1'])(
		'neutralises a cell that would run as a formula: %j',
		(value) => {
			expect(csvCell(value).replace(/^"/, '')).toMatch(/^'/);
		}
	);

	it('leaves ordinary text alone', () => {
		expect(csvCell('Replace the printer')).toBe('Replace the printer');
		expect(csvCell('a=b')).toBe('a=b');
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
	});

	it('quotes commas, quotes and line breaks', () => {
		expect(csvCell('a, b')).toBe('"a, b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
	});

	it('quotes the active separator, not the other one', () => {
		expect(csvCell('a; b', ';')).toBe('"a; b"');
		expect(csvCell('a, b', ';')).toBe('a, b');
		expect(csvCell('a; b')).toBe('a; b');
	});

	it('escapes first and quotes after, so a formula with a comma stays inert', () => {
		expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
	});
});

describe('parseCsvSeparator', () => {
	it('selects the semicolon only for `semicolon`; everything else keeps the comma', () => {
		expect(parseCsvSeparator('semicolon')).toBe(';');
		expect(parseCsvSeparator(null)).toBe(',');
		expect(parseCsvSeparator('foo')).toBe(',');
	});
});

describe('timeEntriesCsv', () => {
	it('starts with a UTF-8 byte-order mark so Excel reads the accents', () => {
		expect(timeEntriesCsv([row])[0]).toBe(BOM);
		expect(timeEntriesCsv([row], ';')[0]).toBe('\uFEFF');
		expect(timeEntriesCsv([])[0]).toBe('\uFEFF');
	});

	it('uses the semicolon as separator for the Excel variant', () => {
		const [header, line] = timeEntriesCsv([row], ';').slice(BOM.length).split('\r\n');

		expect(header).toBe(CSV_COLUMNS.join(';'));
		expect(line).toBe(
			'2026-10-24;Tom Technician;General;90;1.50;TSK-0001;Pack the boxes;PRJ-0001;Office move;Swapped the toner'
		);
	});

	it('quotes only cells that contain the active separator', () => {
		const noted: ReportRow = { ...row, note: 'toner; paper, ink' };

		expect(timeEntriesCsv([noted], ';').split('\r\n')[1]).toMatch(/;"toner; paper, ink"$/);
		expect(timeEntriesCsv([noted]).split('\r\n')[1]).toMatch(/,"toner; paper, ink"$/);
		expect(timeEntriesCsv([{ ...row, note: 'a; b' }]).split('\r\n')[1]).toMatch(/,a; b$/);
		expect(timeEntriesCsv([{ ...row, note: 'a, b' }], ';').split('\r\n')[1]).toMatch(/;a, b$/);
	});

	it('still escapes formulas with the semicolon separator', () => {
		const ticket: ReportRow = { ...row, project: null, note: '@evil' };

		expect(timeEntriesCsv([ticket], ';').split('\r\n')[1]).toMatch(/;'@evil$/);
	});

	it('writes a header and one row per entry with minutes and two-place hours', () => {
		const [header, line, end] = timeEntriesCsv([row]).slice(BOM.length).split('\r\n');

		expect(header).toBe(CSV_COLUMNS.join(','));
		expect(line).toBe(
			'2026-10-24,Tom Technician,General,90,1.50,TSK-0001,Pack the boxes,PRJ-0001,Office move,Swapped the toner'
		);
		expect(end).toBe('');
	});

	it('leaves the project empty for a ticket and escapes a hostile note and title', () => {
		const ticket: ReportRow = {
			...row,
			record: { kind: 'ticket', id: 'r2', tag: 'TCK-0001', title: '=cmd|calc' },
			project: null,
			note: '@evil'
		};

		expect(timeEntriesCsv([ticket]).split('\r\n')[1]).toBe(
			"2026-10-24,Tom Technician,General,90,1.50,TCK-0001,'=cmd|calc,,,'@evil"
		);
	});

	it('is just the header when there is nothing to export', () => {
		expect(timeEntriesCsv([])).toBe(`\uFEFF${CSV_COLUMNS.join(',')}\r\n`);
	});
});
