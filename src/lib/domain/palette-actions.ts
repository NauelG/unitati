import type { LucideIcon } from '@lucide/svelte';
import HouseIcon from '@lucide/svelte/icons/house';
import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
import PackageIcon from '@lucide/svelte/icons/package';
import PlusIcon from '@lucide/svelte/icons/plus';
import TicketIcon from '@lucide/svelte/icons/ticket';
import UserCheckIcon from '@lucide/svelte/icons/user-check';
import UsersIcon from '@lucide/svelte/icons/users';
import { m } from '../paraglide/messages.js';
import { ASSET_READ_PERMISSIONS, TICKET_READ_PERMISSIONS } from './access.js';

/**
 * The command palette's "Acciones" group (#88): a pure function, not a
 * `$derived` inline inside `CommandPalette.svelte`, so the permission
 * filtering is unit-testable without mounting a component — this repo's
 * vitest `server` project runs in Node with no DOM/component-testing
 * project configured (see `vite.config.ts`).
 */

export type PaletteActionTarget =
	{ kind: 'navigate'; href: string } | { kind: 'assign-to-me'; ticketTag: string };

export interface PaletteActionDef {
	id: string;
	label: string;
	icon: LucideIcon;
	target: PaletteActionTarget;
}

export interface PaletteActionContext {
	permissions: readonly string[];
	/** The ticket tag, only when the viewer is on that ticket's own detail page. */
	ticketTag?: string;
	/** The viewer's own directory record — "Asignar a mí" needs one to exist. */
	personId?: string | null;
	/** Hides the gallery action the same way the dev nav link already is (ADR 0013). */
	isProduction: boolean;
}

export function hasAnyPermission(
	permissions: readonly string[],
	required: string | readonly string[]
): boolean {
	return [required].flat().some((permission) => permissions.includes(permission));
}

export function derivePaletteActions(ctx: PaletteActionContext): PaletteActionDef[] {
	const candidates: (PaletteActionDef | null)[] = [
		hasAnyPermission(ctx.permissions, 'tickets.create')
			? {
					id: 'new-ticket',
					label: m.palette_action_new_ticket(),
					icon: PlusIcon,
					target: { kind: 'navigate', href: '/service-desk/new' }
				}
			: null,
		hasAnyPermission(ctx.permissions, 'assets.manage')
			? {
					id: 'register-asset',
					label: m.palette_action_register_asset(),
					icon: PlusIcon,
					target: { kind: 'navigate', href: '/assets/new' }
				}
			: null,
		hasAnyPermission(ctx.permissions, 'tickets.manage') && ctx.ticketTag && ctx.personId
			? {
					id: 'assign-to-me',
					label: m.palette_action_assign_me(),
					icon: UserCheckIcon,
					target: { kind: 'assign-to-me', ticketTag: ctx.ticketTag }
				}
			: null,
		hasAnyPermission(ctx.permissions, ASSET_READ_PERMISSIONS)
			? {
					id: 'go-assets',
					label: m.palette_action_go_assets(),
					icon: PackageIcon,
					target: { kind: 'navigate', href: '/assets' }
				}
			: null,
		hasAnyPermission(ctx.permissions, TICKET_READ_PERMISSIONS)
			? {
					id: 'go-service-desk',
					label: m.palette_action_go_service_desk(),
					icon: TicketIcon,
					target: { kind: 'navigate', href: '/service-desk' }
				}
			: null,
		hasAnyPermission(ctx.permissions, 'people.view')
			? {
					id: 'go-directory',
					label: m.palette_action_go_directory(),
					icon: UsersIcon,
					target: { kind: 'navigate', href: '/directory' }
				}
			: null,
		{
			id: 'go-overview',
			label: m.palette_action_go_overview(),
			icon: HouseIcon,
			target: { kind: 'navigate', href: '/' }
		},
		!ctx.isProduction
			? {
					id: 'go-gallery',
					label: m.palette_action_go_gallery(),
					icon: LayoutGridIcon,
					target: { kind: 'navigate', href: '/dev/components' }
				}
			: null
	];

	return candidates.filter((action): action is PaletteActionDef => action !== null);
}
