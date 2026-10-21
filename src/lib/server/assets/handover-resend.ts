import { and, eq } from 'drizzle-orm';
import { can } from '../access/permissions';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { organisations } from '../directory/schema';
import { sendQuietly, type Mailer, type MailMessage } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer, runtimeOrigin } from '../shared/runtime';
import { handoverLinkMail } from './handover-mail';
import { dateFormat, type IssueDeps } from './handover-issue';
import { getHandoverSettings } from './handover-templates';
import { generateHandoverToken, hashHandoverToken } from './handover-token';
import { handoverAssets, handovers } from './schema';

/**
 * Re-sending a handover's link (#280, ADR 0035, decision 3): there is no
 * scheduler to remind anyone, so the technician does it from the list.
 *
 * Only the credential changes. The handover keeps its code, its frozen text and
 * its issue date; it gets a new token and a new expiry, which is how an expired
 * one becomes pending again without anything storing `expired`. The old hash is
 * overwritten, so the old link stops resolving at all.
 */

export interface ResendDeps extends IssueDeps {
	mailer?: Mailer | null;
	now?: () => Date;
}

export type ResendFailure = 'not_found' | 'not_resendable';

export interface ResentHandover {
	code: string;
	/** The plain token, shown to the technician once. Only its sha256 is stored. */
	token: string;
	link: string;
	expiresAt: Date;
	/** Whether a mail with the link went out; with mail off the technician hands it over. */
	mailed: boolean;
}

export async function resendHandover(
	actor: SessionUser,
	code: string,
	deps: ResendDeps = {}
): Promise<Outcome<ResentHandover, ResendFailure>> {
	if (!can(actor, 'assets.manage')) {
		throw new Error(
			`The ${actor.role} role cannot resend a handover; the route should have called requirePermission first (assets.manage).`
		);
	}
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const linkTo = deps.linkTo ?? ((token: string) => `${runtimeOrigin()}/handover/${token}`);
	const now = (deps.now ?? (() => new Date()))();

	const outcome = await getDb().transaction(async (tx) => {
		const [row] = await tx
			.select({
				id: handovers.id,
				direction: handovers.direction,
				status: handovers.status,
				personId: handovers.personId,
				personName: handovers.personNameSnapshot,
				email: handovers.recipientEmailSnapshot
			})
			.from(handovers)
			.where(and(eq(handovers.code, code), eq(handovers.organisationId, actor.organisationId)))
			.limit(1)
			.for('update');
		if (!row) return failure('not_found' as const);
		// Expired is a pending handover past its date, so it passes; a decision is final.
		if (row.status !== 'pending') return failure('not_resendable' as const);

		const settings = await getHandoverSettings(actor.organisationId, tx);
		const token = generateHandoverToken();
		const expiresAt = new Date(now.getTime() + settings.linkValidDays * 24 * 60 * 60 * 1000);
		await tx
			.update(handovers)
			.set({ tokenHash: hashHandoverToken(token), expiresAt, updatedAt: now })
			.where(eq(handovers.id, row.id));

		const assetIds = await tx
			.select({ assetId: handoverAssets.assetId })
			.from(handoverAssets)
			.where(eq(handoverAssets.handoverId, row.id));
		const payload = {
			handoverId: row.id,
			code,
			personId: row.personId,
			personName: row.personName,
			expiresAt: expiresAt.toISOString()
		};
		for (const target of [...assetIds, { personId: row.personId }]) {
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target,
				verb: 'handover.resent',
				payload,
				occurredAt: now
			});
		}

		const [organisation] = await tx
			.select({ name: organisations.name })
			.from(organisations)
			.where(eq(organisations.id, actor.organisationId))
			.limit(1);
		const link = linkTo(token);
		const mail: MailMessage = {
			to: row.email,
			...handoverLinkMail({
				direction: row.direction,
				personName: row.personName,
				organisationName: organisation?.name ?? '',
				code,
				link,
				expiresOn: dateFormat.format(expiresAt)
			})
		};
		return success({ resent: { code, token, link, expiresAt, mailed: mailer !== null }, mail });
	});
	if (!outcome.ok) return outcome;

	// After commit and not awaited: a failed send changes nothing (ADR 0006).
	void sendQuietly(mailer, outcome.value.mail);
	return success(outcome.value.resent);
}
