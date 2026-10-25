import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import {
	isTimeTrackingEnabled,
	listEntriesFor,
	listOfferedTypes,
	type RecordTime,
	type TimeTarget
} from '../time';

/** The Time section of a record's rail (ADR 0051), as the screens hand it to the page. */
export interface TimeSection extends RecordTime {
	/** The types an entry may be put on. */
	types: { id: string; name: string; isDefault: boolean }[];
	/** Record state applied (ADR 0050 rule 4): false on a task of an archived project. */
	canLog: boolean;
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

	const [time, types] = await Promise.all([
		listEntriesFor(viewer, target),
		listOfferedTypes(viewer.organisationId)
	]);
	return { ...time, types, canLog: writable && viewer.personId !== null };
}
