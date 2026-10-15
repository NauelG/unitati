import { and, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import { can } from '../access/permissions';
import { requireAssetScope } from '../assets';
import { assets } from '../assets/schema';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { tickets } from '../service-desk/schema';
import { ticketAsset } from './schema';

/**
 * Attaching an asset to a ticket, and undoing it.
 *
 * Both are events, so each records itself in `activity` inside the transaction
 * that changes the relation (ADR 0009) — and against the **ticket**, never the
 * asset. The ticket's thread answers "when was AST-0142 attached?", a past
 * event; the asset's timeline answers "which tickets does this machine have?",
 * a live relation rendered with today's status. Writing the event on both sides
 * would put the ticket in the asset's timeline twice, once of them stale.
 */

export interface TicketAssetPair {
	ticketId: string;
	assetId: string;
}

export type LinkAssetFailure = 'ticket_not_found' | 'asset_not_found' | 'already_linked';

/**
 * The ticket, scoped to the actor's organisation and nothing more.
 *
 * Who may write to *which* ticket is `service-desk`'s rule, and this function
 * does not restate it: the caller has already authorised the ticket (it just
 * created it, or its route is gated by `tickets.manage`), exactly as the staff
 * writes in `service-desk` trust the route and scope tenancy only. Importing
 * that rule from `service-desk` would make the two domains depend on each other,
 * because `createTicket` is the thing that calls `linkAsset`.
 */
async function ticketInOrganisation(tx: Transaction, actor: SessionUser, ticketId: string) {
	const [ticket] = await tx
		.select({ id: tickets.id })
		.from(tickets)
		.where(and(eq(tickets.id, ticketId), eq(tickets.organisationId, actor.organisationId)))
		.limit(1);

	return ticket ?? null;
}

/** The asset as the actor may see it — the rule lives in `assets`, not here. */
async function visibleAsset(tx: Transaction, actor: SessionUser, assetId: string) {
	const [asset] = await tx
		.select({ id: assets.id, assetTag: assets.assetTag, name: assets.name })
		.from(assets)
		.where(and(requireAssetScope(actor), eq(assets.id, assetId)))
		.limit(1);

	return asset ?? null;
}

/**
 * Links an asset to a ticket.
 *
 * **The ticket is the caller's to authorise; the asset is ours to check.** The
 * actor can only attach what they can see: an employee attaches the
 * laptop they hold or a shared printer and nothing else, which is
 * `requireAssetScope` and is enforced here rather than in the form: a request
 * posted by hand with another asset's id meets the same check.
 *
 * Takes a `Transaction` like `recordActivity`, because linking happens while a
 * ticket opens and the two must commit together.
 */
export async function linkAsset(
	tx: Transaction,
	actor: SessionUser,
	pair: TicketAssetPair
): Promise<Outcome<void, LinkAssetFailure>> {
	const ticket = await ticketInOrganisation(tx, actor, pair.ticketId);
	if (!ticket) return failure('ticket_not_found');

	const asset = await visibleAsset(tx, actor, pair.assetId);
	if (!asset) return failure('asset_not_found');

	// `do nothing` instead of letting the unique constraint raise: a violation
	// aborts the surrounding transaction in Postgres, and a second attempt at the
	// same link is a business outcome, not a reason to lose the ticket being opened.
	const inserted = await tx
		.insert(ticketAsset)
		.values({
			organisationId: actor.organisationId,
			ticketId: ticket.id,
			assetId: asset.id,
			createdByPersonId: actor.personId
		})
		.onConflictDoNothing({ target: [ticketAsset.ticketId, ticketAsset.assetId] })
		.returning({ id: ticketAsset.id });

	if (inserted.length === 0) return failure('already_linked');

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { ticketId: ticket.id },
		verb: 'link.asset.added',
		payload: { assetId: asset.id, assetTag: asset.assetTag, assetName: asset.name }
	});

	return success(undefined);
}

/**
 * `linkAsset` as a single act, for a caller that is not already inside a
 * transaction (the API): opens its own, like `unlinkAsset`.
 */
export async function linkAssetToTicket(
	actor: SessionUser,
	pair: TicketAssetPair
): Promise<Outcome<void, LinkAssetFailure>> {
	return getDb().transaction((tx) => linkAsset(tx, actor, pair));
}

export type UnlinkAssetFailure = 'forbidden' | 'not_linked';

/**
 * Undoes a link. Behind `tickets.manage`, and that check is here as well as in
 * the route: this is the call that destroys context, and context is the
 * product, so it does not rely on every caller remembering to gate it.
 *
 * Opens its own transaction (unlike `linkAsset`) because unlinking is a single
 * act from the user's side, not a step of something larger.
 */
export async function unlinkAsset(
	actor: SessionUser,
	pair: TicketAssetPair
): Promise<Outcome<void, UnlinkAssetFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	return getDb().transaction(async (tx) => {
		// The snapshot is read before the row goes: the entry says which asset it
		// was even after the asset is renamed or retired (ADR 0009).
		const [link] = await tx
			.select({ id: ticketAsset.id, assetTag: assets.assetTag, assetName: assets.name })
			.from(ticketAsset)
			.innerJoin(assets, eq(ticketAsset.assetId, assets.id))
			.where(
				and(
					eq(ticketAsset.organisationId, actor.organisationId),
					eq(ticketAsset.ticketId, pair.ticketId),
					eq(ticketAsset.assetId, pair.assetId)
				)
			)
			.limit(1);
		if (!link) return failure('not_linked');

		await tx.delete(ticketAsset).where(eq(ticketAsset.id, link.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: pair.ticketId },
			verb: 'link.asset.removed',
			payload: { assetId: pair.assetId, assetTag: link.assetTag, assetName: link.assetName }
		});

		return success(undefined);
	});
}
