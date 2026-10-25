import type { OrgActivityEntry } from '../activity';
import type { SessionUser } from '../auth/guards';
import { projectSummaries, redactWorkEntries, taskSummaries } from '../projects';

/**
 * The organisation feed as a viewer may read it (ADR 0042). The rule for the
 * link entries themselves, `redactWorkEntries`, belongs to `projects`.
 */

/** The ids among `ids` that exist and that `inScope` says the viewer cannot open. */
async function hiddenFrom(
	summaries: Promise<{ id: string; inScope: boolean }[]>
): Promise<Set<string>> {
	return new Set((await summaries).filter((record) => !record.inScope).map((record) => record.id));
}

/**
 * The organisation feed without the entries about work the viewer cannot see, and
 * with its link entries redacted. Dropped rather than redacted for entries that
 * target the task or project itself: their sentence is made of its title.
 */
export async function visibleFeed(
	viewer: SessionUser,
	entries: readonly OrgActivityEntry[]
): Promise<OrgActivityEntry[]> {
	const taskIds = entries.flatMap((entry) => (entry.taskId ? [entry.taskId] : []));
	const projectIds = entries.flatMap((entry) => (entry.projectId ? [entry.projectId] : []));

	const [hiddenTasks, hiddenProjects] = await Promise.all([
		taskIds.length > 0 ? hiddenFrom(taskSummaries(viewer, taskIds)) : new Set<string>(),
		projectIds.length > 0 ? hiddenFrom(projectSummaries(viewer, projectIds)) : new Set<string>()
	]);

	const kept = entries.filter(
		(entry) =>
			!(entry.taskId && hiddenTasks.has(entry.taskId)) &&
			!(entry.projectId && hiddenProjects.has(entry.projectId))
	);

	return redactWorkEntries(viewer, kept);
}
