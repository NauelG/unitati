import { isIP } from 'node:net';
import { and, asc, eq } from 'drizzle-orm';
import { recordActivity } from '../activity';
import { getDb, type Executor } from '../db';
import { people } from '../directory/schema';
import { emit } from '../shared/events';
import { sendQuietly, type Mailer, type MailMessage } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer, runtimeStorage } from '../shared/runtime';
import { MAX_DECISION_REASON, type HandoverCondition } from '#lib/domain/handover.js';
import type { Storage } from '../shared/storage';
import { ensureHandoverDocument, type DocumentDeps } from './handover-documents';
import { handoverRejectedMail } from './handover-mail';
import type { HandoverDirection } from './handover-template';
import { hashHandoverToken } from './handover-token';
import { handoverAssets, handovers } from './schema';
import { signatureProblem, type SignatureProblem } from './signature';

/**
 * The person's side of a handover (ADR 0035, decisions 3, 4 and 6): reading it
 * through the signing link and deciding it, with no session. The token is the
 * only credential, so every lookup goes through its hash and nothing here takes
 * an organisation from the caller.
 *
 * A decision is final. It consumes the link (`token_hash` is cleared and kept as
 * `consumed_token_hash`, so the same link can still say "already decided"), and
 * correcting a decided handover means issuing a new one.
 */

/** The user agent is evidence, not a payload: anything past this is noise. */
const MAX_USER_AGENT = 1000;

export interface SigningAsset {
	assetTag: string;
	name: string;
	serial: string | null;
	model: string;
	/** How it came back, on a return (#278); `null` on a delivery. */
	condition: HandoverCondition | null;
	conditionNotes: string | null;
}

/**
 * What the signing page may show. Only a pending, unexpired handover carries
 * its content: an expired or decided link names its organisation, so the page
 * keeps that brand, and reveals neither the person nor the assets.
 */
export type SigningView =
	| { state: 'unknown' }
	| { state: 'expired' | 'decided'; organisationId: string }
	| {
			state: 'pending';
			organisationId: string;
			code: string;
			direction: HandoverDirection;
			/** The literal rendered agreement, Markdown, exactly as it will be signed. */
			body: string;
			expiresAt: Date;
			assets: SigningAsset[];
	  };

export interface DecisionDeps extends Pick<DocumentDeps, 'timeZone' | 'render'> {
	storage?: Storage;
	mailer?: Mailer | null;
	now?: () => Date;
}

export async function openHandover(
	token: string,
	deps: Pick<DecisionDeps, 'now'> = {}
): Promise<SigningView> {
	const now = (deps.now ?? (() => new Date()))();
	const hash = hashHandoverToken(token);

	const [row] = await getDb()
		.select({
			id: handovers.id,
			organisationId: handovers.organisationId,
			code: handovers.code,
			direction: handovers.direction,
			status: handovers.status,
			body: handovers.bodySnapshot,
			expiresAt: handovers.expiresAt
		})
		.from(handovers)
		.where(eq(handovers.tokenHash, hash))
		.limit(1);

	if (!row) {
		const consumed = await consumedBy(hash);
		return consumed ? { state: 'decided', organisationId: consumed } : { state: 'unknown' };
	}
	const { organisationId } = row;
	if (row.status !== 'pending') return { state: 'decided', organisationId };
	if (isExpired(row.expiresAt, now)) return { state: 'expired', organisationId };

	const assets = await getDb()
		.select({
			assetTag: handoverAssets.assetTagSnapshot,
			name: handoverAssets.assetNameSnapshot,
			serial: handoverAssets.serialSnapshot,
			model: handoverAssets.modelSnapshot,
			condition: handoverAssets.condition,
			conditionNotes: handoverAssets.conditionNotes
		})
		.from(handoverAssets)
		.where(eq(handoverAssets.handoverId, row.id))
		.orderBy(asc(handoverAssets.assetTagSnapshot));

	return {
		state: 'pending',
		organisationId: row.organisationId,
		code: row.code,
		direction: row.direction,
		// The pending CHECK guarantees both.
		body: row.body ?? '',
		expiresAt: row.expiresAt!,
		assets
	};
}

export type HandoverDecision = 'accept' | 'reject';

export interface DecisionEvidence {
	/** The signer's address, as the server saw it. Required to accept. */
	ip: string | null;
	userAgent: string | null;
	/** The drawn signature as PNG bytes. Required to accept, ignored on rejection. */
	signature?: Uint8Array | null;
	/** Required to reject, ignored on acceptance. */
	reason?: string | null;
}

export type DecideFailure =
	'unknown' | 'already_decided' | 'expired' | 'invalid_reason' | `signature_${SignatureProblem}`;

/** The handover's outcome. */
export type DecidedStatus = 'accepted' | 'rejected';

/** What a decision writes, beyond the shared evidence. */
type Decided =
	{ status: 'accepted'; signatureKey: string } | { status: 'rejected'; reason: string };

export async function decideHandover(
	token: string,
	decision: HandoverDecision,
	evidence: DecisionEvidence,
	deps: DecisionDeps = {}
): Promise<Outcome<{ status: DecidedStatus }, DecideFailure>> {
	const storage = deps.storage ?? runtimeStorage();
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const now = (deps.now ?? (() => new Date()))();
	const hash = hashHandoverToken(token);

	const ip = evidence.ip && isIP(evidence.ip) ? evidence.ip : null;
	const userAgent = evidence.userAgent?.slice(0, MAX_USER_AGENT) || null;

	// Written to the storage inside the transaction, so a rollback has to undo it.
	let storedKey: string | null = null;

	const run = () =>
		getDb().transaction(async (tx) => {
			const [row] = await tx
				.select({
					id: handovers.id,
					organisationId: handovers.organisationId,
					code: handovers.code,
					direction: handovers.direction,
					status: handovers.status,
					expiresAt: handovers.expiresAt,
					personId: handovers.personId,
					personName: handovers.personNameSnapshot,
					issuedByPersonId: handovers.issuedByPersonId
				})
				.from(handovers)
				.where(eq(handovers.tokenHash, hash))
				.limit(1)
				.for('update');

			// A concurrent decision that committed first has cleared the hash, so it lands here too.
			if (!row) {
				return failure(
					(await consumedBy(hash, tx)) ? ('already_decided' as const) : ('unknown' as const)
				);
			}
			if (row.status !== 'pending') return failure('already_decided' as const);
			if (isExpired(row.expiresAt, now)) return failure('expired' as const);

			let decided: Decided;
			if (decision === 'reject') {
				const reason = validReason(evidence.reason);
				if (reason === null) return failure('invalid_reason' as const);
				decided = { status: 'rejected', reason };
			} else {
				const problem = signatureProblem(evidence.signature ?? null);
				if (problem) return failure(`signature_${problem}` as const);
				// The handler always has the client address; its absence is a deployment fault.
				if (!ip) throw new Error('A handover cannot be accepted without the signer IP.');
				const signatureKey = `${row.organisationId}/handovers/${row.id}/signature.png`;
				await storage.put(signatureKey, evidence.signature!);
				storedKey = signatureKey;
				decided = { status: 'accepted', signatureKey };
			}

			await tx
				.update(handovers)
				.set({
					status: decided.status,
					decidedAt: now,
					decisionReason: decided.status === 'rejected' ? decided.reason : null,
					signatureStorageKey: decided.status === 'accepted' ? decided.signatureKey : null,
					signerIp: ip,
					signerUserAgent: userAgent,
					tokenHash: null,
					consumedTokenHash: hash,
					updatedAt: now
				})
				.where(eq(handovers.id, row.id));

			const assetIds = await tx
				.select({ assetId: handoverAssets.assetId })
				.from(handoverAssets)
				.where(eq(handoverAssets.handoverId, row.id));

			const base = {
				handoverId: row.id,
				code: row.code,
				personId: row.personId,
				personName: row.personName
			};
			const targets = [...assetIds, { personId: row.personId }];
			for (const target of targets) {
				// The person acted, through the link: they are the actor, with no session.
				const entry = {
					organisationId: row.organisationId,
					actorPersonId: row.personId,
					target,
					occurredAt: now
				};
				if (decided.status === 'accepted') {
					await recordActivity(tx, { ...entry, verb: 'handover.accepted', payload: base });
				} else {
					await recordActivity(tx, {
						...entry,
						verb: 'handover.rejected',
						payload: { ...base, reason: decided.reason }
					});
				}
			}

			let mail: MailMessage | null = null;
			if (decided.status === 'rejected' && row.issuedByPersonId) {
				const [issuer] = await tx
					.select({ fullName: people.fullName, email: people.email })
					.from(people)
					.where(
						and(eq(people.id, row.issuedByPersonId), eq(people.organisationId, row.organisationId))
					)
					.limit(1);
				if (issuer) {
					mail = {
						to: issuer.email,
						...handoverRejectedMail({
							direction: row.direction,
							issuerName: issuer.fullName,
							personName: row.personName,
							code: row.code,
							reason: decided.reason
						})
					};
				}
			}

			return success({ decided, row, mail });
		});

	let outcome: Awaited<ReturnType<typeof run>>;
	try {
		outcome = await run();
	} catch (error) {
		if (storedKey) await storage.delete(storedKey).catch(() => {});
		throw error;
	}
	if (!outcome.ok) return outcome;

	// After commit, never inside the transaction (ADR 0024); mail never awaited (ADR 0006).
	const { decided, row, mail } = outcome.value;
	const event = {
		organisationId: row.organisationId,
		handoverId: row.id,
		handoverCode: row.code,
		direction: row.direction,
		personId: row.personId,
		personName: row.personName,
		occurredAt: now
	};
	if (decided.status === 'accepted') emit('handover.accepted', event);
	else emit('handover.rejected', { ...event, reason: decided.reason });

	// The certified copy (ADR 0036). It mails the person and the issuer itself, the
	// rejection notice included; only if it fails does that notice go out alone.
	const documented = await tryEnsureDocument(row.id, { ...deps, storage, mailer });
	if (!documented && mail) void sendQuietly(mailer, mail);

	return success({ status: decided.status });
}

/**
 * Generates the document of a just-decided handover. A failure never undoes the
 * decision: it is logged, the handover is left without a document, and
 * `ensureHandoverDocument` generates it later.
 */
async function tryEnsureDocument(handoverId: string, deps: DocumentDeps): Promise<boolean> {
	try {
		return (await ensureHandoverDocument(handoverId, deps)).ok;
	} catch (error) {
		console.error(`could not generate the document of handover ${handoverId}`, error);
		return false;
	}
}

/** Trimmed and 1 to 1000 characters, or `null`. */
function validReason(raw: string | null | undefined): string | null {
	const reason = raw?.trim() ?? '';
	const length = [...reason].length;
	return length >= 1 && length <= MAX_DECISION_REASON ? reason : null;
}

/** `expired` is never stored (ADR 0035, decision 3): it is a pending handover past its date. */
function isExpired(expiresAt: Date | null, now: Date): boolean {
	return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/** The organisation of the handover whose decision consumed this hash, or `null`. */
async function consumedBy(hash: string, executor: Executor = getDb()): Promise<string | null> {
	const [row] = await executor
		.select({ organisationId: handovers.organisationId })
		.from(handovers)
		.where(eq(handovers.consumedTokenHash, hash))
		.limit(1);
	return row?.organisationId ?? null;
}
