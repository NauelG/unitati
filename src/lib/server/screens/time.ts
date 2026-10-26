import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import {
	isTimeTrackingEnabled,
	listEntriesFor,
	getRunningTimer,
	listOfferedTypes,
	organisationToday,
	type RecordTime,
	type TimeTarget
} from '../time';

/** The Time section of a record's rail (ADR 0052), as the screens hand it to the page. */
export interface TimeSection extends RecordTime {
	/**
	 * Today (`YYYY-MM-DD`) in the organisation's time zone, the day the server
	 * validates a work date against: the form's default and its latest pick.
	 */
	today: string;
	/** The types an entry may be put on. */
	types: { id: string; name: string; isDefault: boolean }[];
	/** Record state applied (ADR 0050 rule 4): false on a task of an archived project. */
	canLog: boolean;
	/** The viewer's running timer, wherever it is; `here` when it counts on this record. */
	timer: { startedAt: string; here: boolean; tag: string; href: string } | null;
}

/**
 * `null` when there is nothing to show: tracking is off, or the viewer holds no
 * `time.log`. The caller has already read the record through its own policy.
 */
export async function timeSection(
	viewer: SessionUser,
	target: TimeTarget,
	writable: boolean
): Promise<TimeSection | null> {
	if (!can(viewer, 'time.log')) return null;
	if (!(await isTimeTrackingEnabled(viewer.organisationId))) return null;

	const [time, types, running] = await Promise.all([
		listEntriesFor(viewer, target),
		listOfferedTypes(viewer.organisationId),
		getRunningTimer(viewer)
	]);
	const here =
		running !== null &&
		running.record.id === ('ticketId' in target ? target.ticketId : target.taskId);

	return {
		...time,
		today: organisationToday(),
		types,
		canLog: writable && viewer.personId !== null,
		timer: running && {
			startedAt: running.startedAt.toISOString(),
			here,
			tag: running.record.tag,
			href: running.record.href
		}
	};
}
