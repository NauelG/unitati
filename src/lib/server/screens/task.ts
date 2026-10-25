import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { listPeople } from '../directory';
import { relatedTo, taskTimeline } from '../links';
import { followState } from '../notifications';
import {
	getTask,
	listProjectMembers,
	listProjects,
	listStates,
	listTaskAttachments,
	listTaskComments,
	type State
} from '../projects';
import { failure, success } from '../shared/outcome';
import { activePeople } from './choices';

/**
 * What the viewer may do on this task, with the record's state already applied
 * (ADR 0050 rule 4). Every act but `unlinkTicket` is closed once the project is
 * archived; unlinking concerns the ticket, so it asks for `tickets.manage` and
 * survives archiving (#151). The domain's writes stay the authority.
 */
export interface TaskMay {
	/** In-place edits: title, code, description, due date. */
	edit: boolean;
	changeState: boolean;
	assign: boolean;
	moveToProject: boolean;
	comment: boolean;
	/** Adding and removing attachments. */
	attach: boolean;
	unlinkTicket: boolean;
}

/** Picker data. Each list is empty unless the act it serves is allowed (ADR 0050 rule 5). */
export interface TaskChoices {
	states: { id: string; name: string; group: State['group'] }[];
	/** Active people; on a members-only project, only its members (ADR 0042). */
	people: { id: string; fullName: string }[];
	/** The destinations of "move to project": in scope and not this one. */
	projects: { id: string; projectTag: string; name: string }[];
}

export async function taskScreen(viewer: SessionUser, taskTag: string) {
	if (!PROJECT_READ_PERMISSIONS.some((permission) => can(viewer, permission))) {
		return failure('not_found');
	}

	const found = await getTask(viewer, taskTag);
	if (!found.ok) return failure('not_found');
	const task = found.value;

	const [attachments, comments] = await Promise.all([
		listTaskAttachments(viewer, task.id),
		listTaskComments(viewer, task.id)
	]);
	if (!attachments.ok || !comments.ok) return failure('not_found');

	// An archived project is read-only: its tasks render no write affordance.
	const writable = can(viewer, 'projects.manage') && !task.projectArchived;
	const may: TaskMay = {
		edit: writable,
		changeState: writable,
		assign: writable,
		moveToProject: writable,
		comment: writable,
		attach: writable,
		unlinkTicket: can(viewer, 'tickets.manage')
	};

	const choices = await choicesFor(viewer, task, may);

	return success({
		task,
		may,
		choices,
		follow: await followState(viewer, { taskId: task.id }),
		attachments: attachments.value,
		comments: comments.value,
		// Slow, so returned unawaited: the route decides whether to stream it (#89).
		// The live half, the tickets linked to this task with the status they have
		// today, is merged in at read time and writes nothing on the task (ADR 0009).
		rail: railOf(viewer, task.id)
	});
}

export type TaskScreen = Extract<Awaited<ReturnType<typeof taskScreen>>, { ok: true }>['value'];

async function choicesFor(
	viewer: SessionUser,
	task: { projectId: string; projectVisibility: string },
	may: TaskMay
): Promise<TaskChoices> {
	const [states, people, projects] = await Promise.all([
		may.changeState ? listStates(viewer) : [],
		may.assign ? listPeople(viewer.organisationId) : [],
		may.moveToProject ? listProjects(viewer) : []
	]);

	// On a members-only project only its members can be put on the task (ADR 0042),
	// so the picker offers nobody else; the domain refuses the rest regardless.
	const members =
		may.assign && task.projectVisibility === 'members'
			? await listProjectMembers(viewer, task.projectId)
			: null;
	const listed = members?.ok ? new Set(members.value.map((member) => member.personId)) : null;
	const assignable = listed ? people.filter((person) => listed.has(person.id)) : people;

	return {
		states: states.map(({ id, name, group }) => ({ id, name, group })),
		people: activePeople(assignable),
		projects: projects
			.filter((project) => project.id !== task.projectId)
			.map(({ id, projectTag, name }) => ({ id, projectTag, name }))
	};
}

async function railOf(viewer: SessionUser, taskId: string) {
	const related = await relatedTo(viewer, { kind: 'task', id: taskId });

	return { timeline: await taskTimeline(viewer, taskId, related), related };
}
