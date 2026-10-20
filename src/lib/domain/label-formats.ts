/**
 * The three label formats (ADR 0038). Fixed on purpose: a template editor is
 * out of scope, and the formats are the ones sold as ordinary A4 label sheets
 * and a 62 × 29 mm roll. Pure and database-free so the print page, its preview
 * and the tests share one definition of "how many fit".
 */

export const LABEL_FORMAT_KEYS = ['a4-3x8', 'a4-4x10', 'roll-62x29'] as const;
export type LabelFormatKey = (typeof LABEL_FORMAT_KEYS)[number];

export const DEFAULT_LABEL_FORMAT: LabelFormatKey = 'a4-3x8';

/** The most labels one print job carries. */
export const MAX_LABELS = 500;

interface Mm {
	width: number;
	height: number;
}

export interface LabelFormat {
	/** `@page { size }`, in millimetres. */
	pageMm: Mm;
	columns: number;
	rows: number;
	cellMm: Mm;
	/** Blank band above and below the grid, for sheets that do not divide exactly. */
	marginTopMm: number;
	/** The QR's side, inside the cell's safe margin. */
	qrMm: number;
	/** The tag's size in points. */
	tagPt: number;
	/** Whether the asset name is printed (large format only). */
	showName: boolean;
	/** Whether the brand's mark sits beside "Propiedad de …" when the brand has one. */
	showMark: boolean;
	/** A sheet of cells with a start position, as opposed to one label per page. */
	sheet: boolean;
}

/** Inner margin of every cell: printers drift by a millimetre or two. */
export const CELL_PADDING_MM = 2;

export const LABEL_FORMATS: Record<LabelFormatKey, LabelFormat> = {
	'a4-3x8': {
		pageMm: { width: 210, height: 297 },
		columns: 3,
		rows: 8,
		cellMm: { width: 70, height: 37 },
		marginTopMm: 0.5,
		qrMm: 29,
		tagPt: 11,
		showName: true,
		showMark: true,
		sheet: true
	},
	'a4-4x10': {
		pageMm: { width: 210, height: 297 },
		columns: 4,
		rows: 10,
		cellMm: { width: 52.5, height: 29.7 },
		marginTopMm: 0,
		qrMm: 22,
		tagPt: 8,
		showName: false,
		showMark: false,
		sheet: true
	},
	'roll-62x29': {
		pageMm: { width: 62, height: 29 },
		columns: 1,
		rows: 1,
		cellMm: { width: 62, height: 29 },
		marginTopMm: 0,
		qrMm: 25,
		tagPt: 9,
		showName: false,
		showMark: true,
		sheet: false
	}
};

export function labelsPerSheet(key: LabelFormatKey): number {
	const { columns, rows } = LABEL_FORMATS[key];
	return columns * rows;
}

export function parseFormat(input: string | null): LabelFormatKey {
	return LABEL_FORMAT_KEYS.find((key) => key === input) ?? DEFAULT_LABEL_FORMAT;
}

/**
 * The 0-based number of cells to leave empty at the start of the first sheet.
 * Anything that is not an integer inside the sheet counts as "start at the top",
 * and the roll has no positions at all.
 */
export function parseSkip(input: string | null, key: LabelFormatKey): number {
	if (!LABEL_FORMATS[key].sheet || input === null || !/^\d+$/.test(input)) return 0;
	const skip = Number(input);
	return skip < labelsPerSheet(key) ? skip : 0;
}

/**
 * Distributes labels over pages. `null` is an empty cell, only ever at the start
 * of the first sheet. The last sheet is not padded: trailing empty cells draw
 * nothing.
 */
export function layoutSheets<T>(
	key: LabelFormatKey,
	labels: readonly T[],
	skip: number
): (T | null)[][] {
	const perSheet = labelsPerSheet(key);
	const cells: (T | null)[] = [
		...Array<null>(LABEL_FORMATS[key].sheet ? skip : 0).fill(null),
		...labels
	];

	const sheets: (T | null)[][] = [];
	for (let start = 0; start < cells.length; start += perSheet) {
		sheets.push(cells.slice(start, start + perSheet));
	}
	return sheets;
}
