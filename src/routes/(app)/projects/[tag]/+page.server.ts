import { error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	BOARD_COOKIE,
	BOARD_COOKIE_MAX_AGE,
	resolveView,
	serializeBoardPreference
} from '#lib/board-preference.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { listPeople } from '#lib/server/directory/index.js';
import {
	openTicketCount,
	projectTimeline,
	relatedTo,
	unlinkProject
} from '#lib/server/links/index.js';
import {
	fieldsOf,
	firstField,
	orNull,
	rejected,
	archiveProject,
	createTask,
	createTaskInput,
	getProject,
	listStates,
	listTasks,
	moveTask,
	projectProgress,
	readBoardPreference,
	requireProjectRead,
	requireProjectWrite,
	unarchiveProject,
	updateProject,
	updateProjectInput,
	type CreateTaskFailure,
	type MoveTaskFailure,
	type UpdateProjectFailure
} from '#lib/server/projects/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, cookies }) => {
	const user = requireProjectRead(locals.user);

	const found = await getProject(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const project = found.value;

	const canManage = can(user, 'projects.manage');

	// What the viewer can see of the project: an employee gets their own tasks
	// and counts of exactly those (the domain scopes both from the same viewer).
	const [tasks, states, progress, people, related] = await Promise.all([
		listTasks(user, { projectId: project.id }),
		listStates(user),
		projectProgress(user, project.id),
		canManage && project.archivedAt === null
			? listPeople(user.organisationId)
			: Promise.resolve([]),
		// The tickets behind this project, already scoped to what the viewer may
		// see: an employee gets their own, and every count below follows suit.
		relatedTo(user, { kind: 'project', id: project.id })
	]);
	if (!progress.ok) error(404, 'Not found');

	// The person's board preference (#127), cleaned of anything the cookie should
	// not carry. An explicit ?view= wins over it, and is never stored: opening
	// someone's link does not change your default.
	const rawPreference = cookies.get(BOARD_COOKIE);
	const preference = readBoardPreference(
		rawPreference,
		states.map(({ id }) => id)
	);
	if (rawPreference !== undefined && rawPreference !== serializeBoardPreference(preference)) {
		cookies.set(BOARD_COOKIE, serializeBoardPreference(preference), {
			path: '/',
			sameSite: 'lax',
			maxAge: BOARD_COOKIE_MAX_AGE,
			httpOnly: false
		});
	}

	return {
		project,
		descriptionHtml: renderMarkdown(project.description ?? ''),
		tasks,
		// Every column of the board, including the empty ones.
		states: states.map(({ id, name, group, position }) => ({ id, name, group, position })),
		progress: progress.value,
		// The board and the list are two views of the same data; the board is the default (#125).
		view: resolveView(url.searchParams.get('view'), preference.view),
		collapsedStates: preference.states,
		// The permission alone. The page also needs the project not to be archived
		// before it renders any write control: an archived project shows none,
		// not disabled ones.
		canManage,
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		related,
		// The header's summary value: direct plus via tasks, resolved and closed left out.
		openTickets: openTicketCount(related),
		// Unlinking concerns the ticket, so it is `tickets.manage` and it survives
		// the project being archived (#151).
		canUnlink: can(user, 'tickets.manage'),
		// Streamed: nothing above waits for the history. Its live half is the
		// tickets linked to the project itself; the ones that arrive through a
		// task are on that task's rail, not here.
		timeline: projectTimeline(user, project.id, related)
	};
};

const updateFailures: Record<
	Exclude<UpdateProjectFailure, 'project_not_found'>,
	readonly [string | null, () => string]
> = {
	project_archived: [null, m.project_error_archived],
	owner_not_found: ['ownerPersonId', m.project_error_owner_missing],
	duplicate_project_tag: ['projectTag', m.project_error_duplicate_tag]
};

const taskFailures: Record<
	Exclude<CreateTaskFailure, 'project_not_found'>,
	readonly [string | null, () => string]
> = {
	project_archived: [null, m.project_error_archived],
	state_not_found: [null, m.task_error_state_missing],
	duplicate_task_tag: [null, m.action_error_invalid]
};

const moveFailures: Record<Exclude<MoveTaskFailure, 'task_not_found'>, () => string> = {
	project_archived: m.project_error_archived,
	state_not_found: m.task_error_state_missing,
	invalid_neighbours: m.action_error_invalid
};

/** What the board sends for a move: a task, a column and, for a drop, the cards around it. */
const moveInput = z.object({
	taskId: z.uuid(),
	stateId: z.uuid(),
	before: z.uuid().optional(),
	after: z.uuid().optional()
});

/** The project an action targets. Gone, or out of the viewer's scope, reads as missing. */
async function targetOf(user: SessionUser, tag: string) {
	const found = await getProject(user, tag);
	if (!found.ok) error(404, 'Not found');
	return found.value;
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		// Every in-place edit posts only its own field (#226): a key that is absent
		// is left untouched, one that is present and empty clears (where nullable).
		const input: Record<string, unknown> = {};
		if (fields.has('name')) input.name = fields.get('name');
		if (fields.has('description')) input.description = orNull(fields.get('description'));
		if (fields.has('ownerPersonId')) input.ownerPersonId = orNull(fields.get('ownerPersonId'));
		if (fields.has('dueDate')) input.dueDate = orNull(fields.get('dueDate'));
		if (fields.has('projectTag')) input.projectTag = fields.get('projectTag');

		const parsed = updateProjectInput.safeParse(input);
		if (!parsed.success) {
			const field = firstField(parsed.error);
			return rejected(
				'update',
				field === 'name'
					? m.project_error_name_required()
					: field === 'projectTag'
						? m.project_error_tag_invalid()
						: field === 'description'
							? m.project_error_description_too_long()
							: m.action_error_invalid(),
				field
			);
		}

		const project = await targetOf(user, params.tag);
		const outcome = await updateProject(user, project.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			const [field, message] = updateFailures[outcome.error];
			return rejected('update', message(), field);
		}

		return {
			action: 'update' as const,
			// The tag is a URL segment: if it changed, the page has to follow it.
			projectTag: parsed.data.projectTag ?? project.projectTag
		};
	},

	archive: async ({ locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const project = await targetOf(user, params.tag);
		const outcome = await archiveProject(user, project.id);
		if (!outcome.ok) error(404, 'Not found');
		return { action: 'archive' as const };
	},

	// The link belongs to the ticket: `tickets.manage`, open on an archived project.
	// Tickets that arrive through a task are unlinked from the task, never here.
	unlinkTicket: async ({ request, locals, params }) => {
		// Whoever can read the project knows it is there, so they are told plainly: 403.
		const user = requireProjectRead(locals.user);
		if (!can(user, 'tickets.manage')) error(403, 'Forbidden');
		const parsed = z.uuid().safeParse((await fieldsOf(request)).get('recordId'));
		if (!parsed.success) return rejected('unlinkTicket', m.related_unlink_failed());

		const project = await targetOf(user, params.tag);
		const outcome = await unlinkProject(user, {
			ticketId: parsed.data,
			projectId: project.id
		});
		// Already gone, e.g. a second tab removed it first: the reload shows the truth.
		if (!outcome.ok && outcome.error !== 'link_not_found') {
			return rejected('unlinkTicket', m.related_unlink_failed());
		}
		return { action: 'unlinkTicket' as const };
	},

	unarchive: async ({ locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const project = await targetOf(user, params.tag);
		const outcome = await unarchiveProject(user, project.id);
		if (!outcome.ok) error(404, 'Not found');
		return { action: 'unarchive' as const };
	},

	createTask: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		// A title and, from a board column's quick create, the state it opens in;
		// without one the state is the domain's default.
		const parsed = createTaskInput.safeParse({
			title: fields.get('title'),
			stateId: orNull(fields.get('stateId')) ?? undefined
		});
		if (!parsed.success) {
			return rejected('createTask', m.task_error_title_required(), 'title');
		}

		const project = await targetOf(user, params.tag);
		const outcome = await createTask(user, project.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			const [field, message] = taskFailures[outcome.error];
			return rejected('createTask', message(), field);
		}

		return { action: 'createTask' as const, taskTag: outcome.value.taskTag };
	},

	/**
	 * The one write behind the board (#125): the "Move to" menu and a drop both
	 * submit here. With no neighbours the task goes to the end of the column.
	 */
	moveTask: async ({ request, locals }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const parsed = moveInput.safeParse({
			taskId: fields.get('taskId'),
			stateId: fields.get('stateId'),
			before: orNull(fields.get('before')) ?? undefined,
			after: orNull(fields.get('after')) ?? undefined
		});
		if (!parsed.success) return rejected('moveTask', m.action_error_invalid());

		const { taskId, stateId, ...neighbours } = parsed.data;
		const outcome = await moveTask(user, taskId, stateId, neighbours);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			return rejected('moveTask', moveFailures[outcome.error](), 'stateId');
		}

		return { action: 'moveTask' as const };
	}
};
