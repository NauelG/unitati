import { and, eq } from 'drizzle-orm';
import { can } from '../access/permissions';
import { getDb } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import type { Viewer } from './reader';
import { notificationPreferences } from './schema';
import {
	DEFAULTS,
	isDirect,
	NOTIFICATION_TYPES,
	type NotificationChannel,
	type NotificationType
} from './types';

/**
 * Who chooses what reaches them (#302, ADR 0040). Defaults live in code and only
 * a choice that differs from them is stored, so changing a default reaches
 * everyone who never touched it; choosing the default again deletes the row.
 */

/** What can reach somebody who cannot see the desk or the projects: their own tickets, and mentions. */
const REQUESTER_TYPES: readonly NotificationType[] = [
	'ticket.replied',
	'ticket.resolved',
	'mention'
];

export interface Preference {
	type: NotificationType;
	inApp: boolean;
	email: boolean;
	/** In-app cannot be switched off: the direct types (`DIRECT_TYPES`). */
	inAppLocked: boolean;
}

export type PreferenceFailure = 'locked' | 'not_available';

/** Staff can receive every type (`followed.activity` too); anybody else, three. */
export function receivableTypes(viewer: Pick<Viewer, 'role' | 'scopes'>): NotificationType[] {
	const staff = can(viewer, 'tickets.view') || can(viewer, 'projects.view');
	return staff ? [...NOTIFICATION_TYPES] : [...REQUESTER_TYPES];
}

/** Every type the viewer can receive, in catalogue order, with what is in effect for each channel. */
export async function getPreferences(viewer: Viewer): Promise<Preference[]> {
	if (!viewer.personId) return [];

	const rows = await getDb()
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.personId, viewer.personId));
	const stored = (type: NotificationType, channel: NotificationChannel) =>
		rows.find((row) => row.type === type && row.channel === channel)?.enabled;

	return receivableTypes(viewer).map((type) => {
		const locked = isDirect(type);
		return {
			type,
			inApp: locked ? true : (stored(type, 'in_app') ?? DEFAULTS[type].inApp),
			email: stored(type, 'email') ?? DEFAULTS[type].email,
			inAppLocked: locked
		};
	});
}

function defaultFor(type: NotificationType, channel: NotificationChannel): boolean {
	return channel === 'in_app' ? DEFAULTS[type].inApp : DEFAULTS[type].email;
}

/**
 * Sets one switch. A value equal to the default deletes the row instead of
 * storing it. In-app of a direct type is `locked`; a type the viewer cannot
 * receive is `not_available`.
 */
export async function setPreference(
	viewer: Viewer,
	type: NotificationType,
	channel: NotificationChannel,
	enabled: boolean
): Promise<Outcome<void, PreferenceFailure>> {
	const personId = viewer.personId;
	if (!personId || !receivableTypes(viewer).includes(type)) return failure('not_available');
	if (channel === 'in_app' && isDirect(type)) return failure('locked');

	const db = getDb();
	if (enabled === defaultFor(type, channel)) {
		await db
			.delete(notificationPreferences)
			.where(
				and(
					eq(notificationPreferences.personId, personId),
					eq(notificationPreferences.type, type),
					eq(notificationPreferences.channel, channel)
				)
			);
		return success(undefined);
	}

	await db
		.insert(notificationPreferences)
		.values({ personId, type, channel, enabled })
		.onConflictDoUpdate({
			target: [
				notificationPreferences.personId,
				notificationPreferences.type,
				notificationPreferences.channel
			],
			set: { enabled, updatedAt: new Date() }
		});
	return success(undefined);
}
