import { error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	BOARD_COOKIE,
	BOARD_COOKIE_MAX_AGE,
	resolveView,
	serializeBoardPreference
} from '#lib/board-preference.js';
import { attachmentFailureMessage } from '#lib/attachment-errors.js';
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
	addProjectAttachments,
	addProjectComment,
	listProjectComments,
	addProjectMember,
	archiveProject,
	canManageMembers,
	createTask,
	createTaskInput,
	getProject,
	listProjectAttachments,
	listProjectMembers,
	PROJECT_VISIBILITIES,
	readAttachmentForm,
	removeProjectAttachment,
	removeProjectMember,
	setProjectVisibility,
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
	type AddMemberFailure,
	type CreateTaskFailure,
	type MembershipFailure,
	type MoveTaskFailure,
	type RemoveMemberFailure,
	type UpdateProjectFailure
} from '#lib/server/projects/index.js';
import { followState } from '#lib/server/notifications/index.js';
import { followActions } from '../../follow-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, cookies }) => {
	const user = requireProjectRead(locals.user);

	const found = await getProject(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const project = found.value;

	const canManage = can(user, 'projects.manage');
	// Owner and admins change visibility and members (ADR 0042); an archived
	// project is read-only like the rest of it.
	const canEditMembers =
		canManage && canManageMembers(user, project) && project.archivedAt === null;

	// What the viewer can see of the project: an employee gets their own tasks
	// and counts of exactly those (the domain scopes both from the same viewer).
	const [tasks, states, progress, people, related, attachments, members, comments] =
		await Promise.all([
			listTasks(user, { projectId: project.id }),
			listStates(user),
			projectProgress(user, project.id),
			canManage && project.archivedAt === null
				? listPeople(user.organisationId)
				: Promise.resolve([]),
			// The tickets behind this project, already scoped to what the viewer may
			// see: an employee gets their own, and every count below follows suit.
			relatedTo(user, { kind: 'project', id: project.id }),
			listProjectAttachments(user, project.id),
			listProjectMembers(user, project.id),
			listProjectComments(user, project.id)
		]);
	if (!progress.ok || !attachments.ok || !members.ok || !comments.ok) error(404, 'Not found');
	const listed = new Set(members.value.map((member) => member.personId));

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
		follow: await followState(user, { projectId: project.id }),
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
		members: members.value,
		canEditMembers,
		// Who can still be added: an active person who is not on the list yet.
		memberCandidates: canEditMembers
			? people
					.filter((person) => person.active)
					.filter((person) => !listed.has(person.id))
					.map(({ id, fullName }) => ({ id, fullName }))
			: [],
		related,
		attachments: attachments.value,
		comments: comments.value,
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

function commentFailureMessage(error: 'empty_comment' | 'comment_too_long' | 'project_archived') {
	if (error === 'empty_comment') return m.action_error_empty_note();
	if (error === 'comment_too_long') return m.action_error_comment_too_long();
	return m.project_error_archived();
}

const updateFailures: Record<
	Exclude<UpdateProjectFailure, 'project_not_found'>,
	readonly [string | null, () => string]
> = {
	project_archived: [null, m.project_error_archived],
	owner_not_found: ['ownerPersonId', m.project_error_owner_missing],
	duplicate_project_tag: ['projectTag', m.project_error_duplicate_tag]
};

const membershipFailures: Record<Exclude<MembershipFailure, 'project_not_found'>, () => string> = {
	project_archived: m.project_error_archived,
	forbidden: m.project_members_error_forbidden
};

const addMemberFailures: Record<Exclude<AddMemberFailure, 'project_not_found'>, () => string> = {
	...membershipFailures,
	person_not_found: m.project_members_error_person_missing
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

function removeMemberMessage(failure: RemoveMemberFailure): string {
	if (typeof failure === 'object') return m.project_members_error_has_assignments();
	if (failure === 'project_not_found') error(404, 'Not found');
	if (failure === 'is_owner') return m.project_members_error_is_owner();
	if (failure === 'person_not_found') return m.project_members_error_person_missing();
	return membershipFailures[failure]();
}

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
	...followActions(requireProjectRead, async (user, { params }) => {
		const found = await getProject(user, params.tag);
		return found.ok ? { projectId: found.value.id } : null;
	}),
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

	addComment: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const text = (await fieldsOf(request)).get('text');

		const project = await targetOf(user, params.tag);
		const outcome = await addProjectComment(user, project.id, text);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			return rejected('addComment', commentFailureMessage(outcome.error));
		}

		return { action: 'addComment' as const };
	},

	// Both need `projects.manage`; downloading is the route's, open to every reader.
	addAttachments: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const { files } = await readAttachmentForm(request);
		if (files.length === 0) return rejected('addAttachments', m.attachments_pick_none());

		const project = await targetOf(user, params.tag);
		const outcome = await addProjectAttachments(user, project.id, files);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			return rejected('addAttachments', attachmentFailureMessage(outcome.error));
		}

		return { action: 'addAttachments' as const };
	},

	removeAttachment: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const { attachmentId } = await readAttachmentForm(request);
		if (!z.uuid().safeParse(attachmentId).success) {
			return rejected('removeAttachment', m.action_error_invalid());
		}

		// The page's project must be one the viewer can reach; the domain then
		// resolves the attachment inside the organisation.
		await targetOf(user, params.tag);
		const outcome = await removeProjectAttachment(user, attachmentId);
		// Already gone, e.g. a second tab removed it first: the reload shows the truth.
		if (!outcome.ok && outcome.error !== 'attachment_not_found') {
			return rejected('removeAttachment', attachmentFailureMessage(outcome.error));
		}

		return { action: 'removeAttachment' as const };
	},

	// The three membership actions re-check on the server who may change them: the
	// panel hides its controls from everybody else, but a hidden control is not a rule.
	setVisibility: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const parsed = z
			.enum(PROJECT_VISIBILITIES)
			.safeParse((await fieldsOf(request)).get('visibility'));
		if (!parsed.success) return rejected('setVisibility', m.action_error_invalid());

		const project = await targetOf(user, params.tag);
		const outcome = await setProjectVisibility(user, project.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			return rejected('setVisibility', membershipFailures[outcome.error]());
		}

		return { action: 'setVisibility' as const };
	},

	addMember: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const parsed = z.uuid().safeParse((await fieldsOf(request)).get('personId'));
		if (!parsed.success) return rejected('addMember', m.action_error_invalid());

		const project = await targetOf(user, params.tag);
		const outcome = await addProjectMember(user, project.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			return rejected('addMember', addMemberFailures[outcome.error]());
		}

		return { action: 'addMember' as const };
	},

	removeMember: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);
		const parsed = z.uuid().safeParse(fields.get('personId'));
		if (!parsed.success) return rejected('removeMember', m.action_error_invalid());

		const project = await targetOf(user, params.tag);
		const outcome = await removeProjectMember(user, project.id, parsed.data, {
			confirm: fields.get('confirm') === '1'
		});
		if (!outcome.ok) {
			return rejected('removeMember', removeMemberMessage(outcome.error));
		}

		return { action: 'removeMember' as const };
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
