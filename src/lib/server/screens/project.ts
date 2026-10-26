import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { listPeople } from '../directory';
import { openTicketCount, projectTimeline, redactTimeRows, relatedTo } from '../links';
import { followState } from '../notifications';
import {
	canManageMembers,
	getProject,
	listProjectAttachments,
	listProjectComments,
	listProjectMembers,
	listMilestones,
	listStates,
	listTasks,
	projectProgress
} from '../projects';
import { failure, success } from '../shared/outcome';
import type { Page, PageRequest } from '../shared/pagination';
import {
	projectEntries,
	projectTime,
	reportScope,
	type ProjectTime,
	type ReportRow
} from '../time';
import { activePeople } from './choices';

/**
 * What the viewer may do on this project, with its state already applied
 * (ADR 0050 rule 4). Archiving closes the writable acts; `archive`/`unarchive`
 * (one or the other, by state), `undocumentPage` and `unlinkTicket` stay open on
 * an archived project (#151). The domain's writes stay the authority.
 */
export interface ProjectMay {
	/** In-place edits of the header and the description. */
	edit: boolean;
	createTask: boolean;
	/** Dragging a card to another column, or reordering it. */
	moveTask: boolean;
	/** Creating, editing and deleting milestones, and the task creation dialog's milestone pick. */
	manageMilestones: boolean;
	comment: boolean;
	/** Adding and removing attachments. */
	attach: boolean;
	documentPage: boolean;
	/** Visibility and members: the owner and the admins (ADR 0042). */
	editMembers: boolean;
	archive: boolean;
	unarchive: boolean;
	undocumentPage: boolean;
	unlinkTicket: boolean;
	/** Following the project into `/time`, everybody's time: `time.manage`, while tracking is on (#379). */
	openTimeReport: boolean;
}

/** Picker data. Each list is empty unless the act it serves is allowed (ADR 0050 rule 5). */
export interface ProjectChoices {
	/** Active people: the owner picker and the task assignees. */
	people: { id: string; fullName: string }[];
	/** Who can still be added: an active person who is not a member yet. */
	memberCandidates: { id: string; fullName: string }[];
}

/** The Time section of the project's rail (ADR 0052, #379), as the screen hands it to the page. */
export interface ProjectTimeSection extends ProjectTime {
	/**
	 * One page of the entries behind the total, read-only: they are edited on
	 * the task screen. Titles the viewer cannot read are blanked (ADR 0050).
	 */
	entries: Page<ReportRow>;
}

/** The rail is narrow: a short page of entries, the rest a click away. */
export const PROJECT_TIME_PER_PAGE = 10;

async function projectTimeSection(
	viewer: SessionUser,
	projectId: string,
	request: PageRequest
): Promise<ProjectTimeSection | null> {
	const [time, entries] = await Promise.all([
		projectTime(viewer, projectId),
		projectEntries(viewer, projectId, { perPage: PROJECT_TIME_PER_PAGE, ...request })
	]);
	if (!time || !entries) return null;
	return { ...time, entries: { ...entries, rows: await redactTimeRows(viewer, entries.rows) } };
}

export async function projectScreen(
	viewer: SessionUser,
	projectTag: string,
	options: { time?: PageRequest; milestone?: string } = {}
) {
	if (!PROJECT_READ_PERMISSIONS.some((permission) => can(viewer, permission))) {
		return failure('not_found');
	}

	const found = await getProject(viewer, projectTag);
	if (!found.ok) return failure('not_found');
	const project = found.value;

	// The sum of its tasks' time, by type, and the entries behind it; null while
	// tracking is off (ADR 0052). Everybody's entries, notes included: whoever reads
	// the project with `time.log` already reads each one on its task, because every
	// role that logs time also holds `projects.view` (pinned in `permissions.spec.ts`).
	// A title the viewer cannot read is still blanked (#379).
	const time = await projectTimeSection(viewer, project.id, options.time ?? {});

	const manages = can(viewer, 'projects.manage');
	const archived = project.archivedAt !== null;
	const writable = manages && !archived;
	const may: ProjectMay = {
		edit: writable,
		createTask: writable,
		moveTask: writable,
		manageMilestones: writable,
		comment: writable,
		attach: writable,
		documentPage: writable,
		editMembers: writable && canManageMembers(viewer, project),
		archive: manages && !archived,
		unarchive: manages && archived,
		undocumentPage: manages,
		unlinkTicket: can(viewer, 'tickets.manage'),
		openTimeReport: time !== null && reportScope(viewer) === 'all'
	};

	// What the viewer can see of the project: an employee gets their own tasks
	// and counts of exactly those (the domain scopes both from the same viewer).
	const [tasks, states, progress, milestones, people, related, attachments, members, comments] =
		await Promise.all([
			// `milestone` narrows the board and the list only: the header's progress below
			// is the whole project's and does not move with the filter.
			listTasks(viewer, { projectId: project.id, milestone: options.milestone }),
			listStates(viewer),
			projectProgress(viewer, project.id),
			listMilestones(viewer, project.id),
			writable ? listPeople(viewer.organisationId) : Promise.resolve([]),
			// The tickets behind this project, already scoped to what the viewer may
			// see: an employee gets their own, and every count below follows suit.
			relatedTo(viewer, { kind: 'project', id: project.id }),
			listProjectAttachments(viewer, project.id),
			listProjectMembers(viewer, project.id),
			listProjectComments(viewer, project.id)
		]);
	if (!progress.ok || !milestones.ok || !attachments.ok || !members.ok || !comments.ok)
		return failure('not_found');

	const listed = new Set(members.value.map((member) => member.personId));
	const active = activePeople(people);
	const choices: ProjectChoices = {
		people: active,
		memberCandidates: may.editMembers ? active.filter((person) => !listed.has(person.id)) : []
	};

	return success({
		project,
		may,
		choices,
		// How much of the project the viewer sees: everything, or only the work assigned to them.
		scope: can(viewer, 'projects.view') ? ('all' as const) : ('assigned' as const),
		time,
		follow: await followState(viewer, { projectId: project.id }),
		tasks,
		// Every column of the board, including the empty ones. The route resolves the
		// board cookie and `?view=` against them.
		states: states.map(({ id, name, group, position }) => ({ id, name, group, position })),
		progress: progress.value,
		milestones: milestones.value,
		// The filter in force: a milestone id, `none`, or null for the whole project.
		milestoneFilter: options.milestone ?? null,
		members: members.value,
		related,
		attachments: attachments.value,
		comments: comments.value,
		// The header's summary value: direct plus via tasks, resolved and closed left out.
		openTickets: openTicketCount(related),
		// Slow, so returned unawaited: the route decides whether to stream it (#89). Its
		// live half is the tickets linked to the project itself; the ones that arrive
		// through a task are on that task's rail, not here.
		timeline: projectTimeline(viewer, project.id, related)
	});
}

export type ProjectScreen = Extract<
	Awaited<ReturnType<typeof projectScreen>>,
	{ ok: true }
>['value'];
