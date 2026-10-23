import { z } from 'zod';
import { PAGE_TITLE_MAX, SPACE_AUDIENCES } from '#lib/domain/knowledge.js';
import { can } from '../../access/permissions';
import {
	archivePage,
	createPage,
	getPageByTag,
	getRevision,
	listSpaces,
	listSpaceTree,
	movePage,
	pageRevisions,
	previewMove,
	publishPage,
	savePage,
	searchPages,
	unarchivePage,
	type PageView,
	type Placement,
	type StaleRevision,
	type TreeEntry
} from '../../knowledge';
import { pageWindow } from '../../shared/pagination';
import type { ApiPrincipal } from '../keys';
import { ApiError, created, defineEndpoint, notFound, type Endpoint } from '../registry';
import { named, paginationMetaSchema, toMeta } from '../shared-schemas';
import { invalidField, refusal } from './refusals';

/**
 * The knowledge base use cases (ADR 0022, ADR 0031). Pages are addressed by their
 * immutable `DOC-####` tag and spaces by UUID; no page UUID is in any request or
 * response. Every read starts from the domain's scope (`knowledge/scope.ts`), so
 * audience, drafts and archived pages are filtered in the query, never here.
 * Writes carry a required `baseRevision` and answer `409 stale_revision` when
 * the page moved on (ADR 0046).
 */

const READ = ['knowledge.view'] as const;
const MANAGE = ['knowledge.manage'] as const;

const tag = z.string().min(1);
const timestamp = z.iso.datetime();
const pageTitle = z.string().trim().min(1).max(PAGE_TITLE_MAX);
const archivedFlag = z
	.enum(['true', 'false'])
	.transform((value) => value === 'true')
	.optional();

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const STATUSES = ['draft', 'published', 'archived'] as const;

const spaceSchema = named(
	'Space',
	z.object({
		id: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		audience: z.enum(SPACE_AUDIENCES),
		/** The pages this key can read in the space. */
		pageCount: z.number(),
		archivedAt: timestamp.nullable()
	})
);

const treeEntrySchema = named(
	'TreeEntry',
	z.object({
		tag: z.string(),
		title: z.string(),
		parentTag: z.string().nullable(),
		/** 0 is the space root. */
		depth: z.number(),
		status: z.enum(STATUSES)
	})
);

const pageHitSchema = named(
	'PageHit',
	z.object({ tag: z.string(), title: z.string(), spaceName: z.string(), excerpt: z.string() })
);

const pageSchema = named(
	'Page',
	z.object({
		tag: z.string(),
		title: z.string(),
		/** Markdown. */
		body: z.string(),
		revision: z.number(),
		/** The name of the person or service account that saved this revision; `null` once the person is deleted. */
		revisionAuthorName: z.string().nullable(),
		revisedAt: timestamp,
		status: z.enum(STATUSES),
		publishedAt: timestamp.nullable(),
		archivedAt: timestamp.nullable(),
		createdAt: timestamp,
		updatedAt: timestamp,
		space: z.object({
			id: z.string(),
			name: z.string(),
			audience: z.enum(SPACE_AUDIENCES)
		}),
		parentTag: z.string().nullable(),
		/** The breadcrumb: root first, the parent last. */
		path: z.array(z.object({ tag: z.string(), title: z.string() }))
	})
);

const revisionSchema = named(
	'Revision',
	z.object({
		number: z.number(),
		title: z.string(),
		authorName: z.string().nullable(),
		createdAt: timestamp
	})
);

const revisionWithBodySchema = named(
	'RevisionWithBody',
	revisionSchema.extend({ body: z.string() })
);

const pageResponse = z.object({ data: pageSchema });

/* -------------------------------------------------------------------------- */
/* Wire                                                                       */
/* -------------------------------------------------------------------------- */

function pageToWire(view: PageView): z.input<typeof pageSchema> {
	return {
		tag: view.tag,
		title: view.title,
		body: view.body,
		revision: view.revision,
		revisionAuthorName: view.revisionAuthorName,
		revisedAt: view.revisedAt.toISOString(),
		status: view.status,
		publishedAt: view.publishedAt?.toISOString() ?? null,
		archivedAt: view.archivedAt?.toISOString() ?? null,
		createdAt: view.createdAt.toISOString(),
		updatedAt: view.updatedAt.toISOString(),
		space: { id: view.space.id, name: view.space.name, audience: view.space.audience },
		parentTag: view.path.at(-1)?.tag ?? null,
		path: view.path.map(({ tag: pathTag, title }) => ({ tag: pathTag, title }))
	};
}

/** Flat rows ordered by `(parent, position)` into a preorder walk, with each page's depth and parent tag. */
function treeToWire(entries: readonly TreeEntry[]): z.input<typeof treeEntrySchema>[] {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const children = new Map<string | null, TreeEntry[]>();
	for (const entry of entries) {
		// A parent the read did not return is treated as the root rather than losing the page.
		const key = entry.parentId !== null && byId.has(entry.parentId) ? entry.parentId : null;
		children.set(key, [...(children.get(key) ?? []), entry]);
	}

	const out: z.input<typeof treeEntrySchema>[] = [];
	const walk = (parentId: string | null, parentTag: string | null, depth: number) => {
		for (const entry of children.get(parentId) ?? []) {
			out.push({ tag: entry.tag, title: entry.title, parentTag, depth, status: entry.status });
			walk(entry.id, entry.tag, depth + 1);
		}
	};
	walk(null, null, 0);
	return out;
}

/* -------------------------------------------------------------------------- */
/* Reading and writing helpers                                                */
/* -------------------------------------------------------------------------- */

/**
 * The domain reads need `knowledge.view`, and a key scoped to `knowledge.manage`
 * alone may not hold it. It is added for the call; `can()` still intersects with
 * the owner's role, so this never reaches a page the owner could not read.
 */
function withReads(principal: ApiPrincipal): ApiPrincipal {
	return { ...principal, scopes: [...new Set([...principal.scopes, ...READ])] };
}

const isStaff = (principal: ApiPrincipal) => can(principal, 'knowledge.manage');

/** The page a call targets, by its tag. Out of scope reads as missing. */
async function pageOf(actor: ApiPrincipal, pageTag: string): Promise<PageView> {
	const found = await getPageByTag(actor, pageTag);
	if (!found.ok) throw notFound('Page not found.');
	return found.value;
}

/** The page after a write, in the wire shape. The write succeeded, so a miss is a bug, not a 404. */
async function writtenPage(actor: ApiPrincipal, pageTag: string) {
	const found = await getPageByTag(actor, pageTag);
	if (!found.ok) throw new Error(`Page ${pageTag} vanished after a write.`);
	return { data: pageToWire(found.value) };
}

/** A tag in the body that points at no readable page is the field's fault, not a missing resource. */
async function tagToId(actor: ApiPrincipal, field: string, pageTag: string): Promise<string> {
	const found = await getPageByTag(actor, pageTag);
	if (!found.ok) throw invalidField(field, 'Page not found.');
	return found.value.id;
}

const FIELD_FAILURES: Record<string, readonly [string, string]> = {
	space_not_found: ['spaceId', 'Space not found.'],
	parent_not_found: ['parentTag', 'Parent page not found.'],
	body_too_long: ['body', 'The body is too long.']
};

/** A domain failure as the envelope's refusal; the ones that name a body field are a `400` on it. */
function writeRefusal(failure: string): ApiError {
	if (failure === 'not_found') return notFound();
	const field = FIELD_FAILURES[failure];
	return field ? invalidField(field[0], field[1]) : refusal(failure);
}

function staleRevision(stale: StaleRevision): ApiError {
	return new ApiError(409, 'stale_revision', 'The page changed since it was read.', undefined, {
		revision: stale.revision,
		authorName: stale.authorName,
		savedAt: stale.savedAt.toISOString()
	});
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export const listSpacesEndpoint = defineEndpoint({
	id: 'knowledge.spaces.list',
	method: 'GET',
	path: '/spaces',
	summary: 'List the knowledge spaces the key can read.',
	description:
		'Returns every space the key may read, ordered by name, unpaged. A key without `knowledge.manage` reads only `portal` spaces, and `pageCount` counts the published pages. With `knowledge.manage`, both audiences are listed and `pageCount` includes drafts. `archived=true` returns only archived spaces; it is honoured for keys with `knowledge.manage` and ignored otherwise.',
	example: { archived: 'false' },
	permissions: READ,
	input: z.object({ archived: archivedFlag }),
	output: z.object({ data: z.array(spaceSchema) }),
	handler: async ({ principal, input }) => {
		const onlyArchived = input.archived === true && isStaff(principal);
		const spaces = await listSpaces(principal, { includeArchived: onlyArchived });

		return {
			data: spaces
				.filter((space) => !onlyArchived || space.archivedAt !== null)
				.map((space) => ({
					id: space.id,
					name: space.name,
					description: space.description,
					audience: space.audience,
					pageCount: space.pageCount,
					archivedAt: space.archivedAt?.toISOString() ?? null
				}))
		};
	}
});

export const spaceTreeEndpoint = defineEndpoint({
	id: 'knowledge.spaces.pages',
	method: 'GET',
	path: '/spaces/{id}/pages',
	summary: "Read a space's page tree.",
	description:
		"Returns the space's pages as a flat array in preorder: a parent, then its children in sibling order, recursively. `depth` is 0 at the space root and `parentTag` is `null` there. Sibling order is the array order. A space the key cannot read, or that does not exist, is `404`. With `knowledge.manage`, drafts are included and `archived=true` returns only the archived pages; an archived page under a live parent keeps its real `depth` and `parentTag` although that parent is not in the response. `archived` is ignored for other keys. Unpaged.",
	permissions: READ,
	input: z.object({ id: z.string().min(1), archived: archivedFlag }),
	output: z.object({ data: z.array(treeEntrySchema) }),
	handler: async ({ principal, input }) => {
		// The domain answers an empty tree for a missing space and for an unreadable one.
		const spaces = await listSpaces(principal, { includeArchived: true });
		if (!spaces.some((space) => space.id === input.id)) throw notFound('Space not found.');

		const staff = isStaff(principal);
		const onlyArchived = input.archived === true && staff;
		const entries = await listSpaceTree(principal, input.id, { includeArchived: onlyArchived });
		const tree = treeToWire(entries);

		return { data: onlyArchived ? tree.filter((entry) => entry.status === 'archived') : tree };
	}
});

export const searchPagesEndpoint = defineEndpoint({
	id: 'knowledge.pages.search',
	method: 'GET',
	path: '/pages',
	summary: 'Search the knowledge base.',
	description:
		'Full-text search over the pages the key can read, ranked by relevance. `search` is required, at least 3 characters; `spaceId` narrows to one space; `limit` is 1 to 25 (default 10). The answer has no `meta`: the search ranks with a limit and has no total, an exception to the pagination convention. Drafts, archived pages and pages of `staff` spaces never match for a key without `knowledge.manage`. To list pages without a term, read a space tree.',
	example: { search: 'vpn', limit: 10 },
	permissions: READ,
	input: z.object({
		search: z.string().trim().min(3),
		spaceId: z.uuid().optional(),
		limit: z.coerce.number().int().min(1).max(25).default(10)
	}),
	output: z.object({ data: z.array(pageHitSchema) }),
	handler: async ({ principal, input }) => ({
		data: await searchPages(principal, input.search, {
			limit: input.limit,
			spaceId: input.spaceId
		})
	})
});

export const getPageEndpoint = defineEndpoint({
	id: 'knowledge.pages.get',
	method: 'GET',
	path: '/pages/{tag}',
	summary: 'Get one page by its tag.',
	description:
		'Returns one page, addressed by its tag (for example `DOC-0042`, in any case), with its markdown body, current `revision` and breadcrumb. A key with `knowledge.manage` also reads drafts and archived pages; any other key reads only published, non-archived pages of `portal` spaces. Anything else is `404`.',
	permissions: READ,
	input: z.object({ tag }),
	output: pageResponse,
	handler: async ({ principal, input }) => ({
		data: pageToWire(await pageOf(principal, input.tag))
	})
});

export const listRevisionsEndpoint = defineEndpoint({
	id: 'knowledge.pages.revisions',
	method: 'GET',
	path: '/pages/{tag}/revisions',
	summary: "Read a page's revision history.",
	description:
		"Returns the page's revisions, newest first, without bodies; read one with `GET /pages/{tag}/revisions/{number}`. Page with `page` and `perPage` (out-of-range values are clamped). `authorName` is the person's or service account's name, `null` once the person is deleted. Archived pages keep their history readable.",
	example: { page: 1, perPage: 25 },
	permissions: MANAGE,
	input: z.object({
		tag,
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({ data: z.array(revisionSchema), meta: paginationMetaSchema }),
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await pageOf(actor, input.tag);
		const result = await pageRevisions(
			actor,
			target.id,
			pageWindow({ page: input.page, perPage: input.perPage })
		);
		if (!result.ok) throw notFound('Page not found.');

		return {
			data: result.value.rows.map((row) => ({
				number: row.number,
				title: row.title,
				authorName: row.authorName,
				createdAt: row.createdAt.toISOString()
			})),
			meta: toMeta(result.value)
		};
	}
});

export const getRevisionEndpoint = defineEndpoint({
	id: 'knowledge.pages.revision',
	method: 'GET',
	path: '/pages/{tag}/revisions/{number}',
	summary: 'Read one revision of a page, with its body.',
	description:
		'Returns one revision with its markdown body. An unknown number is `404`. To restore a revision, read it here and save it with `PATCH /pages/{tag}` and the current `baseRevision`.',
	permissions: MANAGE,
	input: z.object({ tag, number: z.coerce.number().int() }),
	output: z.object({ data: revisionWithBodySchema }),
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await pageOf(actor, input.tag);
		const found = await getRevision(actor, target.id, input.number);
		if (!found.ok) throw notFound('Revision not found.');

		return {
			data: {
				number: found.value.number,
				title: found.value.title,
				authorName: found.value.authorName,
				createdAt: found.value.createdAt.toISOString(),
				body: found.value.body
			}
		};
	}
});

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export const createPageEndpoint = defineEndpoint({
	id: 'knowledge.pages.create',
	method: 'POST',
	path: '/pages',
	summary: 'Create a draft page.',
	description:
		'Creates a **draft** at the end of its siblings, with revision 1. There is no publish flag: publish with `POST /pages/{tag}/publish`, so a create cannot half-succeed. `parentTag` is `null` (the default) for the space root. An unknown space is a `400` on `spaceId`, an unknown parent a `400` on `parentTag`, a body over the limit a `400` on `body`; an archived space or parent is `409`. Answers `201` with the page and a `Location` header.',
	example: { spaceId: '0c1f6a0e-3f3a-4c5e-9d58-6f7a2f1b9a10', title: 'VPN setup', body: '# VPN' },
	status: 201,
	permissions: MANAGE,
	input: z.object({
		spaceId: z.uuid(),
		parentTag: z.string().min(1).nullable().default(null),
		title: pageTitle,
		body: z.string().default('')
	}),
	output: pageResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const parentId =
			input.parentTag === null ? null : await tagToId(actor, 'parentTag', input.parentTag);

		const outcome = await createPage(actor, {
			spaceId: input.spaceId,
			parentId,
			title: input.title,
			body: input.body
		});
		if (!outcome.ok) throw writeRefusal(outcome.error);

		return created(await writtenPage(actor, outcome.value.tag), `/pages/${outcome.value.tag}`);
	}
});

export const updatePageEndpoint = defineEndpoint({
	id: 'knowledge.pages.update',
	method: 'PATCH',
	path: '/pages/{tag}',
	summary: "Edit a page's title and body.",
	description:
		'Saves `title` and/or `body` as a new revision; the field left out keeps its current value, and at least one must be present. `baseRevision` is required: the `revision` the client read. If the page moved on, the answer is `409 stale_revision` with `details: { revision, authorName, savedAt }` and nothing is written (ADR 0046). Saving content identical to the current one writes no revision and answers `200` with the same `revision`. A published page stays published; an archived page is `409 archived`.',
	example: { title: 'VPN setup (v2)', body: '# VPN\n\nUse the new gateway.', baseRevision: 3 },
	permissions: MANAGE,
	input: z
		.object({
			tag,
			title: pageTitle.optional(),
			body: z.string().optional(),
			baseRevision: z.number().int().positive()
		})
		.refine((value) => value.title !== undefined || value.body !== undefined, {
			message: 'Send a title, a body, or both.'
		}),
	output: pageResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const current = await pageOf(actor, input.tag);

		const outcome = await savePage(actor, current.id, {
			title: input.title ?? current.title,
			body: input.body ?? current.body,
			baseRevision: input.baseRevision
		});
		if (!outcome.ok) {
			if (typeof outcome.error === 'object') throw staleRevision(outcome.error);
			throw writeRefusal(outcome.error);
		}

		return writtenPage(actor, current.tag);
	}
});

const placementSchema = z.union([
	z.strictObject({ before: z.string().min(1) }),
	z.strictObject({ after: z.string().min(1) })
]);

export const movePageEndpoint = defineEndpoint({
	id: 'knowledge.pages.move',
	method: 'POST',
	path: '/pages/{tag}/move',
	summary: 'Move or reorder a page.',
	description:
		'Moves the page with its whole subtree under `parentTag` (`null` is the space root) in `spaceId`, across spaces too. Without `position` it lands last among its new siblings; `{ "before": tag }` or `{ "after": tag }` puts it next to a sibling. Reordering is the same call with the current `spaceId` and `parentTag`. When the move changes the audience (`staff` and `portal`) and `confirmedCount` is absent, the answer is `409 confirmation_required` with `details: { subtreeCount, fromAudience, toAudience }`; repeat the call with `confirmedCount: subtreeCount`. If the subtree changed in between, `409 count_changed` with the same details recomputed. A move under the page itself or a descendant is `409 cycle`; a `position` that is not a sibling is `409 not_siblings`. No revision is written.',
	example: {
		spaceId: '0c1f6a0e-3f3a-4c5e-9d58-6f7a2f1b9a10',
		parentTag: 'DOC-0001',
		position: { after: 'DOC-0002' }
	},
	permissions: MANAGE,
	input: z.object({
		tag,
		spaceId: z.uuid(),
		parentTag: z.string().min(1).nullable(),
		position: placementSchema.optional(),
		confirmedCount: z.number().int().min(0).optional()
	}),
	output: pageResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await pageOf(actor, input.tag);
		const parentId =
			input.parentTag === null ? null : await tagToId(actor, 'parentTag', input.parentTag);

		let position: Placement | undefined;
		if (input.position) {
			position =
				'before' in input.position
					? { before: await tagToId(actor, 'position', input.position.before) }
					: { after: await tagToId(actor, 'position', input.position.after) };
		}

		const destination = { spaceId: input.spaceId, parentId };
		const outcome = await movePage(
			actor,
			target.id,
			{ ...destination, position },
			{ confirmedCount: input.confirmedCount }
		);
		if (!outcome.ok) {
			if (outcome.error === 'confirmation_required' || outcome.error === 'count_changed') {
				const preview = await previewMove(actor, target.id, destination);
				if (!preview.ok) throw writeRefusal(preview.error);
				throw new ApiError(
					409,
					outcome.error,
					outcome.error === 'count_changed'
						? 'The subtree changed since it was counted.'
						: 'The move changes who can read the pages; confirm the count.',
					undefined,
					{
						subtreeCount: preview.value.subtreeCount,
						fromAudience: preview.value.fromAudience,
						toAudience: preview.value.toAudience
					}
				);
			}
			throw writeRefusal(outcome.error);
		}

		return writtenPage(actor, target.tag);
	}
});

export const publishPageEndpoint = defineEndpoint({
	id: 'knowledge.pages.publish',
	method: 'POST',
	path: '/pages/{tag}/publish',
	summary: 'Publish a draft page.',
	description:
		'Makes a draft readable by everyone the space reaches, and answers `200` with the page. Publishing a published page changes nothing. A page under a draft parent is `409 parent_unpublished`; an archived page is `409 archived`. There is no unpublish.',
	permissions: MANAGE,
	input: z.object({ tag }),
	output: pageResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await pageOf(actor, input.tag);
		const outcome = await publishPage(actor, target.id);
		if (!outcome.ok) throw writeRefusal(outcome.error);
		return writtenPage(actor, target.tag);
	}
});

export const archivePageEndpoint = defineEndpoint({
	id: 'knowledge.pages.archive',
	method: 'POST',
	path: '/pages/{tag}/archive',
	summary: 'Archive a page and its subtree.',
	description:
		'Archives the page and every page below it, and answers `200` with the page. Archiving an archived page changes nothing. `DELETE` on the same address brings back the subtree archived with it.',
	permissions: MANAGE,
	input: z.object({ tag }),
	output: pageResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await pageOf(actor, input.tag);
		const outcome = await archivePage(actor, target.id);
		// Already archived: the state asked for, so a re-read.
		if (!outcome.ok && outcome.error !== 'archived') throw writeRefusal(outcome.error);
		return writtenPage(actor, target.tag);
	}
});

export const unarchivePageEndpoint = defineEndpoint({
	id: 'knowledge.pages.unarchive',
	method: 'DELETE',
	path: '/pages/{tag}/archive',
	summary: 'Bring an archived page back.',
	description:
		'Restores the page and the pages archived with it (a branch archived on its own earlier stays archived), and answers `200` with the page. Unarchiving a page that is not archived changes nothing. A page whose parent or space is still archived is `409` (`parent_archived`, `space_archived`).',
	permissions: MANAGE,
	input: z.object({ tag }),
	output: pageResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await pageOf(actor, input.tag);
		const outcome = await unarchivePage(actor, target.id);
		if (!outcome.ok && outcome.error !== 'not_archived') throw writeRefusal(outcome.error);
		return writtenPage(actor, target.tag);
	}
});

export const KNOWLEDGE_ENDPOINTS: readonly Endpoint[] = [
	listSpacesEndpoint,
	spaceTreeEndpoint,
	searchPagesEndpoint,
	getPageEndpoint,
	listRevisionsEndpoint,
	getRevisionEndpoint,
	createPageEndpoint,
	updatePageEndpoint,
	movePageEndpoint,
	publishPageEndpoint,
	archivePageEndpoint,
	unarchivePageEndpoint
];
