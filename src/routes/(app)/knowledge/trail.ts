import type { BreadcrumbSegment } from '#lib/components/unitati/Breadcrumbs.svelte';
import { m } from '#lib/paraglide/messages.js';

type Linked = { tag: string; title: string };

/**
 * The breadcrumb of a page's screens: the knowledge base, the space, the
 * ancestors, the page, then whatever screen of it this is (`below`: "Editar",
 * "Historial", a revision). The page itself is a link only when something sits
 * below it.
 */
export function pageTrail(
	space: { id: string; name: string },
	path: Linked[],
	page: Linked,
	below: BreadcrumbSegment[] = []
): BreadcrumbSegment[] {
	return [
		{ label: m.knowledge_title(), href: '/knowledge' },
		{ label: space.name, href: `/knowledge/spaces/${space.id}` },
		...path.map((ancestor) => ({ label: ancestor.title, href: `/knowledge/${ancestor.tag}` })),
		below.length > 0
			? { label: page.title, href: `/knowledge/${page.tag}` }
			: { label: page.title },
		...below
	];
}
