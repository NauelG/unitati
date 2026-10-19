import type { ThreadItem } from './comments';

/**
 * Every row written while a ticket is created shares the transaction's `now()`,
 * so the timestamp alone cannot order the thread. At equal times the story
 * reads: the request was opened, the opening message came with it, then
 * everything else that happened. The order is a presentation concern; how
 * timestamps are written stays as it is.
 */
const rank = (item: ThreadItem): number => {
	if (item.kind === 'comment') return 1;
	return item.entry.verb === 'ticket.created' ? 0 : 2;
};

const timestamp = (item: ThreadItem): number =>
	(item.kind === 'comment' ? item.createdAt : item.at).getTime();

const key = (item: ThreadItem): string => (item.kind === 'comment' ? item.id : item.entry.id);

/** Oldest first; ties broken by meaning, then by id so the order is stable. */
export function compareThreadItems(a: ThreadItem, b: ThreadItem): number {
	return (
		timestamp(a) - timestamp(b) ||
		rank(a) - rank(b) ||
		(key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
	);
}
