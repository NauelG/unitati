import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import type {
	CatalogueDeleteFailure,
	CatalogueEditFailure,
	CatalogueEntry,
	CatalogueFailure
} from '#lib/server/assets/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import type { Outcome } from '#lib/server/shared/outcome.js';
import { fieldsOf, rejected, withId } from '../../assets/form-data';

/**
 * Manufacturers and categories are the same screen: a flat list of names that
 * can be added, renamed and removed. Written once here and parameterised by the
 * four domain calls, because two hand-copied pairs of files drift — the first
 * time one learns to say "still in use" in a better sentence, the other keeps
 * the old one.
 *
 * Models are not folded in: they carry a manufacturer and a category, and a
 * factory that grew optional fields to cover them would be harder to read than
 * the two files it replaced.
 */

export interface NameCatalogueOperations {
	list(organisationId: string): Promise<CatalogueEntry[]>;
	create(
		actor: SessionUser,
		input: { name: string }
	): Promise<Outcome<{ id: string }, CatalogueFailure>>;
	rename(
		actor: SessionUser,
		id: string,
		input: { name: string }
	): Promise<Outcome<void, CatalogueEditFailure>>;
	remove(actor: SessionUser, id: string): Promise<Outcome<void, CatalogueDeleteFailure>>;
	/** What `restrict` means for this entry, in this entry's own words. */
	inUseMessage: () => string;
	/** The registry href this catalogue is registered at: its page and actions guard on that entry. */
	section: string;
}

const nameOnly = z.object({ name: z.string().trim().min(1) });

export function nameCatalogue(operations: NameCatalogueOperations) {
	return {
		load: async ({ locals }: RequestEvent) => {
			const user = requireSettingsSection(locals.user, operations.section);
			return { entries: await operations.list(user.organisationId) };
		},

		actions: {
			create: async ({ request, locals }: RequestEvent) => {
				const user = requireSettingsSection(locals.user, operations.section);
				const parsed = nameOnly.safeParse(await fieldsOf(request));
				if (!parsed.success) return rejected('create', m.validation_name_required());

				const outcome = await operations.create(user, parsed.data);
				if (!outcome.ok) return rejected('create', m.catalogue_error_duplicate());
				return { action: 'create' as const, message: null, id: null };
			},

			rename: async ({ request, locals }: RequestEvent) => {
				const user = requireSettingsSection(locals.user, operations.section);
				const fields = await fieldsOf(request);
				const target = withId.safeParse(fields);
				if (!target.success) return rejected('rename', m.catalogue_error_not_found());

				const parsed = nameOnly.safeParse(fields);
				if (!parsed.success) {
					return rejected('rename', m.validation_name_required(), target.data.id);
				}

				const outcome = await operations.rename(user, target.data.id, parsed.data);
				if (!outcome.ok) {
					return rejected(
						'rename',
						outcome.error === 'duplicate_name'
							? m.catalogue_error_duplicate()
							: m.catalogue_error_not_found(),
						target.data.id
					);
				}
				return { action: 'rename' as const, message: null, id: null };
			},

			delete: async ({ request, locals }: RequestEvent) => {
				const user = requireSettingsSection(locals.user, operations.section);
				const target = withId.safeParse(await fieldsOf(request));
				if (!target.success) return rejected('delete', m.catalogue_error_not_found());

				const outcome = await operations.remove(user, target.data.id);
				if (!outcome.ok) {
					return rejected(
						'delete',
						outcome.error === 'in_use' ? operations.inUseMessage() : m.catalogue_error_not_found(),
						target.data.id
					);
				}
				return { action: 'delete' as const, message: null, id: null };
			}
		}
	};
}
