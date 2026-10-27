import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
import { isClosedGroup } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { listPeople } from '../directory';
import { relatedTo, taskTimeline } from '../links';
import { followState } from '../notifications';
import {
	getTask,
	listMilestones,
	listProjectMembers,
	listProjects,
	listStates,
	listTaskAttachments,
	listTaskComments,
	listTasks,
	subtasksOf,
	type State,
	type TaskView
} from '../projects';
import { failure, success } from '../shared/outcome';
import { taskTime } from '../time';
import { activePeople } from './choices';
import { timeSection } from './time';

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
	/** Putting the task in a milestone of its project, or taking it out. */
	setMilestone: boolean;
	/**
	 * Putting the task under another, or promoting it (ADR 0055). Closed on a task
	 * that has subtasks: it cannot become one.
	 */
	setParent: boolean;
	/**
	 * Creating a subtask under this task. Closed on a subtask (one level only) and
	 * on a closed task, which admits no open subtask (ADR 0055 §6).
	 */
	addSubtask: boolean;
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
	/** The task's project's milestones, in their fixed order; empty unless the viewer may set one. */
	milestones: { id: string; name: string }[];
	/**
	 * The tasks this one may go under: of its project, top-level, not itself, and
	 * open ones only for an open task. Empty unless the viewer may set a parent.
	 */
	parents: { id: string; taskTag: string; title: string }[];
}

/** One row of the Subtasks section. */
export interface SubtaskRow {
	taskTag: string;
	title: string;
	stateName: string;
	stateGroup: State['group'];
	assignees: { personId: string; fullName: string }[];
	dueDate: string | null;
}

export async function taskScreen(viewer: SessionUser, taskTag: string) {
	if (!PROJECT_READ_PERMISSIONS.some((permission) => can(viewer, permission))) {
		return failure('not_found');
	}

	const found = await getTask(viewer, taskTag);
	if (!found.ok) return failure('not_found');
	const task = found.value;

	const [attachments, comments, subtasks, parent] = await Promise.all([
		listTaskAttachments(viewer, task.id),
		listTaskComments(viewer, task.id),
		subtasksOf(viewer, task.id),
		task.parent ? getTask(viewer, task.parent.taskTag) : null
	]);
	if (!attachments.ok || !comments.ok) return failure('not_found');

	// Cancelled children and the ones the viewer cannot see count as children too.
	const hasSubtasks = subtasks.length + task.subtasks.restricted > 0;

	// An archived project is read-only: its tasks render no write affordance.
	const writable = can(viewer, 'projects.manage') && !task.projectArchived;
	const may: TaskMay = {
		edit: writable,
		changeState: writable,
		assign: writable,
		setMilestone: writable,
		setParent: writable && !hasSubtasks,
		addSubtask: writable && task.parent === null && !isClosedGroup(task.stateGroup),
		moveToProject: writable,
		comment: writable,
		attach: writable,
		unlinkTicket: can(viewer, 'tickets.manage')
	};

	const choices = await choicesFor(viewer, task, may);
	// Time is logged by `time.log`, not `projects.manage`; only an archived project closes it.
	const time = await timeSection(viewer, { taskId: task.id }, !task.projectArchived);
	const totals = time && hasSubtasks ? await taskTime(viewer, task.id) : null;

	return success({
		task,
		may,
		choices,
		/** The parent's due date, for the warning on a subtask due after it (ADR 0055 §7). */
		parentDueDate: parent?.ok ? parent.value.dueDate : null,
		subtasks: subtasks.map(toSubtaskRow),
		time,
		/** Minutes on the task plus its subtasks; `null` when the task has none, or no time is shown. */
		timeWithSubtasks: totals?.withSubtasksMinutes ?? null,
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

function toSubtaskRow(task: TaskView): SubtaskRow {
	return {
		taskTag: task.taskTag,
		title: task.title,
		stateName: task.stateName,
		stateGroup: task.stateGroup,
		assignees: task.assignees,
		dueDate: task.dueDate
	};
}

async function choicesFor(viewer: SessionUser, task: TaskView, may: TaskMay): Promise<TaskChoices> {
	const [states, people, projects, milestones, siblings] = await Promise.all([
		may.changeState ? listStates(viewer) : [],
		may.assign ? listPeople(viewer.organisationId) : [],
		may.moveToProject ? listProjects(viewer) : [],
		may.setMilestone ? listMilestones(viewer, task.projectId) : null,
		may.setParent ? listTasks(viewer, { projectId: task.projectId }) : []
	]);
	// The domain refuses the rest (a subtask, or a closed parent of an open task);
	// the picker does not offer them in the first place.
	const parents = siblings.filter(
		(candidate) =>
			candidate.id !== task.id &&
			candidate.parent === null &&
			(isClosedGroup(task.stateGroup) || !isClosedGroup(candidate.stateGroup))
	);

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
			.map(({ id, projectTag, name }) => ({ id, projectTag, name })),
		milestones: milestones?.ok ? milestones.value.map(({ id, name }) => ({ id, name })) : [],
		parents: parents.map(({ id, taskTag, title }) => ({ id, taskTag, title }))
	};
}

async function railOf(viewer: SessionUser, taskId: string) {
	const related = await relatedTo(viewer, { kind: 'task', id: taskId });

	return { timeline: await taskTimeline(viewer, taskId, related), related };
}
