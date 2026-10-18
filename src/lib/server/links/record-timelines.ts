import { listActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { relatedTo, type RelatedGroup } from './related';
import { mergeProjectTimeline, mergeTaskTimeline, type AssetTimelineItem } from './timeline';

/**
 * The timeline of a task and of a project: the composition `listActivity` +
 * `relatedTo` + merge, written once so the pages and the API cannot read it
 * differently (ADR 0002).
 *
 * **The caller has already resolved the record in the viewer's scope**
 * (`getTask` / `getProject`): these take an id, not a tag, and do not re-check
 * it. The tickets on the rail are scoped by `relatedTo`, so a viewer never
 * learns of a ticket they cannot see.
 */

export async function taskTimeline(
	viewer: SessionUser,
	taskId: string,
	/** What `relatedTo` already answered for this task, when the caller has it: saves the second read. */
	known?: readonly RelatedGroup[]
): Promise<AssetTimelineItem[]> {
	const [entries, related] = await Promise.all([
		listActivity({ organisationId: viewer.organisationId, target: { taskId } }),
		known ?? relatedTo(viewer, { kind: 'task', id: taskId })
	]);

	return mergeTaskTimeline(entries, related);
}

/**
 * Only the tickets linked to the project itself: the ones that arrive through a
 * task are on that task's rail, not here.
 */
export async function projectTimeline(
	viewer: SessionUser,
	projectId: string,
	/** What `relatedTo` already answered for this project, when the caller has it. */
	known?: readonly RelatedGroup[]
): Promise<AssetTimelineItem[]> {
	const [entries, related] = await Promise.all([
		listActivity({ organisationId: viewer.organisationId, target: { projectId } }),
		known ?? relatedTo(viewer, { kind: 'project', id: projectId })
	]);

	return mergeProjectTimeline(
		entries,
		related.filter((group) => group.relation === 'handles')
	);
}
