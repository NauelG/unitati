import { and, eq } from 'drizzle-orm';
import { pageTagsIn } from '#lib/domain/knowledge.js';
import { actorColumns, recordActivity } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { pageSummaries, readablePagesByTag, type CitablePage } from '../knowledge';
import { ticketInOrganisation } from '../service-desk';
import { failure, success, type Outcome } from '../shared/outcome';
import type { LinkResult, UnlinkFailure } from './ticket-work';
import { ticketPage } from './schema';

/**
 * A ticket cites knowledge pages (#327): by hand from the rail, or
 * automatically when a reply links `/knowledge/DOC-####`. Built like the other
 * ticket relations (ADR 0005): one join table, activity on the **ticket** only
 * (the page's side reads the live relation), idempotent insert.
 *
 * **Only published pages are citable.** A draft is not a reference anybody
 * else can follow. A citation outlives the text that caused it: editing the
 * link out of a reply keeps the row, and only "Quitar" removes it.
 */

export type CitePageFailure =
	'forbidden' | 'ticket_not_found' | 'page_not_found' | 'page_not_citable';

/** A reply was refused because of a page it links. Nothing was written. */
export type CitationRefusal =
	{ kind: 'page_not_public'; pageTag: string } | { kind: 'page_not_citable'; pageTag: string };

/** Inserts the row and, only if it was new, the entry on the ticket's timeline. */
async function insertCitation(
	tx: Transaction,
	actor: SessionUser,
	ticketId: string,
	page: { id: string; tag: string; title: string }
): Promise<LinkResult> {
	const inserted = await tx
		.insert(ticketPage)
		.values({
			organisationId: actor.organisationId,
			ticketId,
			pageId: page.id,
			createdByPersonId: actor.personId
		})
		.onConflictDoNothing({ target: [ticketPage.ticketId, ticketPage.pageId] })
		.returning({ id: ticketPage.id });

	if (inserted.length === 0) return { created: false };

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { ticketId },
		verb: 'link.page.added',
		payload: { pageTag: page.tag, pageTitle: page.title }
	});
	return { created: true };
}

/**
 * Cites a page from a ticket. `tickets.manage`; the page must be readable **and
 * published** by the actor, which also hides a page they cannot read: it is
 * `page_not_found`, never a hint that it exists.
 */
export async function citePage(
	actor: SessionUser,
	ticketId: string,
	pageTag: string
): Promise<Outcome<LinkResult, CitePageFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	return getDb().transaction(async (tx): Promise<Outcome<LinkResult, CitePageFailure>> => {
		const ticket = await ticketInOrganisation(tx, actor, ticketId);
		if (!ticket) return failure('ticket_not_found');

		const [page] = await readablePagesByTag(tx, actor, [pageTag]);
		if (!page) return failure('page_not_found');
		if (!page.published) return failure('page_not_citable');

		return success(await insertCitation(tx, actor, ticket.id, page));
	});
}

/**
 * Removes a citation. Works on a page the actor can no longer read: the link
 * belongs to `links`, and a since-archived page is exactly the one somebody wants gone.
 */
export async function uncitePage(
	actor: SessionUser,
	ticketId: string,
	pageId: string
): Promise<Outcome<void, UnlinkFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	return getDb().transaction(async (tx): Promise<Outcome<void, UnlinkFailure>> => {
		const [link] = await tx
			.select({ id: ticketPage.id })
			.from(ticketPage)
			.where(
				and(
					eq(ticketPage.organisationId, actor.organisationId),
					eq(ticketPage.ticketId, ticketId),
					eq(ticketPage.pageId, pageId)
				)
			)
			.limit(1);
		if (!link) return failure('link_not_found');

		// The entry names the page as it is read now, falling back to its code.
		const [page] = await pageSummaries(actor, [pageId]);
		await tx.delete(ticketPage).where(eq(ticketPage.id, link.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId },
			verb: 'link.page.removed',
			payload: { pageTag: page?.tag ?? pageId, pageTitle: page?.title || page?.tag || pageId }
		});

		return success(undefined);
	});
}

/** Whether a page may appear in a reply of this visibility: published, and for a public one in a `portal` space. */
function refusalFor(
	tag: string,
	page: CitablePage | undefined,
	visibility: 'public' | 'internal'
): CitationRefusal | null {
	if (visibility === 'public') {
		return page?.published && page.audience === 'portal'
			? null
			: { kind: 'page_not_public', pageTag: tag };
	}
	return page?.published ? null : { kind: 'page_not_citable', pageTag: tag };
}

/**
 * Cites every page a comment body links, inside the caller's transaction (#327).
 * Called by `addComment` and `editComment` so the comment and its citations
 * commit together.
 *
 * Every page is checked **before** anything is written, so a refusal leaves no
 * row and no entry behind: a public reply may only link published pages of a
 * `portal` space (its readers must be able to open them), an internal note
 * published pages the author can read.
 *
 * Only for somebody who may manage tickets: citing is a technician's act, and
 * an employee's reply is not a reference anybody curated. `service-desk` calls
 * this and never touches `knowledge` tables.
 */
export async function citePagesFromBody(
	tx: Transaction,
	actor: SessionUser,
	ticketId: string,
	body: string,
	visibility: 'public' | 'internal'
): Promise<Outcome<{ cited: number }, CitationRefusal>> {
	return citePageTags(tx, actor, ticketId, pageTagsIn(body), visibility);
}

/** `citePagesFromBody` for tags already parsed: an edit cites only the links it adds. */
export async function citePageTags(
	tx: Transaction,
	actor: SessionUser,
	ticketId: string,
	tags: readonly string[],
	visibility: 'public' | 'internal'
): Promise<Outcome<{ cited: number }, CitationRefusal>> {
	if (tags.length === 0 || !can(actor, 'tickets.manage')) return success({ cited: 0 });

	const found = new Map(
		(await readablePagesByTag(tx, actor, tags)).map((page) => [page.tag, page])
	);
	for (const tag of tags) {
		const refusal = refusalFor(tag, found.get(tag), visibility);
		if (refusal) return failure(refusal);
	}

	let cited = 0;
	for (const tag of tags) {
		const result = await insertCitation(tx, actor, ticketId, found.get(tag)!);
		if (result.created) cited += 1;
	}
	return success({ cited });
}
