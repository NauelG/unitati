/**
 * The vocabulary of notifications (ADR 0040), as plain TypeScript.
 *
 * Declared here and not as a `pgEnum` for the same reason as `activity/verbs.ts`:
 * the Postgres enum is built from this list, so there is one source of truth.
 * The whole catalogue of #33 is declared at once so later sub-issues (#302, #303,
 * #57) add producers, never an enum value and a migration.
 */
export const NOTIFICATION_TYPES = [
	'ticket.assigned',
	'task.assigned',
	'ticket.replied',
	'ticket.commented',
	'ticket.resolved',
	'task.linked_completed',
	'mention',
	'followed.activity'
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Types addressed to one person because of what somebody did *to them*. The in-app
 * channel for these cannot be switched off: being assigned work is not something
 * a person may opt out of seeing.
 */
export const DIRECT_TYPES = [
	'ticket.assigned',
	'task.assigned',
	'mention'
] as const satisfies readonly NotificationType[];

/** What a person gets when they have never touched their preferences. */
export const DEFAULTS: Record<NotificationType, { inApp: true; email: boolean }> = {
	'ticket.assigned': { inApp: true, email: true },
	'task.assigned': { inApp: true, email: true },
	'ticket.replied': { inApp: true, email: true },
	'ticket.commented': { inApp: true, email: false },
	'ticket.resolved': { inApp: true, email: true },
	'task.linked_completed': { inApp: true, email: true },
	mention: { inApp: true, email: true },
	'followed.activity': { inApp: true, email: false }
};

export function isDirect(type: NotificationType): boolean {
	return (DIRECT_TYPES as readonly NotificationType[]).includes(type);
}

/**
 * Strongest first. When one person is a candidate twice for the same change, they
 * get one notification, of the type that says most about why: being mentioned
 * beats being a participant, which beats merely following.
 */
const STRENGTH: Record<NotificationType, number> = {
	mention: 3,
	'ticket.assigned': 2,
	'task.assigned': 2,
	'ticket.replied': 2,
	'ticket.commented': 2,
	'ticket.resolved': 2,
	'task.linked_completed': 2,
	'followed.activity': 1
};

export function strongerType(a: NotificationType, b: NotificationType): NotificationType {
	return STRENGTH[b] > STRENGTH[a] ? b : a;
}
