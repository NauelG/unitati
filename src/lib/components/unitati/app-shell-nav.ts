/**
 * The navigation model behind `AppShell` (ADR 0015 addendum, issue #122): a
 * link is either a **leaf** (one `href`) or a **group** of leaves. Everything
 * here is pure — visibility, the "one visible child → flat row" rule and
 * active-route matching — so it is unit-tested without rendering a sidebar.
 */
import type { LucideIcon } from '@lucide/svelte';

export interface AppShellNavLeaf {
	href: string;
	label: string;
	icon: LucideIcon;
	/**
	 * Which `.ut-nav-section` heading this row falls under. Rows with no
	 * section (Overview, the dev gallery link) render on their own, outside
	 * either heading — `AppShell` inserts "MODULES" / "DIRECTORY" the first
	 * time it sees a row ask for it, so the layout never builds the heading
	 * itself.
	 */
	section?: 'modules' | 'directory';
	/** The domain dot (`--asset` / `--desk` / `--project`); absent outside `modules`. */
	accent?: string;
	/** Absent — not zero — when the viewer holds no permission to count it. */
	count?: number;
	/**
	 * Which permission(s) show the row at all; any one is enough. Absent or
	 * `null` means everyone. A hidden row is a convenience — every route still
	 * guards itself on the server.
	 */
	permission?: string | readonly string[] | null;
	/** A leaf is told from a group by `href`; this keeps the union discriminable. */
	children?: never;
}

/**
 * A collapsible parent row. It has no `href`, `count` or `permission` of its
 * own: it only toggles, and it is visible when at least one child is.
 */
export interface AppShellNavGroup {
	/** Stable identity, used for persistence and `aria-controls`. Never shown. */
	id: string;
	label: string;
	icon: LucideIcon;
	section?: 'modules' | 'directory';
	accent?: string;
	children: AppShellNavLeaf[];
	href?: never;
}

export type AppShellNavLink = AppShellNavLeaf | AppShellNavGroup;

/** A row ready to render: permissions applied, single-child groups already flattened. */
export type ResolvedNavLeaf = Omit<AppShellNavLeaf, 'permission' | 'children'> & {
	kind: 'leaf';
};

export interface ResolvedNavGroup {
	kind: 'group';
	id: string;
	label: string;
	icon: LucideIcon;
	section?: 'modules' | 'directory';
	accent?: string;
	/** At least two: a group with one visible child never survives resolution. */
	children: ResolvedNavLeaf[];
}

export type ResolvedNavItem = ResolvedNavLeaf | ResolvedNavGroup;

export function isNavGroup(link: AppShellNavLink): link is AppShellNavGroup {
	return Array.isArray(link.children);
}

function isVisible(leaf: AppShellNavLeaf, permissions: readonly string[]): boolean {
	if (!leaf.permission) return true;
	return [leaf.permission].flat().some((permission) => permissions.includes(permission));
}

function toResolvedLeaf(leaf: AppShellNavLeaf): ResolvedNavLeaf {
	return {
		kind: 'leaf',
		href: leaf.href,
		label: leaf.label,
		icon: leaf.icon,
		...(leaf.section ? { section: leaf.section } : {}),
		...(leaf.accent ? { accent: leaf.accent } : {}),
		...(leaf.count !== undefined ? { count: leaf.count } : {})
	};
}

/**
 * Applies the viewer's permissions and the grouping rules, in order:
 *
 * 1. every leaf (top-level or child) keeps its own `permission`;
 * 2. a group with no visible child disappears;
 * 3. a group with exactly one visible child becomes a flat leaf wearing the
 *    group's label, icon and accent with the child's `href` and `count` — a
 *    one-option disclosure would be a wasted click.
 */
export function resolveNavigation(
	links: readonly AppShellNavLink[],
	permissions: readonly string[]
): ResolvedNavItem[] {
	return links.flatMap((link): ResolvedNavItem[] => {
		if (!isNavGroup(link)) {
			return isVisible(link, permissions) ? [toResolvedLeaf(link)] : [];
		}

		const visible = link.children.filter((child) => isVisible(child, permissions));
		if (visible.length === 0) return [];

		if (visible.length === 1) {
			const [only] = visible;
			const flat: ResolvedNavLeaf = {
				kind: 'leaf',
				href: only.href,
				label: link.label,
				icon: link.icon,
				...(link.section ? { section: link.section } : {}),
				...(link.accent ? { accent: link.accent } : {}),
				...(only.count !== undefined ? { count: only.count } : {})
			};
			return [flat];
		}

		return [
			{
				kind: 'group',
				id: link.id,
				label: link.label,
				icon: link.icon,
				...(link.section ? { section: link.section } : {}),
				...(link.accent ? { accent: link.accent } : {}),
				children: visible.map(toResolvedLeaf)
			}
		];
	});
}

/** Every reachable destination, groups opened up: what the keymap shortcuts are built from. */
export function navLeaves(items: readonly ResolvedNavItem[]): ResolvedNavLeaf[] {
	return items.flatMap((item) => (item.kind === 'group' ? item.children : [item]));
}

/** `/assets` is active on `/assets` and `/assets/7`, never on `/assets-archive`. */
export function isPathActive(href: string, pathname: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function groupContainsPath(
	children: readonly Pick<AppShellNavLeaf, 'href'>[],
	pathname: string
): boolean {
	return children.some((child) => isPathActive(child.href, pathname));
}
