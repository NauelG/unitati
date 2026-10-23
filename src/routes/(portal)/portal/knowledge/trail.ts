import type { BreadcrumbSegment } from '#lib/components/unitati/Breadcrumbs.svelte';
import { m } from '#lib/paraglide/messages.js';

type Linked = { tag: string; title: string };

/** The portal's breadcrumb of a page: documentation, space, ancestors, the page. */
export function portalTrail(
	space: { id: string; name: string },
	path: Linked[],
	page: Linked
): BreadcrumbSegment[] {
	return [
		{ label: m.knowledge_title(), href: '/portal/knowledge' },
		{ label: space.name, href: `/portal/knowledge/spaces/${space.id}` },
		...path.map((ancestor) => ({
			label: ancestor.title,
			href: `/portal/knowledge/${ancestor.tag}`
		})),
		{ label: page.title }
	];
}
