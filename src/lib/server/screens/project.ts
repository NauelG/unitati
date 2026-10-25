import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { listPeople } from '../directory';
import { openTicketCount, projectTimeline, relatedTo } from '../links';
import { followState } from '../notifications';
import {
	canManageMembers,
	getProject,
	listProjectAttachments,
	listProjectComments,
	listProjectMembers,
	listStates,
	listTasks,
	projectProgress
} from '../projects';
import { failure, success } from '../shared/outcome';
import { projectTime } from '../time';
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
}

/** Picker data. Each list is empty unless the act it serves is allowed (ADR 0050 rule 5). */
export interface ProjectChoices {
	/** Active people: the owner picker and the task assignees. */
	people: { id: string; fullName: string }[];
	/** Who can still be added: an active person who is not a member yet. */
	memberCandidates: { id: string; fullName: string }[];
}

export async function projectScreen(viewer: SessionUser, projectTag: string) {
	if (!PROJECT_READ_PERMISSIONS.some((permission) => can(viewer, permission))) {
		return failure('not_found');
	}

	const found = await getProject(viewer, projectTag);
	if (!found.ok) return failure('not_found');
	const project = found.value;

	const manages = can(viewer, 'projects.manage');
	const archived = project.archivedAt !== null;
	const writable = manages && !archived;
	const may: ProjectMay = {
		edit: writable,
		createTask: writable,
		moveTask: writable,
		comment: writable,
		attach: writable,
		documentPage: writable,
		editMembers: writable && canManageMembers(viewer, project),
		archive: manages && !archived,
		unarchive: manages && archived,
		undocumentPage: manages,
		unlinkTicket: can(viewer, 'tickets.manage')
	};

	// What the viewer can see of the project: an employee gets their own tasks
	// and counts of exactly those (the domain scopes both from the same viewer).
	const [tasks, states, progress, people, related, attachments, members, comments] =
		await Promise.all([
			listTasks(viewer, { projectId: project.id }),
			listStates(viewer),
			projectProgress(viewer, project.id),
			writable ? listPeople(viewer.organisationId) : Promise.resolve([]),
			// The tickets behind this project, already scoped to what the viewer may
			// see: an employee gets their own, and every count below follows suit.
			relatedTo(viewer, { kind: 'project', id: project.id }),
			listProjectAttachments(viewer, project.id),
			listProjectMembers(viewer, project.id),
			listProjectComments(viewer, project.id)
		]);
	if (!progress.ok || !attachments.ok || !members.ok || !comments.ok) return failure('not_found');

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
		// The sum of its tasks' time, by type; null while tracking is off (ADR 0051).
		time: await projectTime(viewer, project.id),
		follow: await followState(viewer, { projectId: project.id }),
		tasks,
		// Every column of the board, including the empty ones. The route resolves the
		// board cookie and `?view=` against them.
		states: states.map(({ id, name, group, position }) => ({ id, name, group, position })),
		progress: progress.value,
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
