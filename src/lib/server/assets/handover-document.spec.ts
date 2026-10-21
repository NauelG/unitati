import { createHash } from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { renderHandoverDocument, type HandoverDocumentInput } from './handover-document';
import { drawnSignature } from './testing/png';

/**
 * The certified copy of a decided handover (ADR 0036, #276). The text layer is
 * what a lawyer searches and copies from, so the specs read it back the way a
 * PDF reader would, never the drawing operators.
 */

async function textOf(bytes: Uint8Array): Promise<string> {
	const pdf = await getDocumentProxy(new Uint8Array(bytes));
	const { text } = await extractText(pdf, { mergePages: true });
	// A reader may break a line anywhere; what matters is the words, in order.
	return text.replace(/\s+/g, ' ');
}

const body = [
	'Yo, **Núria Puigdomènech**, confirmo que he recibido de **Acme** los equipos detallados a continuación.',
	'',
	'Me comprometo a:',
	'',
	'- Usarlos únicamente para fines profesionales.',
	'- Comunicar de inmediato cualquier pérdida.'
].join('\n');

function accepted(overrides: Partial<HandoverDocumentInput> = {}): HandoverDocumentInput {
	return {
		brand: { productName: 'Acme IT', organisationName: 'Acme', lockupPng: null },
		code: 'HND-0042',
		direction: 'delivery',
		status: 'accepted',
		body,
		bodySha256: createHash('sha256').update(body).digest('hex'),
		assets: [
			{ assetTag: 'AST-0001', name: 'Portàtil', serial: 'SN-1', model: 'MacBook Pró' },
			{ assetTag: 'AST-0002', name: 'Ratolí', serial: null, model: 'MX Master' }
		],
		person: { name: 'Núria Puigdomènech', email: 'nuria@acme.test' },
		reason: null,
		signaturePng: drawnSignature(),
		decidedAt: new Date('2026-10-20T10:00:00Z'),
		timeZone: 'Europe/Madrid',
		signerIp: '203.0.113.7',
		signerUserAgent: 'Mozilla/5.0 (iPhone)',
		issuedBy: { kind: 'person', name: 'Grace Hopper', email: 'grace@acme.test' },
		issuedAt: new Date('2026-10-19T08:30:00Z'),
		...overrides
	};
}

describe('renderHandoverDocument', () => {
	it('carries the code, every asset tag and the agreement hash in its text layer', async () => {
		const input = accepted();

		const text = await textOf(await renderHandoverDocument(input));

		expect(text).toContain('HND-0042');
		expect(text).toContain('AST-0001');
		expect(text).toContain('AST-0002');
		expect(text).toContain(input.bodySha256);
	});

	it('prints accents from its embedded font, in the agreement and in the snapshots', async () => {
		const accents = 'àáèéíïòóúüçñ·';
		const text = await textOf(
			await renderHandoverDocument(
				accepted({
					body: `Paraules amb accents: ${accents}. Col·laboració, Łukasz, Dvořák.`,
					person: { name: 'Núria Puigdomènech', email: 'nuria@acme.test' }
				})
			)
		);

		expect(text).toContain(accents);
		expect(text).toContain('Col·laboració, Łukasz, Dvořák.');
		expect(text).toContain('Núria Puigdomènech');
		expect(text).toContain('Portàtil');
		expect(text).toContain('MacBook Pró');
	});

	it('states the decision with its time in the organisation zone and in UTC, IP, agent and issuer', async () => {
		const text = await textOf(await renderHandoverDocument(accepted()));

		expect(text).toContain('Aceptada');
		expect(text).toContain('20 de octubre de 2026');
		expect(text).toContain('12:00:00 (Europe/Madrid, GMT+02:00)');
		expect(text).toContain('2026-10-20 10:00:00 UTC');
		expect(text).toContain('203.0.113.7');
		expect(text).toContain('Mozilla/5.0 (iPhone)');
		expect(text).toContain('Grace Hopper');
		expect(text).toContain('nuria@acme.test');
	});

	it('states a rejection and its reason', async () => {
		const text = await textOf(
			await renderHandoverDocument(
				accepted({
					status: 'rejected',
					reason: 'El número de serie no coincide',
					signaturePng: null
				})
			)
		);

		expect(text).toContain('Rechazada');
		expect(text).toContain('El número de serie no coincide');
	});

	it('names a service account as the issuer', async () => {
		const text = await textOf(
			await renderHandoverDocument(
				accepted({ issuedBy: { kind: 'service_account', name: 'HR sync', email: null } })
			)
		);

		expect(text).toContain('HR sync (cuenta de servicio)');
	});

	it('lists the condition and notes of each asset on a return', async () => {
		const text = await textOf(
			await renderHandoverDocument(
				accepted({
					direction: 'return',
					assets: [
						{
							assetTag: 'AST-0001',
							name: 'Portàtil',
							serial: 'SN-1',
							model: 'MacBook Pró',
							condition: 'Golpe en la esquina',
							notes: 'Sin cargador'
						}
					]
				})
			)
		);

		expect(text).toContain('Acta de devolución');
		expect(text).toContain('Golpe en la esquina');
		expect(text).toContain('Sin cargador');
	});

	it('renders the same evidence into the same bytes', async () => {
		const input = accepted();

		expect(await renderHandoverDocument(input)).toEqual(await renderHandoverDocument(input));
	});
});
