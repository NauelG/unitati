import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { assetHref, projectHref, taskHref, ticketHref } from '#lib/domain/routes.js';
import type { AssetState, StateGroup, TicketStatus } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import { requireAssetScope } from '../assets';
import { assets } from '../assets/schema';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	projectProgress,
	projects,
	requireProjectScope,
	requireTaskScope,
	states,
	tasks,
	type ProjectProgress
} from '../projects';
import { requireTicketScope, tickets } from '../service-desk';
import { ticketAsset, ticketProject, ticketTask } from './schema';

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

export type RecordKind = 'ticket' | 'asset' | 'task' | 'project';

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
 * A record the viewer may know exists but may not open: the requester's view of
 * the work done for them (ADR 0007). Same fields, no place to go.
 */
export type RestrictedRecordRef<K extends RecordKind = RecordKind> = Omit<RecordRef<K>, 'href'> & {
	href: null;
};

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

export type RelatedItem = {
	/** When the relation was made — what orders a timeline. */
	linkedAt: Date;
	/**
	 * Set only on the requester's reduced view of a task or project outside
	 * their scope: draw the code, the title and the state, and no link.
	 */
	restricted?: true;
	/** On `resolves_via_tasks`: the task of the project the ticket is linked to. */
	via?: RecordRef<'task'>;
} & (
	| { ref: RecordRef<'asset'>; status: AssetState }
	| { ref: RecordRef<'ticket'>; status: TicketStatus }
	| { ref: RecordRef<'task'> | RestrictedRecordRef<'task'>; status: TaskStatus }
	| { ref: RecordRef<'project'> | RestrictedRecordRef<'project'>; status: ProjectStatus }
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
	| 'resolves_via_tasks';

export interface RelatedGroup {
	relation: RelationName;
	/** The kind of record the items are, which picks the group's icon. */
	icon: RecordKind;
	items: RelatedItem[];
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

const NOTHING = sql`false`;

/** Only a role that reads projects at all may be asked for their scope; the SQL throws otherwise. */
function readsProjects(viewer: SessionUser): boolean {
	return can(viewer, 'projects.view') || can(viewer, 'projects.view.assigned');
}

function readsTickets(viewer: SessionUser): boolean {
	return can(viewer, 'tickets.view') || can(viewer, 'tickets.view.own');
}

const taskScope = (viewer: SessionUser): SQL =>
	readsProjects(viewer) ? requireTaskScope(viewer) : NOTHING;

const projectScope = (viewer: SessionUser): SQL =>
	readsProjects(viewer) ? requireProjectScope(viewer) : NOTHING;

function ticketRef(row: { id: string; tag: string; title: string }): RecordRef<'ticket'> {
	return { kind: 'ticket', id: row.id, tag: row.tag, title: row.title, href: ticketHref(row.tag) };
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
	if (!can(viewer, 'tickets.view.own') || viewer.personId === null) return null;

	const [own] = await getDb()
		.select({ id: tickets.id })
		.from(tickets)
		.where(
			and(
				eq(tickets.id, ticketId),
				eq(tickets.organisationId, viewer.organisationId),
				eq(tickets.requesterPersonId, viewer.personId)
			)
		)
		.limit(1);

	return own ? 'requester' : null;
}

async function tasksResolving(
	viewer: SessionUser,
	ticketId: string,
	standing: 'staff' | 'requester'
): Promise<RelatedItem[]> {
	const scope = taskScope(viewer);

	const rows = await getDb()
		.select({
			id: tasks.id,
			tag: tasks.taskTag,
			title: tasks.title,
			group: states.group,
			stateName: states.name,
			inScope: sql<boolean>`(${scope})`,
			linkedAt: ticketTask.createdAt
		})
		.from(ticketTask)
		.innerJoin(tasks, eq(ticketTask.taskId, tasks.id))
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(
			and(
				eq(ticketTask.organisationId, viewer.organisationId),
				eq(ticketTask.ticketId, ticketId),
				standing === 'staff' ? scope : undefined
			)
		)
		.orderBy(asc(ticketTask.createdAt), asc(ticketTask.id));

	return rows.map((row) => ({
		ref: {
			kind: 'task' as const,
			id: row.id,
			tag: row.tag,
			title: row.title,
			href: row.inScope ? taskHref(row.tag) : null
		},
		status: { group: row.group, name: row.stateName },
		linkedAt: row.linkedAt,
		...(row.inScope ? {} : { restricted: true as const })
	}));
}

async function projectsHandling(
	viewer: SessionUser,
	ticketId: string,
	standing: 'staff' | 'requester'
): Promise<RelatedItem[]> {
	const scope = projectScope(viewer);

	const rows = await getDb()
		.select({
			id: projects.id,
			tag: projects.projectTag,
			title: projects.name,
			archivedAt: projects.archivedAt,
			inScope: sql<boolean>`(${scope})`,
			linkedAt: ticketProject.createdAt
		})
		.from(ticketProject)
		.innerJoin(projects, eq(ticketProject.projectId, projects.id))
		.where(
			and(
				eq(ticketProject.organisationId, viewer.organisationId),
				eq(ticketProject.ticketId, ticketId),
				standing === 'staff' ? scope : undefined
			)
		)
		.orderBy(asc(ticketProject.createdAt), asc(ticketProject.id));

	return Promise.all(
		rows.map(async (row) => {
			// Reused from the projects domain rather than recomputed. Only for what
			// the viewer can open: the counts of a project they cannot see would be
			// a window onto it.
			const progress = row.inScope ? await projectProgress(viewer, row.id) : null;

			return {
				ref: {
					kind: 'project' as const,
					id: row.id,
					tag: row.tag,
					title: row.title,
					href: row.inScope ? projectHref(row.tag) : null
				},
				status: {
					archived: row.archivedAt !== null,
					progress: progress?.ok ? progress.value : null
				},
				linkedAt: row.linkedAt,
				...(row.inScope ? {} : { restricted: true as const })
			};
		})
	);
}

/** Tickets linked to work, as the viewer's ticket scope allows. */
function ticketItems(
	rows: {
		id: string;
		tag: string;
		title: string;
		status: TicketStatus;
		linkedAt: Date;
		via?: RecordRef<'task'>;
	}[]
): RelatedItem[] {
	return rows.map((row) => ({
		ref: ticketRef(row),
		status: row.status,
		linkedAt: row.linkedAt,
		...(row.via ? { via: row.via } : {})
	}));
}

async function ticketsResolvedBy(viewer: SessionUser, taskId: string): Promise<RelatedItem[]> {
	if (!readsTickets(viewer)) return [];

	return ticketItems(
		await getDb()
			.select({
				id: tickets.id,
				tag: tickets.ticketTag,
				title: tickets.subject,
				status: tickets.status,
				linkedAt: ticketTask.createdAt
			})
			.from(ticketTask)
			.innerJoin(tickets, eq(ticketTask.ticketId, tickets.id))
			.where(
				and(
					eq(ticketTask.organisationId, viewer.organisationId),
					eq(ticketTask.taskId, taskId),
					requireTicketScope(viewer)
				)
			)
			.orderBy(asc(ticketTask.createdAt), asc(ticketTask.id))
	);
}

async function ticketsHandledBy(viewer: SessionUser, projectId: string): Promise<RelatedItem[]> {
	if (!readsTickets(viewer)) return [];

	return ticketItems(
		await getDb()
			.select({
				id: tickets.id,
				tag: tickets.ticketTag,
				title: tickets.subject,
				status: tickets.status,
				linkedAt: ticketProject.createdAt
			})
			.from(ticketProject)
			.innerJoin(tickets, eq(ticketProject.ticketId, tickets.id))
			.where(
				and(
					eq(ticketProject.organisationId, viewer.organisationId),
					eq(ticketProject.projectId, projectId),
					requireTicketScope(viewer)
				)
			)
			.orderBy(asc(ticketProject.createdAt), asc(ticketProject.id))
	);
}

/** Tickets reaching a project through one of its tasks, each naming that task. */
async function ticketsViaTasksOf(viewer: SessionUser, projectId: string): Promise<RelatedItem[]> {
	if (!readsTickets(viewer) || !readsProjects(viewer)) return [];

	const rows = await getDb()
		.select({
			id: tickets.id,
			tag: tickets.ticketTag,
			title: tickets.subject,
			status: tickets.status,
			linkedAt: ticketTask.createdAt,
			taskId: tasks.id,
			taskTag: tasks.taskTag,
			taskTitle: tasks.title
		})
		.from(ticketTask)
		.innerJoin(tickets, eq(ticketTask.ticketId, tickets.id))
		.innerJoin(tasks, eq(ticketTask.taskId, tasks.id))
		.where(
			and(
				eq(ticketTask.organisationId, viewer.organisationId),
				eq(tasks.projectId, projectId),
				requireTicketScope(viewer),
				// The `via` task is a record in its own right, and the viewer's scope for
				// tasks applies to it: seeing the project is not seeing all its tasks.
				requireTaskScope(viewer)
			)
		)
		.orderBy(asc(ticketTask.createdAt), asc(ticketTask.id));

	return ticketItems(
		rows.map((row) => ({
			...row,
			via: {
				kind: 'task' as const,
				id: row.taskId,
				tag: row.taskTag,
				title: row.taskTitle,
				href: taskHref(row.taskTag)
			}
		}))
	);
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
	const add = (relation: RelationName, icon: RecordKind, items: RelatedItem[]) => {
		if (items.length > 0) groups.push({ relation, icon, items });
	};

	switch (record.kind) {
		case 'ticket': {
			add('affects', 'asset', await assetsAffectedBy(viewer, record.id));

			const standing = await standingOn(viewer, record.id);
			if (standing) {
				add('resolved_in', 'task', await tasksResolving(viewer, record.id, standing));
				add('handled_in', 'project', await projectsHandling(viewer, record.id, standing));
			}
			break;
		}

		case 'asset':
			add('affected_by', 'ticket', await ticketsAffecting(viewer, record.id));
			break;

		case 'task':
			add('resolves', 'ticket', await ticketsResolvedBy(viewer, record.id));
			break;

		case 'project':
			add('handles', 'ticket', await ticketsHandledBy(viewer, record.id));
			add('resolves_via_tasks', 'ticket', await ticketsViaTasksOf(viewer, record.id));
			break;
	}

	return groups;
}
