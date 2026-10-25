import { and, eq } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { followPage, notify, sendNotificationEmails, type PendingEmail } from '../notifications';
import type { Mailer } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer, runtimeOrigin } from '../shared/runtime';
import { readablePages, requirePagesManage } from './scope';
import { pages } from './schema';

/**
 * Following a knowledge page (#330, ADR 0051): which writes tell the followers,
 * and who starts following. The follow rows and the delivery rules live in
 * `notifications`; this file only says what happened to a page.
 *
 * Every function takes the writer's transaction, so the notification commits
 * with the change or not at all (ADR 0040). The mails it returns go out after
 * commit, with `sendPageMails`.
 */

export type PageNotifyDeps = { mailer?: Mailer | null; origin?: string };

type NotifiedPage = { id: string; pageTag: string; title: string };

/**
 * Tells the followers of a page what happened. `pageIds` widens the audience to
 * a subtree: the root is the target, so each follower hears once. The actor is
 * never told; a service account is shown by name and has no person to exclude.
 */
export async function notifyPageFollowers(
	tx: Transaction,
	actor: SessionUser,
	page: NotifiedPage,
	change: { summary: string; revision?: number; pageIds?: string[] }
): Promise<PendingEmail[]> {
	return notify(tx, {
		organisationId: actor.organisationId,
		actorPersonId: actor.personId,
		target: { pageId: page.id },
		snapshot: {
			code: page.pageTag,
			title: page.title,
			actorName: actor.name,
			revision: change.revision
		},
		recipients: [],
		followers: true,
		followerSummary: change.summary,
		followerPageIds: change.pageIds
	});
}

/** Starts following for whoever wrote or was named; people without `knowledge.manage` are skipped. */
export async function autoFollowPage(
	tx: Transaction,
	organisationId: string,
	pageId: string,
	personIds: (string | null)[]
): Promise<void> {
	for (const personId of new Set(personIds)) {
		if (personId) await followPage(tx, { organisationId, personId, pageId });
	}
}

/** Sends the mails of a committed write, unawaited: with SMTP down the write stands (ADR 0006). */
export function sendPageMails(emails: PendingEmail[], deps: PageNotifyDeps = {}): void {
	if (emails.length === 0) return;
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	void sendNotificationEmails(mailer, emails, deps.origin ?? runtimeOrigin());
}

/**
 * The viewer follows a page (#330). Staff only; a page they cannot read is
 * `not_found`, and an archived one cannot be followed (unfollowing still can,
 * through `unfollow`). The readability check, the archived check and the insert
 * share one transaction, and the page row is held `FOR SHARE` meanwhile: a
 * concurrent `archivePage` waits for it, so an archived page never gains a
 * follower.
 */
export async function followKnowledgePage(
	viewer: SessionUser,
	pageId: string
): Promise<Outcome<void, 'not_found' | 'archived' | 'forbidden'>> {
	requirePagesManage(viewer);
	const personId = viewer.personId;
	if (personId === null) return failure('forbidden');

	return getDb().transaction(async (tx) => {
		const [page] = await tx
			.select({ archivedAt: pages.archivedAt })
			.from(pages)
			.where(and(eq(pages.id, pageId), readablePages(viewer, { includeArchived: true })))
			.for('share');
		if (!page) return failure('not_found');
		if (page.archivedAt) return failure('archived');

		await followPage(tx, { organisationId: viewer.organisationId, personId, pageId });
		return success(undefined);
	});
}
