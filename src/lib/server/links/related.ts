import { and, asc, eq, inArray } from 'drizzle-orm';
import { deriveHandoverState, type HandoverState } from '#lib/domain/handover.js';
import { assetHref, pageHref, projectHref, taskHref, ticketHref } from '#lib/domain/routes.js';
import type { AssetState, Priority, StateGroup, TicketStatus } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import { requireAssetScope } from '../assets';
import { assets, handovers } from '../assets/schema';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { listPeople } from '../directory';
import { pageSummaries } from '../knowledge';
import {
	projectProgress,
	projectSummaries,
	taskSummaries,
	tasksOfProject,
	type ProjectProgress,
	type TaskSummary
} from '../projects';
import { isRequester, ticketSummaries, tickets, type TicketRow } from '../service-desk';
import {
	projectPage,
	ticketAsset,
	ticketHandover,
	ticketPage,
	ticketProject,
	ticketTask
} from './schema';

/**
 * The uniform read interface over storage that is deliberately not uniform
 * (ADR 0005): `relatedTo(viewer, record)` answers "what is this connected to?"
 * for any record, and the `RecordRef` and `RelatedRecords` components render
 * the answer without knowing which join table it came from.
 *
 * **Live, not historical.** A relation is a fact that is true now, so each item
 * carries the status its record has *today*, read from the record itself. The
 * `activity` log is where the past lives; reading it for this would render a
 * stale status dressed as history (ADR 0009).
 */

export type RecordKind = 'ticket' | 'asset' | 'task' | 'project' | 'handover' | 'page';

/** Which record to look up. */
export interface RecordLocator {
	kind: RecordKind;
	id: string;
}

/** An inline, clickable reference to a record: what the `RecordRef` component draws. */
export interface RecordRef<K extends RecordKind = RecordKind> {
	kind: K;
	id: string;
	/** The human code (`AST-0142`, `TCK-0093`), which is also what the URL carries (ADR 0010). */
	tag: string;
	title: string;
	href: string;
}

/**
 * A handover: there is no page for it yet, so it is drawn by its code and goes
 * nowhere. Not a stand-in for a record the viewer cannot see: those are never
 * given a reference at all (see `RelatedGroup.restricted`).
 */
export type RestrictedRecordRef<K extends RecordKind = RecordKind> = Omit<RecordRef<K>, 'href'> & {
	href: null;
};

/** Where a knowledge page stands today. */
export type PageState = 'draft' | 'published' | 'archived';

/** Where a handover stands today: derived in the domain, never stored as `expired`. */
export type { HandoverState };

/** A task's state as it is today: the group is the product's, the name the organisation's. */
export interface TaskStatus {
	group: StateGroup;
	name: string;
}

/**
 * A project has no status column; where it stands is derived from its tasks.
 * `progress` is `null` when the viewer cannot read the project, because the
 * counts would tell them about tasks they cannot see.
 */
export interface ProjectStatus {
	archived: boolean;
	progress: ProjectProgress | null;
}

/** The task a ticket reaches a project through: a reference, plus where the task stands. */
export type ViaTask = RecordRef<'task'> & { status: TaskStatus };

export type RelatedItem = {
	/** When the relation was made — what orders a timeline. */
	linkedAt: Date;
	/**
	 * Who made it, from the link row: shown on the live entry of a task's or a
	 * project's timeline. `null` when the person is gone; absent where the
	 * relation is read without it.
	 */
	actorName?: string | null;
	/** On `resolves_via_tasks`: the task of the project the ticket is linked to. */
	via?: ViaTask;
	/** On a task the staff viewer may open: the code of its project, as secondary text. Never for the requester. */
	projectTag?: string;
} & (
	| { ref: RecordRef<'asset'>; status: AssetState }
	/** There is no page for a handover yet, so it is drawn by its code and goes nowhere. */
	| { ref: RestrictedRecordRef<'handover'>; status: HandoverState }
	| {
			ref: RecordRef<'ticket'>;
			status: TicketStatus;
			/** Present where the ticket is listed beside work (#151): what a technician scans for. */
			priority?: Priority;
			assignee?: string | null;
	  }
	| { ref: RecordRef<'task'>; status: TaskStatus }
	| { ref: RecordRef<'project'>; status: ProjectStatus }
	| { ref: RecordRef<'page'>; status: PageState }
	/**
	 * A cited page the viewer cannot read (#327): **its code only**, no title, no
	 * link and no state. This intentionally differs from the code-less shape of
	 * restricted tasks and projects (#310): the code of a page is already in the
	 * text of the reply that cited it, so hiding it from the requester would
	 * protect nothing, and showing it tells them why the link in their reply
	 * stopped opening (the page was archived or moved to staff).
	 */
	| { ref: RestrictedRecordRef<'page'>; status: null }
);

/**
 * Which relation the group is, as a key. The panel label is rendering (the
 * design system says *Affects*), so words belong to the UI and survive a
 * second language; the key is stable.
 */
export type RelationName =
	| 'affects'
	| 'affected_by'
	| 'resolved_in'
	| 'handled_in'
	| 'resolves'
	| 'handles'
	| 'resolves_via_tasks'
	| 'fulfilled_by'
	| 'fulfils'
	| 'cites'
	| 'cited_by'
	| 'documented_by'
	| 'documents';

export interface RelatedGroup {
	relation: RelationName;
	/** The kind of record the items are, which picks the group's icon. */
	icon: RecordKind;
	items: RelatedItem[];
	/**
	 * How many tasks or projects of this group the viewer cannot see (ADR 0042):
	 * a number and nothing else. No code, no title, no id, no state — an id is
	 * enough to build a URL or probe the API, and a title can be the secret
	 * itself. Absent when there are none.
	 */
	restricted?: number;
}

/**
 * The groups of the relations that existed before tickets could point at work:
 * what the components render today. Task and project groups arrive with their
 * panels (#150, #151), and until then the screens ask for this narrower shape
 * instead of drawing something they have no label or badge for.
 */
export type AssetRelatedGroup = {
	relation: 'affects' | 'affected_by';
	icon: 'asset' | 'ticket';
	items: Extract<RelatedItem, { ref: { kind: 'asset' | 'ticket' } }>[];
};

export function assetRelations(groups: readonly RelatedGroup[]): AssetRelatedGroup[] {
	return groups.filter(
		(group): group is AssetRelatedGroup =>
			group.relation === 'affects' || group.relation === 'affected_by'
	);
}

async function assetsAffectedBy(viewer: SessionUser, ticketId: string): Promise<RelatedItem[]> {
	const rows = await getDb()
		.select({
			id: assets.id,
			tag: assets.assetTag,
			title: assets.name,
			status: assets.state,
			linkedAt: ticketAsset.createdAt
		})
		.from(ticketAsset)
		.innerJoin(assets, eq(ticketAsset.assetId, assets.id))
		.where(
			and(
				eq(ticketAsset.organisationId, viewer.organisationId),
				eq(ticketAsset.ticketId, ticketId),
				// An employee sees the assets they could have attached themselves and no
				// others: a colleague's laptop stays out of the panel even if staff added it.
				requireAssetScope(viewer)
			)
		)
		.orderBy(asc(ticketAsset.createdAt), asc(ticketAsset.id));

	return rows.map((row) => ({
		ref: {
			kind: 'asset' as const,
			id: row.id,
			tag: row.tag,
			title: row.title,
			href: assetHref(row.tag)
		},
		status: row.status,
		linkedAt: row.linkedAt
	}));
}

async function ticketsAffecting(viewer: SessionUser, assetId: string): Promise<RelatedItem[]> {
	// An asset's tickets are its history, and the shared view never shows
	// history (ADR 0007). Staff read them; everybody else gets no group at all,
	// not an empty one they could mistake for "this machine never broke".
	if (!can(viewer, 'tickets.view')) return [];

	const rows = await getDb()
		.select({
			id: tickets.id,
			tag: tickets.ticketTag,
			title: tickets.subject,
			status: tickets.status,
			linkedAt: ticketAsset.createdAt
		})
		.from(ticketAsset)
		.innerJoin(tickets, eq(ticketAsset.ticketId, tickets.id))
		.where(
			and(eq(ticketAsset.organisationId, viewer.organisationId), eq(ticketAsset.assetId, assetId))
		)
		.orderBy(asc(ticketAsset.createdAt), asc(ticketAsset.id));

	return rows.map((row) => ({
		ref: {
			kind: 'ticket' as const,
			id: row.id,
			tag: row.tag,
			title: row.title,
			href: ticketHref(row.tag)
		},
		status: row.status,
		linkedAt: row.linkedAt
	}));
}

/* -------------------------------------------------------------------------- */
/* Tickets and the work they were escalated to (#149)                         */
/* -------------------------------------------------------------------------- */

/*
 * Each half reads its own join table here and asks the other domain for the
 * records (`taskSummaries`, `ticketSummaries`, …) instead of joining their
 * tables (ADR 0002). The order is the link's: oldest first.
 */

function ticketRef(summary: TicketRow): RecordRef<'ticket'> {
	return {
		kind: 'ticket',
		id: summary.id,
		tag: summary.ticketTag,
		title: summary.subject,
		href: ticketHref(summary.ticketTag)
	};
}

function taskRef(task: TaskSummary): RecordRef<'task'> {
	return {
		kind: 'task',
		id: task.id,
		tag: task.taskTag,
		title: task.title,
		href: taskHref(task.taskTag)
	};
}

function viaTask(task: TaskSummary): ViaTask {
	return { ...taskRef(task), status: { group: task.stateGroup, name: task.stateName } };
}

/** A link row seen from the ticket side: which ticket, since when, and by whom. */
interface TicketLink {
	ticketId: string;
	linkedAt: Date;
	createdByPersonId: string | null;
	via?: ViaTask;
}

/**
 * How the viewer stands to this ticket's work, or `null` for "no business here".
 *
 * **Staff** see the work through the usual scopes. **The requester** — an
 * employee holding only `tickets.view.own`, on their own ticket — is the one
 * exception to "nobody learns of a record they cannot see": they also get the
 * code, title and state of the task or project it was escalated to, even
 * outside their scope, because "my request is in progress there" is the most
 * valuable thing they can learn and none of it is sensitive (ADR 0007). Anybody
 * else gets nothing.
 */
async function standingOn(
	viewer: SessionUser,
	ticketId: string
): Promise<'staff' | 'requester' | null> {
	if (can(viewer, 'tickets.view')) return 'staff';
	if (!can(viewer, 'tickets.view.own')) return null;

	return (await isRequester(viewer, ticketId)) ? 'requester' : null;
}

/** What a ticket's work comes to for a viewer: the records they can open, and how many they cannot. */
interface WorkItems {
	items: RelatedItem[];
	restricted: number;
}

async function tasksResolving(
	viewer: SessionUser,
	ticketId: string,
	standing: 'staff' | 'requester'
): Promise<WorkItems> {
	const links = await getDb()
		.select({ taskId: ticketTask.taskId, linkedAt: ticketTask.createdAt })
		.from(ticketTask)
		.where(
			and(eq(ticketTask.organisationId, viewer.organisationId), eq(ticketTask.ticketId, ticketId))
		)
		.orderBy(asc(ticketTask.createdAt), asc(ticketTask.id));

	const byId = new Map(
		(
			await taskSummaries(
				viewer,
				links.map((link) => link.taskId)
			)
		).map((task) => [task.id, task])
	);

	const items: RelatedItem[] = [];
	let restricted = 0;

	for (const link of links) {
		const task = byId.get(link.taskId);
		if (!task) continue;
		if (!task.inScope) {
			restricted += 1;
			continue;
		}

		items.push({
			ref: taskRef(task),
			status: { group: task.stateGroup, name: task.stateName },
			linkedAt: link.linkedAt,
			// The project of a task is staff business: the requester's payload never carries it.
			...(standing === 'staff' ? { projectTag: task.projectTag } : {})
		});
	}

	return { items, restricted };
}

async function projectsHandling(
	viewer: SessionUser,
	ticketId: string,
	standing: 'staff' | 'requester'
): Promise<WorkItems> {
	const links = await getDb()
		.select({ projectId: ticketProject.projectId, linkedAt: ticketProject.createdAt })
		.from(ticketProject)
		.where(
			and(
				eq(ticketProject.organisationId, viewer.organisationId),
				eq(ticketProject.ticketId, ticketId)
			)
		)
		.orderBy(asc(ticketProject.createdAt), asc(ticketProject.id));

	const byId = new Map(
		(
			await projectSummaries(
				viewer,
				links.map((link) => link.projectId)
			)
		).map((project) => [project.id, project])
	);

	const items: RelatedItem[] = [];
	let restricted = 0;

	for (const link of links) {
		const project = byId.get(link.projectId);
		if (!project) continue;
		if (!project.inScope) {
			restricted += 1;
			continue;
		}

		// Reused from the projects domain rather than recomputed. The requester gets
		// none: the counts are staff business.
		const progress = standing === 'staff' ? await projectProgress(viewer, project.id) : null;

		items.push({
			ref: {
				kind: 'project',
				id: project.id,
				tag: project.projectTag,
				title: project.name,
				href: projectHref(project.projectTag)
			},
			status: { archived: project.archived, progress: progress?.ok ? progress.value : null },
			linkedAt: link.linkedAt
		});
	}

	return { items, restricted };
}

/** The tickets of `links` the viewer may see, in the links' order. */
async function ticketItems(viewer: SessionUser, links: TicketLink[]): Promise<RelatedItem[]> {
	if (links.length === 0) return [];

	const [summaries, directory] = await Promise.all([
		ticketSummaries(
			viewer,
			links.map((link) => link.ticketId)
		),
		listPeople(viewer.organisationId, { includeInactive: true })
	]);
	const byId = new Map(summaries.map((ticket) => [ticket.id, ticket]));
	const names = new Map(directory.map((person) => [person.id, person.fullName]));

	return links.flatMap((link): RelatedItem[] => {
		const ticket = byId.get(link.ticketId);
		if (!ticket) return [];

		return [
			{
				ref: ticketRef(ticket),
				status: ticket.status,
				priority: ticket.priority,
				assignee: ticket.assigneeName,
				linkedAt: link.linkedAt,
				actorName: link.createdByPersonId ? (names.get(link.createdByPersonId) ?? null) : null,
				...(link.via ? { via: link.via } : {})
			}
		];
	});
}

async function ticketsResolvedBy(viewer: SessionUser, taskId: string): Promise<RelatedItem[]> {
	const links = await getDb()
		.select({
			ticketId: ticketTask.ticketId,
			linkedAt: ticketTask.createdAt,
			createdByPersonId: ticketTask.createdByPersonId
		})
		.from(ticketTask)
		.where(and(eq(ticketTask.organisationId, viewer.organisationId), eq(ticketTask.taskId, taskId)))
		.orderBy(asc(ticketTask.createdAt), asc(ticketTask.id));

	return ticketItems(viewer, links);
}

async function ticketsHandledBy(viewer: SessionUser, projectId: string): Promise<RelatedItem[]> {
	const links = await getDb()
		.select({
			ticketId: ticketProject.ticketId,
			linkedAt: ticketProject.createdAt,
			createdByPersonId: ticketProject.createdByPersonId
		})
		.from(ticketProject)
		.where(
			and(
				eq(ticketProject.organisationId, viewer.organisationId),
				eq(ticketProject.projectId, projectId)
			)
		)
		.orderBy(asc(ticketProject.createdAt), asc(ticketProject.id));

	return ticketItems(viewer, links);
}

/**
 * Tickets reaching a project through one of its tasks, each naming that task.
 *
 * Only through tasks the viewer may open: the `via` reference is a record in its
 * own right, and seeing a project is not seeing all its tasks.
 */
async function ticketsViaTasksOf(viewer: SessionUser, projectId: string): Promise<RelatedItem[]> {
	const visible = new Map((await tasksOfProject(viewer, projectId)).map((task) => [task.id, task]));
	if (visible.size === 0) return [];

	const links = await getDb()
		.select({
			ticketId: ticketTask.ticketId,
			taskId: ticketTask.taskId,
			linkedAt: ticketTask.createdAt,
			createdByPersonId: ticketTask.createdByPersonId
		})
		.from(ticketTask)
		.where(
			and(
				eq(ticketTask.organisationId, viewer.organisationId),
				inArray(ticketTask.taskId, [...visible.keys()])
			)
		)
		.orderBy(asc(ticketTask.createdAt), asc(ticketTask.id));

	return ticketItems(
		viewer,
		links.map((link) => ({
			ticketId: link.ticketId,
			linkedAt: link.linkedAt,
			createdByPersonId: link.createdByPersonId,
			via: viaTask(visible.get(link.taskId)!)
		}))
	);
}

/* -------------------------------------------------------------------------- */
/* Tickets and the handovers that fulfil them (#279)                          */
/* -------------------------------------------------------------------------- */

/** Handovers are staff business (signature evidence): never shown to a requester. */
async function handoversFulfilling(viewer: SessionUser, ticketId: string): Promise<RelatedItem[]> {
	const now = new Date();
	const rows = await getDb()
		.select({
			id: handovers.id,
			code: handovers.code,
			person: handovers.personNameSnapshot,
			status: handovers.status,
			expiresAt: handovers.expiresAt,
			linkedAt: ticketHandover.createdAt,
			createdByPersonId: ticketHandover.createdByPersonId
		})
		.from(ticketHandover)
		.innerJoin(handovers, eq(ticketHandover.handoverId, handovers.id))
		.where(
			and(
				eq(ticketHandover.organisationId, viewer.organisationId),
				eq(ticketHandover.ticketId, ticketId)
			)
		)
		.orderBy(asc(ticketHandover.createdAt), asc(ticketHandover.id));

	return rows.map((row) => ({
		ref: { kind: 'handover' as const, id: row.id, tag: row.code, title: row.person, href: null },
		status: deriveHandoverState(row, now),
		linkedAt: row.linkedAt
	}));
}

async function ticketsFulfilledBy(viewer: SessionUser, handoverId: string): Promise<RelatedItem[]> {
	if (!can(viewer, 'tickets.view')) return [];

	const links = await getDb()
		.select({
			ticketId: ticketHandover.ticketId,
			linkedAt: ticketHandover.createdAt,
			createdByPersonId: ticketHandover.createdByPersonId
		})
		.from(ticketHandover)
		.where(
			and(
				eq(ticketHandover.organisationId, viewer.organisationId),
				eq(ticketHandover.handoverId, handoverId)
			)
		)
		.orderBy(asc(ticketHandover.createdAt), asc(ticketHandover.id));

	return ticketItems(viewer, links);
}

/* -------------------------------------------------------------------------- */
/* Tickets and projects with the knowledge pages they cite or are documented by (#327) */
/* -------------------------------------------------------------------------- */

/** The pages of `links` as items, oldest first; one the viewer cannot read keeps its code only. */
async function pageItems(
	viewer: SessionUser,
	links: { pageId: string; linkedAt: Date }[]
): Promise<RelatedItem[]> {
	if (links.length === 0) return [];

	const byId = new Map(
		(
			await pageSummaries(
				viewer,
				links.map((link) => link.pageId)
			)
		).map((page) => [page.id, page])
	);

	return links.flatMap((link): RelatedItem[] => {
		const page = byId.get(link.pageId);
		if (!page) return [];

		if (!page.readable) {
			return [
				{
					ref: { kind: 'page', id: page.id, tag: page.tag, title: '', href: null },
					status: null,
					linkedAt: link.linkedAt
				}
			];
		}
		return [
			{
				ref: {
					kind: 'page',
					id: page.id,
					tag: page.tag,
					title: page.title,
					href: pageHref(page.tag)
				},
				status: page.status,
				linkedAt: link.linkedAt
			}
		];
	});
}

async function pagesCitedBy(viewer: SessionUser, ticketId: string): Promise<RelatedItem[]> {
	const links = await getDb()
		.select({ pageId: ticketPage.pageId, linkedAt: ticketPage.createdAt })
		.from(ticketPage)
		.where(
			and(eq(ticketPage.organisationId, viewer.organisationId), eq(ticketPage.ticketId, ticketId))
		)
		.orderBy(asc(ticketPage.createdAt), asc(ticketPage.id));

	return pageItems(viewer, links);
}

async function pagesDocumenting(viewer: SessionUser, projectId: string): Promise<RelatedItem[]> {
	const links = await getDb()
		.select({ pageId: projectPage.pageId, linkedAt: projectPage.createdAt })
		.from(projectPage)
		.where(
			and(
				eq(projectPage.organisationId, viewer.organisationId),
				eq(projectPage.projectId, projectId)
			)
		)
		.orderBy(asc(projectPage.createdAt), asc(projectPage.id));

	return pageItems(viewer, links);
}

/** A page's tickets are history: staff read them, nobody else gets the group. */
async function ticketsCiting(viewer: SessionUser, pageId: string): Promise<RelatedItem[]> {
	if (!can(viewer, 'tickets.view')) return [];

	const links = await getDb()
		.select({
			ticketId: ticketPage.ticketId,
			linkedAt: ticketPage.createdAt,
			createdByPersonId: ticketPage.createdByPersonId
		})
		.from(ticketPage)
		.where(and(eq(ticketPage.organisationId, viewer.organisationId), eq(ticketPage.pageId, pageId)))
		.orderBy(asc(ticketPage.createdAt), asc(ticketPage.id));

	return ticketItems(viewer, links);
}

/** The projects a page documents; the ones the viewer cannot open are only counted (#310). */
async function projectsDocumentedBy(viewer: SessionUser, pageId: string): Promise<WorkItems> {
	if (!can(viewer, 'knowledge.manage')) return { items: [], restricted: 0 };

	const links = await getDb()
		.select({ projectId: projectPage.projectId, linkedAt: projectPage.createdAt })
		.from(projectPage)
		.where(
			and(eq(projectPage.organisationId, viewer.organisationId), eq(projectPage.pageId, pageId))
		)
		.orderBy(asc(projectPage.createdAt), asc(projectPage.id));

	const byId = new Map(
		(
			await projectSummaries(
				viewer,
				links.map((link) => link.projectId)
			)
		).map((project) => [project.id, project])
	);

	const items: RelatedItem[] = [];
	let restricted = 0;

	for (const link of links) {
		const project = byId.get(link.projectId);
		if (!project) continue;
		if (!project.inScope) {
			restricted += 1;
			continue;
		}

		const progress = await projectProgress(viewer, project.id);
		items.push({
			ref: {
				kind: 'project',
				id: project.id,
				tag: project.projectTag,
				title: project.name,
				href: projectHref(project.projectTag)
			},
			status: { archived: project.archived, progress: progress.ok ? progress.value : null },
			linkedAt: link.linkedAt
		});
	}

	return { items, restricted };
}

/**
 * What a record is connected to, as groups ready to render, in the design
 * system's order and with empty groups left out (it offers *Link* instead).
 *
 * The caller has already proved the viewer may open `record` — it got the
 * record through a scoped read — so this scopes what is on the **other side**
 * of each relation and the organisation, and takes the record as given.
 */
export async function relatedTo(
	viewer: SessionUser,
	record: RecordLocator
): Promise<RelatedGroup[]> {
	const groups: RelatedGroup[] = [];
	const add = (relation: RelationName, icon: RecordKind, found: RelatedItem[] | WorkItems) => {
		const { items, restricted } = Array.isArray(found) ? { items: found, restricted: 0 } : found;
		if (items.length > 0 || restricted > 0) {
			groups.push({ relation, icon, items, ...(restricted > 0 ? { restricted } : {}) });
		}
	};

	switch (record.kind) {
		case 'ticket': {
			add('affects', 'asset', await assetsAffectedBy(viewer, record.id));

			const standing = await standingOn(viewer, record.id);
			if (standing) {
				add('resolved_in', 'task', await tasksResolving(viewer, record.id, standing));
				add('handled_in', 'project', await projectsHandling(viewer, record.id, standing));
			}
			if (standing === 'staff') {
				add('fulfilled_by', 'handover', await handoversFulfilling(viewer, record.id));
			}
			// The requester reads the citations of their own ticket too: a page they
			// cannot read comes back with its code only (see `RelatedItem`).
			if (standing) add('cites', 'page', await pagesCitedBy(viewer, record.id));
			break;
		}

		case 'asset':
			add('affected_by', 'ticket', await ticketsAffecting(viewer, record.id));
			break;

		case 'task':
			add('resolves', 'ticket', await ticketsResolvedBy(viewer, record.id));
			break;

		case 'handover':
			add('fulfils', 'ticket', await ticketsFulfilledBy(viewer, record.id));
			break;

		case 'project':
			add('handles', 'ticket', await ticketsHandledBy(viewer, record.id));
			add('resolves_via_tasks', 'ticket', await ticketsViaTasksOf(viewer, record.id));
			add('documented_by', 'page', await pagesDocumenting(viewer, record.id));
			break;

		case 'page':
			add('cited_by', 'ticket', await ticketsCiting(viewer, record.id));
			add('documents', 'project', await projectsDocumentedBy(viewer, record.id));
			break;
	}

	return groups;
}
