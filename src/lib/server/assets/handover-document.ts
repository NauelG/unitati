import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { marked, type Token, type Tokens } from 'marked';
import PDFDocument from 'pdfkit';
import type { HandoverDirection } from './handover-template';

/**
 * The handover document (ADR 0036): a decided handover's frozen evidence,
 * rendered once into the PDF that HR, a lawyer or the employee hold on the day
 * of a dispute. Pure: everything it prints arrives in the input, nothing is
 * read from the database or the clock, so the same evidence always produces
 * the same file.
 *
 * Never call it to "refresh" a stored document. A layout change applies to the
 * handovers decided after it; an old document keeps its old look, which is what
 * makes it evidence.
 *
 * Its labels are Spanish, like the transactional mail; the agreement is in
 * whatever language the organisation wrote it.
 */

export interface HandoverDocumentAsset {
	assetTag: string;
	name: string;
	serial: string | null;
	model: string;
	/** Recorded by the technician on a return (#278); unused on a delivery. */
	condition?: string | null;
	notes?: string | null;
}

export interface HandoverDocumentInput {
	brand: {
		productName: string;
		organisationName: string;
		/** The organisation's lockup as PNG, or `null` to print the product name instead. */
		lockupPng: Uint8Array | null;
	};
	code: string;
	direction: HandoverDirection;
	status: 'accepted' | 'rejected';
	/** The literal rendered agreement, Markdown, exactly as it was signed. */
	body: string;
	bodySha256: string;
	assets: HandoverDocumentAsset[];
	/** The snapshots taken at issue time, not the person's current record. */
	person: { name: string; email: string };
	/** The person's reason, for a rejection. */
	reason: string | null;
	signaturePng: Uint8Array | null;
	decidedAt: Date;
	/** IANA zone the decision time is written in, beside UTC. */
	timeZone: string;
	signerIp: string | null;
	signerUserAgent: string | null;
	/** Who issued it: a technician, or a service account through the API. `null` if unrecorded. */
	issuedBy: { kind: 'person' | 'service_account'; name: string; email: string | null } | null;
	issuedAt: Date;
}

/**
 * Noto Sans covers Latin-1 and Latin Extended A and B in full, so a Catalan
 * `l·l`, a Polish `ł` or a Czech `ř` print from the embedded font and never
 * depend on the reader's. It comes from a pinned package rather than the
 * repository so it ships beside the server bundle in `node_modules`.
 *
 * One file, one weight: emphasis is drawn by stroking the glyph outlines
 * (`strong`) and slanting them (`em`), which keeps the text layer intact.
 */
const FONT_PATH = '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf';
let font: Buffer | undefined;

function documentFont(): Buffer {
	return (font ??= readFileSync(createRequire(import.meta.url).resolve(FONT_PATH)));
}

const INK = '#111111';
const MUTED = '#5b5b5b';
const RULE = '#c9c9c9';
const MARGIN = 56;
const FOOTER_HEIGHT = 34;
/** Stroke width of the drawn bold. */
const BOLD = 0.35;

const TITLES: Record<HandoverDirection, string> = {
	delivery: 'Acta de entrega de equipos',
	return: 'Acta de devolución de equipos'
};

const OUTCOMES: Record<HandoverDocumentInput['status'], string> = {
	accepted: 'Aceptada',
	rejected: 'Rechazada'
};

export function renderHandoverDocument(input: HandoverDocumentInput): Promise<Uint8Array> {
	const doc = new PDFDocument({
		size: 'A4',
		margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + FOOTER_HEIGHT },
		// Disable PDFKit's Helvetica default; register our embedded font before any text.
		font: '',
		bufferPages: true,
		lang: 'es',
		displayTitle: true,
		info: {
			Title: `${input.code} · ${TITLES[input.direction]}`,
			Author: input.brand.organisationName,
			Subject: `${TITLES[input.direction]}: ${input.person.name}`,
			Creator: input.brand.productName,
			Producer: input.brand.productName,
			// The decision time, not the render time: the file is about that moment.
			CreationDate: input.decidedAt,
			ModDate: input.decidedAt
		}
	});
	doc.font(documentFont());
	const done = collect(doc);
	const page = new Page(doc);

	header(page, input);
	parties(page, input);
	agreement(page, input);
	assetTable(page, input);
	decision(page, input);
	footers(doc, input);

	doc.end();
	return done;
}

/** The content box and the few drawing moves every section shares. */
class Page {
	readonly left = MARGIN;
	readonly width: number;
	readonly doc: PDFKit.PDFDocument;

	constructor(doc: PDFKit.PDFDocument) {
		this.doc = doc;
		this.width = doc.page.width - MARGIN * 2;
	}

	get bottom(): number {
		return this.doc.page.height - this.doc.page.margins.bottom;
	}

	/** Starts a new page when fewer than `height` points remain. */
	ensure(height: number): void {
		if (this.doc.y + height > this.bottom) this.doc.addPage();
	}

	rule(color = RULE): void {
		const { doc } = this;
		doc
			.save()
			.lineWidth(0.6)
			.strokeColor(color)
			.moveTo(this.left, doc.y)
			.lineTo(this.left + this.width, doc.y)
			.stroke()
			.restore();
	}

	heading(text: string): void {
		const { doc } = this;
		this.ensure(60);
		doc.moveDown(1.1);
		doc.x = this.left;
		doc.fontSize(8.5).fillColor(MUTED).text(text.toUpperCase(), { characterSpacing: 0.8 });
		doc.moveDown(0.25);
		this.rule();
		doc.moveDown(0.5);
		doc.fillColor(INK);
	}

	/** A label and its value on one line, the value wrapping under itself. */
	field(label: string, value: string): void {
		const { doc } = this;
		const labelWidth = 150;
		doc.fontSize(10);
		const valueHeight = doc.heightOfString(value, { width: this.width - labelWidth });
		this.ensure(valueHeight + 4);
		const y = doc.y;
		doc.fillColor(MUTED).text(label, this.left, y, { width: labelWidth - 8 });
		doc.fillColor(INK).text(value, this.left + labelWidth, y, { width: this.width - labelWidth });
		doc.x = this.left;
		doc.moveDown(0.3);
	}
}

function header(page: Page, input: HandoverDocumentInput): void {
	const { doc } = page;
	const top = doc.y;

	if (input.brand.lockupPng) {
		doc.image(Buffer.from(input.brand.lockupPng), page.left, top, { fit: [170, 34] });
	} else {
		doc
			.fontSize(15)
			.fillColor(INK)
			.text(input.brand.productName, page.left, top + 6, {
				width: page.width / 2
			});
	}
	doc
		.fontSize(9)
		.fillColor(MUTED)
		.text(input.brand.organisationName, page.left + page.width / 2, top + 4, {
			width: page.width / 2,
			align: 'right'
		})
		.text(input.code, { width: page.width / 2, align: 'right' });

	doc.y = top + 46;
	doc.x = page.left;
	page.rule(INK);
	doc.moveDown(1.2);

	doc.fontSize(20).fillColor(INK).text(TITLES[input.direction], page.left);
	doc.moveDown(0.15);
	doc
		.fontSize(11)
		.fillColor(MUTED)
		.text(
			`${input.code} · ${OUTCOMES[input.status]} el ${localTime(input.decidedAt, input.timeZone)}`
		);
	doc.fillColor(INK);
}

function parties(page: Page, input: HandoverDocumentInput): void {
	page.heading('Partes');
	page.field('Organización', input.brand.organisationName);
	page.field('Persona', input.person.name);
	page.field('Correo electrónico', input.person.email);
	page.field('Emitida por', issuer(input.issuedBy));
	page.field(
		'Emitida el',
		`${localTime(input.issuedAt, input.timeZone)} · ${utcTime(input.issuedAt)}`
	);
}

function issuer(issuedBy: HandoverDocumentInput['issuedBy']): string {
	if (!issuedBy) return 'Sin registrar';
	if (issuedBy.kind === 'service_account') return `${issuedBy.name} (cuenta de servicio)`;
	return issuedBy.email ? `${issuedBy.name} <${issuedBy.email}>` : issuedBy.name;
}

function agreement(page: Page, input: HandoverDocumentInput): void {
	const { doc } = page;
	page.heading('Texto del acuerdo');
	doc.fontSize(10.5).fillColor(INK).lineWidth(BOLD);
	markdown(page, input.body);

	doc.moveDown(0.6);
	doc.x = page.left;
	page.ensure(40);
	doc
		.fontSize(8.5)
		.fillColor(MUTED)
		.text('Huella SHA-256 del texto, tal como se mostró y se firmó:', page.left, doc.y, {
			width: page.width
		})
		.fillColor(INK)
		.text(input.bodySha256, { width: page.width, characterSpacing: 0.2 });
}

interface Run {
	text: string;
	bold: boolean;
	italic: boolean;
}

/**
 * The Markdown the signer read, laid out as prose. Only what an agreement uses
 * is styled (paragraphs, headings, lists, quotes, emphasis); anything else
 * prints as its text, so no word that was signed is ever dropped.
 */
function markdown(page: Page, source: string): void {
	const blocks = marked.lexer(source);
	for (const block of blocks) renderBlock(page, block, 0);
}

function renderBlock(page: Page, token: Token, indent: number): void {
	const { doc } = page;
	switch (token.type) {
		case 'space':
			return;
		case 'heading': {
			const size = Math.max(11, 16 - (token as Tokens.Heading).depth * 1.5);
			doc.moveDown(0.4);
			runs(page, inline((token as Tokens.Heading).tokens, { bold: true, italic: false }), {
				indent,
				size
			});
			doc.moveDown(0.3);
			return;
		}
		case 'paragraph':
		case 'text': {
			const children = (token as Tokens.Paragraph).tokens ?? [];
			runs(page, children.length ? inline(children) : plain((token as Tokens.Text).text), {
				indent
			});
			if (token.type === 'paragraph') doc.moveDown(0.5);
			return;
		}
		case 'list': {
			const list = token as Tokens.List;
			const start = typeof list.start === 'number' ? list.start : 1;
			list.items.forEach((item, index) => {
				const marker = list.ordered ? `${start + index}.` : '•';
				listItem(page, item, marker, indent);
			});
			doc.moveDown(0.4);
			return;
		}
		case 'blockquote': {
			for (const child of (token as Tokens.Blockquote).tokens)
				renderBlock(page, child, indent + 14);
			return;
		}
		case 'hr':
			doc.moveDown(0.3);
			page.rule();
			doc.moveDown(0.6);
			return;
		default: {
			// Code, tables, HTML: their source is what was shown, so print it as written.
			const raw = 'text' in token && typeof token.text === 'string' ? token.text : token.raw;
			runs(page, plain(raw), { indent });
			doc.moveDown(0.5);
		}
	}
}

function listItem(page: Page, item: Tokens.ListItem, marker: string, indent: number): void {
	const { doc } = page;
	const size = 10.5;
	doc.fontSize(size);
	page.ensure(doc.currentLineHeight(true));
	const y = doc.y;
	doc.fillColor(INK).text(marker, page.left + indent, y, { width: 16, lineBreak: false });
	doc.y = y;
	for (const child of item.tokens) renderBlock(page, child, indent + 18);
	doc.moveDown(0.15);
}

function runs(page: Page, list: Run[], options: { indent: number; size?: number }): void {
	const { doc } = page;
	const size = options.size ?? 10.5;
	const width = page.width - options.indent;
	const x = page.left + options.indent;
	doc.fontSize(size).fillColor(INK);
	if (list.length === 0) return;

	page.ensure(doc.currentLineHeight(true));
	const y = doc.y;
	list.forEach((run, index) => {
		const continued = index < list.length - 1;
		const style = {
			continued,
			width,
			fill: true,
			stroke: run.bold,
			oblique: run.italic ? 10 : false
		};
		if (index === 0) doc.text(run.text, x, y, style);
		else doc.text(run.text, style);
	});
	doc.x = page.left;
}

function inline(tokens: Token[], style = { bold: false, italic: false }): Run[] {
	const out: Run[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case 'strong':
				out.push(...inline((token as Tokens.Strong).tokens, { ...style, bold: true }));
				break;
			case 'em':
				out.push(...inline((token as Tokens.Em).tokens, { ...style, italic: true }));
				break;
			case 'del':
				out.push(...inline((token as Tokens.Del).tokens, style));
				break;
			case 'link': {
				const link = token as Tokens.Link;
				out.push(...inline(link.tokens, style));
				if (link.href !== link.text) out.push({ text: ` (${link.href})`, ...style });
				break;
			}
			case 'br':
				out.push({ text: '\n', ...style });
				break;
			case 'image':
				out.push({ text: (token as Tokens.Image).text, ...style });
				break;
			case 'text': {
				const text = token as Tokens.Text;
				if (text.tokens?.length) out.push(...inline(text.tokens, style));
				else out.push({ text: decodeEntities(text.text), ...style });
				break;
			}
			default:
				out.push({
					text: decodeEntities('text' in token ? String(token.text) : token.raw),
					...style
				});
		}
	}
	return out.filter((run) => run.text.length > 0);
}

function plain(text: string): Run[] {
	return [{ text, bold: false, italic: false }];
}

/** The signing page shows `&amp;` as `&`; so must the document. */
function decodeEntities(text: string): string {
	const named: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: '\u00a0'
	};
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
		if (body[0] === '#') {
			const code =
				body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: entity;
		}
		return named[body.toLowerCase()] ?? entity;
	});
}

interface Column {
	title: string;
	width: number;
	value: (asset: HandoverDocumentAsset) => string;
}

function columnsFor(direction: HandoverDirection, width: number): Column[] {
	const dash = (value: string | null | undefined) => value?.trim() || '—';
	const base: Omit<Column, 'width'>[] = [
		{ title: 'Etiqueta', value: (a) => a.assetTag },
		{ title: 'Nombre', value: (a) => a.name },
		{ title: 'N.º de serie', value: (a) => dash(a.serial) },
		{ title: 'Modelo', value: (a) => a.model }
	];
	const shares =
		direction === 'return'
			? ([
					base.concat([
						{ title: 'Estado', value: (a) => dash(a.condition) },
						{ title: 'Notas', value: (a) => dash(a.notes) }
					]),
					[0.13, 0.19, 0.16, 0.17, 0.14, 0.21]
				] as const)
			: ([base, [0.16, 0.3, 0.22, 0.32]] as const);
	const [columns, ratios] = shares;
	return columns.map((column, index) => ({ ...column, width: width * ratios[index] }));
}

function assetTable(page: Page, input: HandoverDocumentInput): void {
	const { doc } = page;
	page.heading(`Equipos (${input.assets.length})`);
	const columns = columnsFor(input.direction, page.width);
	const padding = 4;

	const row = (cells: string[], options: { color: string; size: number }) => {
		doc.fontSize(options.size);
		const heights = cells.map((cell, index) =>
			doc.heightOfString(cell, { width: columns[index].width - padding * 2 })
		);
		const height = Math.max(...heights) + padding * 2;
		return {
			height,
			draw(y: number) {
				let x = page.left;
				cells.forEach((cell, index) => {
					doc
						.fontSize(options.size)
						.fillColor(options.color)
						.text(cell, x + padding, y + padding, { width: columns[index].width - padding * 2 });
					x += columns[index].width;
				});
				doc.y = y + height;
				doc.x = page.left;
				page.rule();
			}
		};
	};

	const head = row(
		columns.map((column) => column.title),
		{ color: MUTED, size: 8.5 }
	);
	page.ensure(head.height + 24);
	head.draw(doc.y);

	for (const asset of input.assets) {
		const body = row(
			columns.map((column) => column.value(asset)),
			{ color: INK, size: 9.5 }
		);
		if (doc.y + body.height > page.bottom) {
			doc.addPage();
			head.draw(doc.y);
		}
		body.draw(doc.y);
	}
	doc.fillColor(INK);
}

function decision(page: Page, input: HandoverDocumentInput): void {
	const { doc } = page;
	page.heading('Decisión');
	page.field('Decisión', OUTCOMES[input.status]);
	if (input.reason) page.field('Motivo', input.reason);
	page.field('Fecha y hora', localTime(input.decidedAt, input.timeZone));
	page.field('Fecha y hora (UTC)', utcTime(input.decidedAt));
	page.field('Dirección IP', input.signerIp ?? 'No registrada');
	page.field('Navegador (user agent)', input.signerUserAgent ?? 'No registrado');

	if (input.signaturePng) {
		const box = { width: 220, height: 90 };
		page.ensure(box.height + 40);
		doc.moveDown(0.4);
		doc.fontSize(10).fillColor(MUTED).text('Firma', page.left);
		doc.moveDown(0.2);
		const y = doc.y;
		doc
			.save()
			.lineWidth(0.6)
			.strokeColor(RULE)
			.rect(page.left, y, box.width, box.height)
			.stroke()
			.restore();
		doc.image(Buffer.from(input.signaturePng), page.left + 6, y + 6, {
			fit: [box.width - 12, box.height - 12],
			align: 'center',
			valign: 'center'
		});
		doc.y = y + box.height + 6;
		doc
			.fontSize(8.5)
			.fillColor(MUTED)
			.text(
				`Firma manuscrita trazada por ${input.person.name} en su propio dispositivo, a través de un enlace personal de un solo uso.`,
				page.left,
				doc.y,
				{ width: page.width }
			);
	}
	doc.fillColor(INK);
}

/** Written last, once the page count is known, into the bottom margin of every page. */
function footers(doc: PDFKit.PDFDocument, input: HandoverDocumentInput): void {
	const range = doc.bufferedPageRange();
	for (let index = range.start; index < range.start + range.count; index++) {
		doc.switchToPage(index);
		const bottom = doc.page.margins.bottom;
		// Text below the bottom margin would otherwise start a new page.
		doc.page.margins.bottom = 0;
		const y = doc.page.height - MARGIN - 8;
		const width = doc.page.width - MARGIN * 2;
		doc
			.fontSize(7.5)
			.fillColor(MUTED)
			.text(
				`Copia generada al decidir la entrega. ${input.brand.productName} conserva su huella SHA-256 junto a ${input.code}.`,
				MARGIN,
				y,
				{ width: width * 0.75, lineBreak: false }
			)
			.text(`${input.code} · ${index + 1} / ${range.count}`, MARGIN + width * 0.75, y, {
				width: width * 0.25,
				align: 'right',
				lineBreak: false
			});
		doc.page.margins.bottom = bottom;
	}
}

function localTime(date: Date, timeZone: string): string {
	const formatted = new Intl.DateTimeFormat('es', {
		dateStyle: 'long',
		timeStyle: 'medium',
		timeZone
	}).format(date);
	const offset =
		new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' })
			.formatToParts(date)
			.find((part) => part.type === 'timeZoneName')?.value ?? '';
	return `${formatted} (${timeZone}, ${offset})`;
}

function utcTime(date: Date): string {
	return `${date
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d+Z$/, '')} UTC`;
}

function collect(doc: PDFKit.PDFDocument): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
		doc.on('error', reject);
	});
}
