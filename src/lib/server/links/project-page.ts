import { and, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { pageSummaries, readablePagesByTag } from '../knowledge';
import { findProjectInScope, projectSnapshot } from '../projects';
import { failure, success, type Outcome } from '../shared/outcome';
import { projectPage } from './schema';
import type { LinkResult, UnlinkFailure } from './ticket-work';

/**
 * Project documentation (#327): a project is documented by knowledge pages.
 * Same shape as the ticket's citations, with the activity on the **project**.
 *
 * Needs `projects.manage` **and** the project in the actor's scope, members-only
 * projects included (ADR 0042): a project they cannot see is `project_not_found`,
 * not forbidden, which would confirm it exists.
 */

export type DocumentProjectFailure =
	'forbidden' | 'project_not_found' | 'project_archived' | 'page_not_found';

export async function documentProject(
	actor: SessionUser,
	projectId: string,
	pageTag: string
): Promise<Outcome<LinkResult, DocumentProjectFailure>> {
	if (!can(actor, 'projects.manage')) return failure('forbidden');

	return getDb().transaction(async (tx): Promise<Outcome<LinkResult, DocumentProjectFailure>> => {
		const project = await findProjectInScope(tx, actor, projectId);
		if (!project) return failure('project_not_found');
		if (project.archived) return failure('project_archived');

		const [page] = await readablePagesByTag(tx, actor, [pageTag]);
		if (!page) return failure('page_not_found');

		const inserted = await tx
			.insert(projectPage)
			.values({
				organisationId: actor.organisationId,
				projectId: project.id,
				pageId: page.id,
				createdByPersonId: actor.personId
			})
			.onConflictDoNothing({ target: [projectPage.projectId, projectPage.pageId] })
			.returning({ id: projectPage.id });
		if (inserted.length === 0) return success({ created: false });

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId: project.id },
			verb: 'link.page.added',
			payload: { pageTag: page.tag, pageTitle: page.title }
		});
		return success({ created: true });
	});
}

/** Works on an archived project: the link is `links`', not the project's data. */
export async function undocumentProject(
	actor: SessionUser,
	projectId: string,
	pageId: string
): Promise<Outcome<void, UnlinkFailure | 'project_not_found'>> {
	if (!can(actor, 'projects.manage')) return failure('forbidden');

	return getDb().transaction(
		async (tx): Promise<Outcome<void, UnlinkFailure | 'project_not_found'>> => {
			// Visible to the actor, like every other write on a project.
			if (!(await findProjectInScope(tx, actor, projectId))) return failure('project_not_found');

			const [link] = await tx
				.select({ id: projectPage.id })
				.from(projectPage)
				.where(
					and(
						eq(projectPage.organisationId, actor.organisationId),
						eq(projectPage.projectId, projectId),
						eq(projectPage.pageId, pageId)
					)
				)
				.limit(1);
			if (!link) return failure('link_not_found');

			const [page] = await pageSummaries(actor, [pageId]);
			const project = await projectSnapshot(tx, actor.organisationId, projectId);
			await tx.delete(projectPage).where(eq(projectPage.id, link.id));

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { projectId: project?.id ?? projectId },
				verb: 'link.page.removed',
				payload: { pageTag: page?.tag ?? pageId, pageTitle: page?.title || page?.tag || pageId }
			});
			return success(undefined);
		}
	);
}
