import { z } from 'zod';
import { projectTimeline } from '../../links';
import {
	archiveProject,
	canManageMembers,
	createProject,
	createProjectInput,
	getProject,
	listProjects,
	projectProgress,
	projectProgressMany,
	PROJECT_VISIBILITIES,
	setProjectVisibility,
	unarchiveProject,
	updateProject,
	updateProjectInput
} from '../../projects';
import { created, defineEndpoint, notFound, Reply, type Endpoint } from '../registry';
import { paginationMetaSchema, toMeta } from '../shared-schemas';
import {
	bodyRefusal,
	PROJECT_MANAGE,
	PROJECT_READS,
	projectOf,
	projectSchema,
	projectToWire,
	tag,
	withReads,
	writtenProject
} from './project-wire';
import { refusal } from './refusals';
import { timelineEntrySchema, timelineToWire } from './timeline-wire';

/**
 * The project use cases (ADR 0022). Projects are addressed by tag (ADR 0010).
 * Every read starts from the domain's scope, so a key limited to
 * `projects.view.assigned` sees the projects that hold a task assigned to its
 * owner, and a service account (no person) sees none. The write permission is
 * the one the project routes require; archived projects refuse every write with
 * `409 project_archived`, which comes from the domain.
 */

const projectResponse = z.object({ data: projectSchema });

export const listProjectsEndpoint = defineEndpoint({
	id: 'projects.list',
	method: 'GET',
	path: '/projects',
	summary: 'List the projects the key can see.',
	description:
		'Returns one page of projects, the soonest due date first (projects with none last). Active projects by default; send `archived=true` for the archived ones. Filter with `search`; page with `page` and `perPage` (out-of-range values are clamped). A key limited to `projects.view.assigned` sees only the projects that hold a task assigned to its owner, and `progress` counts only those tasks. The response carries `meta` with the totals, counted over what the key can see.',
	example: { archived: 'false', search: 'office', page: 1, perPage: 25 },
	permissions: PROJECT_READS,
	input: z.object({
		archived: z
			.enum(['true', 'false'])
			.transform((value) => value === 'true')
			.optional(),
		search: z.string().optional(),
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({ data: z.array(projectSchema), meta: paginationMetaSchema }),
	handler: async ({ principal, input }) => {
		const result = await listProjects(
			principal,
			{ archived: input.archived, q: input.search },
			{ page: input.page, perPage: input.perPage }
		);
		const counts = await projectProgressMany(
			principal,
			result.rows.map((project) => project.id)
		);

		return {
			data: result.rows.map((project) => projectToWire(project, counts[project.id])),
			meta: toMeta(result)
		};
	}
});

export const getProjectEndpoint = defineEndpoint({
	id: 'projects.get',
	method: 'GET',
	path: '/projects/{tag}',
	summary: 'Get one project by its tag.',
	description:
		'Returns one project, addressed by its tag (for example `PRJ-0007`), with its progress: the task count per state group and `percent`, completed ÷ (tasks − cancelled). A project the key cannot see is answered with `404`, the same as one that does not exist.',
	permissions: PROJECT_READS,
	input: z.object({ tag }),
	output: projectResponse,
	handler: async ({ principal, input }) => {
		const found = await getProject(principal, input.tag);
		if (!found.ok) throw notFound('Project not found.');
		const progress = await projectProgress(principal, found.value.id);
		if (!progress.ok) throw notFound('Project not found.');

		return { data: projectToWire(found.value, progress.value.counts) };
	}
});

export const projectTimelineEndpoint = defineEndpoint({
	id: 'projects.timeline',
	method: 'GET',
	path: '/projects/{tag}/timeline',
	summary: "Read a project's history, newest first.",
	description:
		"Returns the events recorded on the project, newest first: creation, owner and due-date changes, archiving. Tickets are not part of it; read them with `GET /projects/{projectTag}/tickets`. A project's history lists changes to its tasks, so it needs `projects.view`: a key limited to `projects.view.assigned` gets `404`, as it would learn of tasks it cannot see.",
	permissions: ['projects.view'],
	input: z.object({ tag }),
	output: z.object({ data: z.array(timelineEntrySchema) }),
	handler: async ({ principal, input }) => {
		const project = await projectOf(principal, input.tag);
		const items = await projectTimeline(principal, project.id);

		return { data: timelineToWire(items) };
	}
});

export const createProjectEndpoint = defineEndpoint({
	id: 'projects.create',
	method: 'POST',
	path: '/projects',
	summary: 'Create a project.',
	description:
		'Creates a project. `projectTag` is optional: when omitted the next `PRJ-####` is generated, and an explicit one is accepted (ADR 0010). `ownerPersonId` and `dueDate` (`YYYY-MM-DD`) are optional. `visibility` is `organisation` (the default) or `members`; a members-only project starts with the owner and the creator as its members, and an API key with no person has no member to add, so only an admin key sees it afterwards. Answers `201` with the project and a `Location` header. A tag already in use is `409` (`duplicate_project_tag`); an unknown `ownerPersonId` is a `400` on that field.',
	example: { name: 'Office move', description: 'Floor 2 to floor 4', dueDate: '2026-12-01' },
	status: 201,
	permissions: PROJECT_MANAGE,
	input: createProjectInput,
	output: projectResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const outcome = await createProject(actor, input);
		if (!outcome.ok) throw bodyRefusal(outcome.error);

		return created(
			await writtenProject(actor, outcome.value.projectTag),
			`/projects/${outcome.value.projectTag}`
		);
	}
});

export const updateProjectEndpoint = defineEndpoint({
	id: 'projects.update',
	method: 'PATCH',
	path: '/projects/{tag}',
	summary: "Edit a project's details.",
	description:
		"Edits `name`, `description`, `ownerPersonId`, `dueDate`, `projectTag` and `visibility`; every field is optional, and `null` clears the owner, the description or the due date. A change of owner, due date or visibility is recorded in the history. Switching `visibility` to `members` adds the owner, the key's owner and everyone assigned to a task as members; only the project's owner and admins may change it (anybody else gets `404`). Changing the owner of a members-only project adds the new owner as a member. Archiving has its own endpoint. If `projectTag` changes, the response carries the new tag and a `Location` header; the old URL is `404` from then on, with no redirect. A tag already in use is `409`; an archived project is `409 project_archived`.",
	example: { name: 'Office move (phase 2)', dueDate: '2027-01-15' },
	permissions: PROJECT_MANAGE,
	input: updateProjectInput.extend({ tag, visibility: z.enum(PROJECT_VISIBILITIES).optional() }),
	output: projectResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const { tag: currentTag, visibility, ...changes } = input;
		const target = await projectOf(actor, currentTag);

		// Authorise before writing anything, so a refusal leaves nothing half-applied.
		// The fields go first because they are what can fail on their own (a tag in
		// use, an unknown owner); once they are in, switching visibility cannot fail.
		if (visibility !== undefined && !canManageMembers(actor, target)) throw refusal('forbidden');

		const outcome = await updateProject(actor, target.id, changes);
		if (!outcome.ok) throw bodyRefusal(outcome.error);

		if (visibility !== undefined) {
			const changed = await setProjectVisibility(actor, target.id, visibility);
			if (!changed.ok) throw refusal(changed.error);
		}

		const newTag = changes.projectTag ?? currentTag;
		const body = await writtenProject(actor, newTag);
		return newTag === currentTag
			? body
			: new Reply(200, body, { location: `/api/v1/projects/${newTag}` });
	}
});

export const archiveProjectEndpoint = defineEndpoint({
	id: 'projects.archive',
	method: 'POST',
	path: '/projects/{tag}/archive',
	summary: 'Archive a project.',
	description:
		'Makes the project, and its tasks, read-only, and answers `200` with the project. There is no deletion. Archiving an archived project changes nothing and writes no event. `DELETE` on the same address brings it back.',
	permissions: PROJECT_MANAGE,
	input: z.object({ tag }),
	output: projectResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await projectOf(actor, input.tag);
		const outcome = await archiveProject(actor, target.id);
		if (!outcome.ok) throw refusal(outcome.error);
		return writtenProject(actor, input.tag);
	}
});

export const unarchiveProjectEndpoint = defineEndpoint({
	id: 'projects.unarchive',
	method: 'DELETE',
	path: '/projects/{tag}/archive',
	summary: 'Bring an archived project back.',
	description:
		'Makes the project writable again and answers `200` with the project. Unarchiving an active project changes nothing and writes no event.',
	permissions: PROJECT_MANAGE,
	input: z.object({ tag }),
	output: projectResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await projectOf(actor, input.tag);
		const outcome = await unarchiveProject(actor, target.id);
		if (!outcome.ok) throw refusal(outcome.error);
		return writtenProject(actor, input.tag);
	}
});

export const PROJECT_ENDPOINTS: readonly Endpoint[] = [
	listProjectsEndpoint,
	getProjectEndpoint,
	projectTimelineEndpoint,
	createProjectEndpoint,
	updateProjectEndpoint,
	archiveProjectEndpoint,
	unarchiveProjectEndpoint
];
