import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { notifications } from './schema';
import type { Snapshot } from './snapshot';
import type { NotificationType } from './types';

/** Who is reading: scoped to their person and organisation, never to a bare id. */
export type Viewer = Pick<SessionUser, 'organisationId' | 'personId' | 'role' | 'scopes'>;

export const INBOX_PAGE_SIZE = 20;
const MAX_LIMIT = 100;

/** Read rows older than this are deleted the next time their owner opens the inbox (ADR 0040). */
const READ_RETENTION_DAYS = 90;

export interface InboxItem {
	id: string;
	type: NotificationType;
	snapshot: Snapshot;
	read: boolean;
	createdAt: Date;
	href: string;
}

export interface InboxPage {
	items: InboxItem[];
	/** Pass back as `cursor` for the next page; null when there is no more. */
	nextCursor: string | null;
}

export type NotificationFailure = 'not_found';

/**
 * Where a notification leads. The row stores the record's code in its snapshot,
 * and the existing record routes are keyed by that code. A viewer without
 * `tickets.view` (an employee) reads their tickets in the portal.
 */
export function notificationHref(
	row: { ticketId: string | null; taskId: string | null; snapshot: Snapshot },
	viewer: Pick<Viewer, 'role' | 'scopes'>
): string {
	const code = encodeURIComponent(row.snapshot.code);
	if (row.ticketId) {
		return can(viewer, 'tickets.view') ? `/service-desk/${code}` : `/portal/tickets/${code}`;
	}
	if (row.taskId) return `/tasks/${code}`;
	return `/projects/${code}`;
}

function scope(viewer: Viewer) {
	if (!viewer.personId) return null;
	return and(
		eq(notifications.organisationId, viewer.organisationId),
		eq(notifications.recipientPersonId, viewer.personId)
	);
}

export async function unreadCount(viewer: Viewer): Promise<number> {
	const where = scope(viewer);
	if (!where) return 0;

	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(where, isNull(notifications.readAt)));
	return row?.count ?? 0;
}

/** `cursor` is `<created_at as text>|<id>`: text keeps Postgres's microseconds that a `Date` would round. */
function parseCursor(cursor: string | undefined) {
	if (!cursor) return null;
	const at = cursor.lastIndexOf('|');
	if (at < 1) return null;
	return { createdAt: cursor.slice(0, at), id: cursor.slice(at + 1) };
}

/** Newest first, keyset-paged on `(created_at, id)`. Also prunes the viewer's old read rows. */
export async function listInbox(
	viewer: Viewer,
	options: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}
): Promise<InboxPage> {
	const where = scope(viewer);
	if (!where) return { items: [], nextCursor: null };

	const limit = Math.min(Math.max(Math.trunc(options.limit ?? INBOX_PAGE_SIZE), 1), MAX_LIMIT);
	const cursor = parseCursor(options.cursor);
	const db = getDb();

	await db
		.delete(notifications)
		.where(
			and(where, lt(notifications.readAt, sql`now() - ${`${READ_RETENTION_DAYS} days`}::interval`))
		);

	const rows = await db
		.select({
			id: notifications.id,
			type: notifications.type,
			snapshot: notifications.snapshot,
			readAt: notifications.readAt,
			createdAt: notifications.createdAt,
			ticketId: notifications.ticketId,
			taskId: notifications.taskId,
			cursorAt: sql<string>`${notifications.createdAt}::text`
		})
		.from(notifications)
		.where(
			and(
				where,
				options.unreadOnly ? isNull(notifications.readAt) : undefined,
				cursor
					? sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
					: undefined
			)
		)
		.orderBy(desc(notifications.createdAt), desc(notifications.id))
		.limit(limit + 1);

	const window = rows.slice(0, limit);
	const last = window.at(-1);

	return {
		items: window.map((row) => ({
			id: row.id,
			type: row.type,
			snapshot: row.snapshot,
			read: row.readAt !== null,
			createdAt: row.createdAt,
			href: notificationHref(row, viewer)
		})),
		nextCursor: rows.length > limit && last ? `${last.cursorAt}|${last.id}` : null
	};
}

/** Idempotent on a row already read; another person's id is `not_found`, as if it did not exist. */
export async function markRead(
	viewer: Viewer,
	id: string
): Promise<Outcome<void, NotificationFailure>> {
	const where = scope(viewer);
	if (!where) return failure('not_found');

	const owned = await getDb()
		.update(notifications)
		.set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
		.where(and(where, eq(notifications.id, id)))
		.returning({ id: notifications.id });

	return owned.length === 0 ? failure('not_found') : success(undefined);
}

export async function markAllRead(viewer: Viewer): Promise<void> {
	const where = scope(viewer);
	if (!where) return;

	await getDb()
		.update(notifications)
		.set({ readAt: sql`now()` })
		.where(and(where, isNull(notifications.readAt)));
}
