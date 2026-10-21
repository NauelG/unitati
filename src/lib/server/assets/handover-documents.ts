import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { can } from '../access/permissions';
import { serviceAccountName } from '../api/service-accounts';
import type { SessionUser } from '../auth/guards';
import { getBrand, getBrandLockupForPrint } from '../directory';
import { organisations, people } from '../directory/schema';
import { getDb } from '../db';
import { sendQuietly, type MailAttachment, type Mailer, type MailMessage } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer, runtimeStorage, runtimeTimeZone } from '../shared/runtime';
import type { Storage } from '../shared/storage';
import { renderHandoverDocument, type HandoverDocumentInput } from './handover-document';
import { handoverAcceptedMail, handoverCopyMail, handoverRejectedMail } from './handover-mail';
import { handoverAssets, handovers } from './schema';

/**
 * Storing and mailing the document of a decided handover (ADR 0036). The
 * rendering is `handover-document.ts`; this file feeds it the frozen evidence,
 * keeps the result, and sends the copies.
 *
 * A document is written once. The row takes the first key and hash that reach
 * it and never another, so a second attempt, concurrent or later, finds the
 * first document and returns it.
 */

export interface DocumentDeps {
	storage?: Storage;
	mailer?: Mailer | null;
	/** The zone the decision time is printed in, beside UTC. */
	timeZone?: string;
	/** Specs only: the render a failure can be forced through. */
	render?: (input: HandoverDocumentInput) => Promise<Uint8Array>;
}

export type EnsureDocumentFailure = 'not_found' | 'not_decided';

export interface StoredHandoverDocument {
	storageKey: string;
	sha256: string;
}

/** Only staff with assets.view or the signer with assets.view.own can retrieve the file. */
export async function getHandoverDocument(
	viewer: SessionUser,
	handoverId: string,
	storage: Storage = runtimeStorage()
): Promise<Outcome<{ code: string; data: Uint8Array }, 'not_found'>> {
	const [row] = await getDb()
		.select({
			code: handovers.code,
			personId: handovers.personId,
			key: handovers.documentStorageKey
		})
		.from(handovers)
		.where(and(eq(handovers.id, handoverId), eq(handovers.organisationId, viewer.organisationId)))
		.limit(1);
	if (
		!row?.key ||
		!(
			can(viewer, 'assets.view') ||
			(can(viewer, 'assets.view.own') && viewer.personId === row.personId)
		)
	) {
		return failure('not_found');
	}
	const data = await storage.get(row.key);
	return data ? success({ code: row.code, data }) : failure('not_found');
}

/**
 * The handover's document, generated and stored now if it has none yet. Only an
 * accepted or rejected handover has one: a pending, expired or waived handover
 * records no decision to certify.
 *
 * Whoever stores the document sends the copies, so they go out exactly once:
 * at decision time normally, or on the later call that repairs a failed one,
 * since the person never got theirs.
 *
 * A failure to render or store throws; the decision it certifies is unaffected.
 */
export async function ensureHandoverDocument(
	handoverId: string,
	deps: DocumentDeps = {}
): Promise<Outcome<StoredHandoverDocument, EnsureDocumentFailure>> {
	const storage = deps.storage ?? runtimeStorage();
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const render = deps.render ?? renderHandoverDocument;

	const row = await loadHandover(handoverId);
	if (!row) return failure('not_found');
	if (row.status !== 'accepted' && row.status !== 'rejected') return failure('not_decided');
	if (row.documentStorageKey && row.documentSha256) {
		return success({ storageKey: row.documentStorageKey, sha256: row.documentSha256 });
	}

	const evidence = await evidenceOf(row, storage, deps.timeZone ?? runtimeTimeZone());
	const bytes = await render(evidence.input);
	const sha256 = createHash('sha256').update(bytes).digest('hex');
	// A fresh key per attempt: a losing attempt must never overwrite the winner's bytes.
	const storageKey = `${row.organisationId}/handovers/${row.id}/${randomUUID()}.pdf`;
	await storage.put(storageKey, bytes);

	let won: { id: string }[];
	try {
		won = await getDb()
			.update(handovers)
			.set({ documentStorageKey: storageKey, documentSha256: sha256, updatedAt: new Date() })
			.where(and(eq(handovers.id, row.id), isNull(handovers.documentStorageKey)))
			.returning({ id: handovers.id });
	} catch (error) {
		await storage.delete(storageKey).catch(() => {});
		throw error;
	}

	if (won.length === 0) {
		await storage.delete(storageKey).catch(() => {});
		const winner = await loadHandover(row.id);
		return success({ storageKey: winner!.documentStorageKey!, sha256: winner!.documentSha256! });
	}

	const attachment: MailAttachment = {
		filename: `${row.code}.pdf`,
		contentType: 'application/pdf',
		content: bytes
	};
	for (const message of copiesOf(row, evidence, attachment)) void sendQuietly(mailer, message);

	return success({ storageKey, sha256 });
}

export type HandoverRow = NonNullable<Awaited<ReturnType<typeof loadHandover>>>;

async function loadHandover(handoverId: string) {
	const [row] = await getDb()
		.select({
			id: handovers.id,
			organisationId: handovers.organisationId,
			organisationName: organisations.name,
			code: handovers.code,
			direction: handovers.direction,
			status: handovers.status,
			personName: handovers.personNameSnapshot,
			recipientEmail: handovers.recipientEmailSnapshot,
			body: handovers.bodySnapshot,
			bodySha256: handovers.bodySha256,
			decidedAt: handovers.decidedAt,
			decisionReason: handovers.decisionReason,
			signatureStorageKey: handovers.signatureStorageKey,
			signerIp: handovers.signerIp,
			signerUserAgent: handovers.signerUserAgent,
			issuedByPersonId: handovers.issuedByPersonId,
			issuedByServiceAccountId: handovers.issuedByServiceAccountId,
			issuedAt: handovers.issuedAt,
			documentStorageKey: handovers.documentStorageKey,
			documentSha256: handovers.documentSha256
		})
		.from(handovers)
		.innerJoin(organisations, eq(organisations.id, handovers.organisationId))
		.where(eq(handovers.id, handoverId))
		.limit(1);
	return row ?? null;
}

interface Evidence {
	input: HandoverDocumentInput;
	/** The issuing technician, mailed a copy; a service account has no inbox. */
	issuerPerson: { name: string; email: string } | null;
}

async function evidenceOf(row: HandoverRow, storage: Storage, timeZone: string): Promise<Evidence> {
	const status = row.status as 'accepted' | 'rejected';
	// Every decided handover was pending first, and a pending one has its text (the CHECK).
	if (row.body === null || row.bodySha256 === null || row.decidedAt === null) {
		throw new Error(`Handover ${row.id} is decided but its evidence is incomplete.`);
	}

	let signaturePng: Uint8Array | null = null;
	if (status === 'accepted') {
		signaturePng = await storage.get(row.signatureStorageKey!);
		if (!signaturePng)
			throw new Error(`The signature of handover ${row.id} is missing from storage.`);
	}

	const assets = await getDb()
		.select({
			assetTag: handoverAssets.assetTagSnapshot,
			name: handoverAssets.assetNameSnapshot,
			serial: handoverAssets.serialSnapshot,
			model: handoverAssets.modelSnapshot
		})
		.from(handoverAssets)
		.where(eq(handoverAssets.handoverId, row.id))
		.orderBy(asc(handoverAssets.assetTagSnapshot));

	let issuerPerson: Evidence['issuerPerson'] = null;
	let issuedBy: HandoverDocumentInput['issuedBy'] = null;
	if (row.issuedByPersonId) {
		const [person] = await getDb()
			.select({ name: people.fullName, email: people.email })
			.from(people)
			.where(
				and(eq(people.id, row.issuedByPersonId), eq(people.organisationId, row.organisationId))
			)
			.limit(1);
		if (person) {
			issuerPerson = person;
			issuedBy = { kind: 'person', ...person };
		}
	} else if (row.issuedByServiceAccountId) {
		const name = await serviceAccountName(row.organisationId, row.issuedByServiceAccountId);
		if (name) issuedBy = { kind: 'service_account', name, email: null };
	}

	const brand = await getBrand(row.organisationId);
	return {
		issuerPerson,
		input: {
			brand: {
				productName: brand.productName,
				organisationName: row.organisationName,
				lockupPng: await getBrandLockupForPrint(row.organisationId)
			},
			code: row.code,
			direction: row.direction,
			status,
			body: row.body,
			bodySha256: row.bodySha256,
			assets,
			person: { name: row.personName, email: row.recipientEmail },
			reason: row.decisionReason,
			signaturePng,
			decidedAt: row.decidedAt,
			timeZone,
			signerIp: row.signerIp,
			signerUserAgent: row.signerUserAgent,
			issuedBy,
			issuedAt: row.issuedAt
		}
	};
}

/** One copy to the person; one to the issuing technician, if a person issued it. */
function copiesOf(row: HandoverRow, evidence: Evidence, attachment: MailAttachment): MailMessage[] {
	const { input, issuerPerson } = evidence;
	const messages: MailMessage[] = [
		{
			to: row.recipientEmail,
			...handoverCopyMail({
				personName: row.personName,
				organisationName: row.organisationName,
				code: row.code,
				direction: row.direction,
				status: input.status
			}),
			attachments: [attachment]
		}
	];
	if (issuerPerson) {
		const toIssuer =
			input.status === 'accepted'
				? handoverAcceptedMail({
						issuerName: issuerPerson.name,
						personName: row.personName,
						code: row.code,
						direction: row.direction
					})
				: handoverRejectedMail({
						direction: row.direction,
						issuerName: issuerPerson.name,
						personName: row.personName,
						code: row.code,
						reason: input.reason ?? ''
					});
		messages.push({ to: issuerPerson.email, ...toIssuer, attachments: [attachment] });
	}
	return messages;
}
