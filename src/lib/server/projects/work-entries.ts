import type { TimelineEntry } from '../activity';
import type { SessionUser } from '../auth/guards';
import { projectSummaries, taskSummaries } from './summaries';

/**
 * History that names work the viewer cannot see (ADR 0042).
 *
 * A ticket's thread keeps `link.task.added` and friends with a snapshot of the
 * code and the title of the task or project, written when the link was made. The
 * snapshot is the point of a history, and also the leak: a technician who is not
 * a member of a members-only project would read its title in the ticket they
 * are allowed to open. The scope that hides the record is not enough, because
 * the words were copied out of it.
 *
 * The work is `projects`' to protect, so the rule lives here and the callers
 * (`service-desk`'s thread, `links`' organisation feed) apply it. A record that
 * no longer exists is left as written: there is nothing left to protect, and the
 * history is not rewritten for a record that is gone.
 */

type LinkVerb =
	'link.task.added' | 'link.task.removed' | 'link.project.added' | 'link.project.removed';

const isLinkEntry = (entry: TimelineEntry): entry is Extract<TimelineEntry, { verb: LinkVerb }> =>
	entry.verb === 'link.task.added' ||
	entry.verb === 'link.task.removed' ||
	entry.verb === 'link.project.added' ||
	entry.verb === 'link.project.removed';

/** The ids among `ids` that exist and that `inScope` says the viewer cannot open. */
async function hiddenFrom(
	summaries: Promise<{ id: string; inScope: boolean }[]>
): Promise<Set<string>> {
	return new Set((await summaries).filter((record) => !record.inScope).map((record) => record.id));
}

/**
 * The entries as the viewer may read them: a `link.task.*` or `link.project.*`
 * entry about a record they cannot see keeps its verb, actor and time, and loses
 * the id, the code and the title. `activitySentence` words that as a restricted
 * element.
 */
export async function redactWorkEntries<E extends TimelineEntry>(
	viewer: SessionUser,
	entries: readonly E[]
): Promise<E[]> {
	const links = entries.filter(isLinkEntry);
	const taskIds = links.flatMap((entry) =>
		'taskId' in entry.payload ? [entry.payload.taskId] : []
	);
	const projectIds = links.flatMap((entry) =>
		'projectId' in entry.payload ? [entry.payload.projectId] : []
	);
	if (taskIds.length === 0 && projectIds.length === 0) return [...entries];

	const [hiddenTasks, hiddenProjects] = await Promise.all([
		hiddenFrom(taskSummaries(viewer, taskIds)),
		hiddenFrom(projectSummaries(viewer, projectIds))
	]);

	return entries.map((entry) => {
		if (!isLinkEntry(entry)) return entry;

		if ('taskId' in entry.payload && hiddenTasks.has(entry.payload.taskId)) {
			return { ...entry, payload: { taskId: '', taskTag: '', taskTitle: '' } };
		}
		if ('projectId' in entry.payload && hiddenProjects.has(entry.payload.projectId)) {
			return { ...entry, payload: { projectId: '', projectTag: '', projectName: '' } };
		}
		return entry;
	});
}
