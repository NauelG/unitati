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
 * A subtask's own history names its parent the same way (`task.parent.changed`,
 * `task.created` with `parent`, ADR 0055), and seeing a subtask never grants
 * sight of its parent: an employee assigned to the child only reads "a restricted
 * task" there.
 *
 * The work is `projects`' to protect, so the rule lives here and the callers
 * (`service-desk`'s thread, `links`' organisation feed and task timeline) apply
 * it. A record that no longer exists is left as written: there is nothing left to
 * protect, and the history is not rewritten for a record that is gone.
 */

type LinkVerb =
	'link.task.added' | 'link.task.removed' | 'link.project.added' | 'link.project.removed';

const isLinkEntry = (entry: TimelineEntry): entry is Extract<TimelineEntry, { verb: LinkVerb }> =>
	entry.verb === 'link.task.added' ||
	entry.verb === 'link.task.removed' ||
	entry.verb === 'link.project.added' ||
	entry.verb === 'link.project.removed';

type ParentVerb = 'task.parent.changed' | 'task.created';
type ParentEntry = Extract<TimelineEntry, { verb: ParentVerb }>;
/** The parent snapshot of those entries (`activity/payload.ts`). */
type ParentSnapshot = { taskId: string; taskTag: string; title: string };

const isParentEntry = (entry: TimelineEntry): entry is ParentEntry =>
	entry.verb === 'task.parent.changed' || entry.verb === 'task.created';

/** The tasks a parent entry names. */
function refsOf(entry: ParentEntry): ParentSnapshot[] {
	if (entry.verb === 'task.created') return entry.payload.parent ? [entry.payload.parent] : [];
	return [entry.payload.from, entry.payload.to].flatMap((ref) => (ref ? [ref] : []));
}

const RESTRICTED_TASK: ParentSnapshot = { taskId: '', taskTag: '', title: '' };

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
	const parents = (entries as readonly TimelineEntry[]).filter(isParentEntry).flatMap(refsOf);
	const taskIds = [
		...links.flatMap((entry) => ('taskId' in entry.payload ? [entry.payload.taskId] : [])),
		...parents.map((ref) => ref.taskId)
	];
	const projectIds = links.flatMap((entry) =>
		'projectId' in entry.payload ? [entry.payload.projectId] : []
	);
	if (taskIds.length === 0 && projectIds.length === 0) return [...entries];

	const [hiddenTasks, hiddenProjects] = await Promise.all([
		hiddenFrom(taskSummaries(viewer, taskIds)),
		hiddenFrom(projectSummaries(viewer, projectIds))
	]);

	const shown = (ref: ParentSnapshot | null) =>
		ref && hiddenTasks.has(ref.taskId) ? RESTRICTED_TASK : ref;

	return entries.map((entry) => {
		if (entry.verb === 'task.parent.changed') {
			const { from, to } = entry.payload;
			return { ...entry, payload: { from: shown(from), to: shown(to) } };
		}
		if (entry.verb === 'task.created' && entry.payload.parent) {
			return { ...entry, payload: { ...entry.payload, parent: shown(entry.payload.parent)! } };
		}
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
