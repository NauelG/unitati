/**
 * The notifications module's entry point (ADR 0002, ADR 0040): callers import
 * from here, never from a file inside. Cross-cutting like `activity`.
 */

export {
	NOTIFICATION_TYPES,
	NOTIFICATION_CHANNELS,
	DIRECT_TYPES,
	DEFAULTS,
	isDirect
} from './types';
export type { NotificationType, NotificationChannel } from './types';

export { snapshotSchema } from './snapshot';
export type { Snapshot } from './snapshot';

export { notify } from './notify';
export type { NotifyInput, NotifyTarget, PendingEmail } from './notify';

export {
	unreadCount,
	listInbox,
	markRead,
	markAllRead,
	notificationHref,
	INBOX_PAGE_SIZE
} from './reader';
export type { InboxItem, InboxPage, NotificationFailure, Viewer } from './reader';
