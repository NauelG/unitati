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
	follow,
	unfollow,
	isFollowing,
	followerIds,
	followState,
	followTicket,
	followPage,
	unfollowFromNotification
} from './follows';
export type { FollowTarget, FollowState, FollowFailure } from './follows';

export {
	notificationMail,
	sendNotificationEmails,
	linkedTaskMail,
	sendLinkedTaskEmails,
	emailConfigured,
	PREFERENCES_PATH
} from './mail';
export type { CompletedTask } from './mail';

export { getPreferences, setPreference, receivableTypes } from './preferences';
export type { Preference, PreferenceFailure } from './preferences';

export {
	unreadCount,
	listInbox,
	markRead,
	markAllRead,
	notificationHref,
	INBOX_PAGE_SIZE
} from './reader';
export type { InboxItem, InboxPage, NotificationFailure, Viewer } from './reader';
