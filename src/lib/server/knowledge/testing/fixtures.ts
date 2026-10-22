import { getDb } from '../../db';
import { createOrganisation, createViewer } from '../../assets/testing/fixtures';
import { knowledgeSpaces, pages } from '../schema';

/**
 * Row builders for the knowledge specs. They insert straight into the tables,
 * bypassing the domain functions on purpose: a scope test should not depend on
 * the domain layer agreeing with it. Organisations, people and viewers come from
 * `assets/testing/fixtures.ts`.
 */

export async function createWorkspace(name = 'Acme', slug = 'acme') {
	const organisation = await createOrganisation(name, slug);
	// The viewer's address derives from their name and is unique across organisations.
	const suffix = slug === 'acme' ? '' : ` ${slug}`;

	return {
		organisation,
		admin: await createViewer(organisation.id, 'admin', `Ada Admin${suffix}`),
		technician: await createViewer(organisation.id, 'technician', `Tom Technician${suffix}`),
		employee: await createViewer(organisation.id, 'employee', `Eva Employee${suffix}`)
	};
}

type SpaceOverrides = Partial<typeof knowledgeSpaces.$inferInsert>;

export async function createSpaceRow(organisationId: string, overrides: SpaceOverrides = {}) {
	const [space] = await getDb()
		.insert(knowledgeSpaces)
		.values({
			organisationId,
			name: `Space ${crypto.randomUUID().slice(0, 8)}`,
			icon: 'book-open',
			colour: 'blue',
			audience: 'portal',
			...overrides
		})
		.returning();
	return space;
}

type PageOverrides = Partial<typeof pages.$inferInsert>;

export async function createPageRow(
	organisationId: string,
	spaceId: string,
	overrides: PageOverrides = {}
) {
	const [page] = await getDb()
		.insert(pages)
		.values({
			organisationId,
			spaceId,
			title: 'A page',
			position: '1',
			...overrides
		})
		.returning();
	return page;
}
