import { readFileSync } from 'node:fs';
import { COMPONENT_MANIFEST, GALLERY_EXCEPTIONS } from '../gallery/manifest.js';
import type { PageServerLoad } from './$types';

export type CoverageStatus = 'implemented' | 'modified' | 'deprecated' | 'not-yet-built';

export interface CoverageRow {
	className: string;
	status: CoverageStatus;
	/** The manifest entry whose component implements this family, if any. */
	implementedBy: string | null;
	galleryHref: string | null;
	/** Why the class is `modified` or `deprecated` — required for either, absent otherwise. */
	note: string | null;
}

/**
 * Which component implements each `.ut-*` family, so the coverage page can
 * mark a class "implemented" without a second hand-maintained list. A class
 * not in this map is "not yet built" — reference-only markup the handoff
 * carries ahead of its Svelte component (#85 scope note: `ut-palette*`,
 * `ut-detail-grid`, `ut-dl`, `ut-sla*`, `ut-crumbs`, `ut-searchpill`).
 */
const CLASS_TO_COMPONENT: Record<string, string | null> = {
	'ut-btn': 'button',
	'ut-btn-busy': 'button',
	'ut-btn-danger': 'button',
	'ut-btn-dot': 'button',
	'ut-btn-ghost': 'button',
	'ut-btn-group': 'button',
	'ut-btn-icon': 'button',
	'ut-btn-kbd': 'button',
	'ut-btn-lg': 'button',
	'ut-btn-primary': 'button',
	'ut-btn-secondary': 'button',
	'ut-btn-sm': 'button',
	'ut-field': 'field',
	'ut-field-error': 'field',
	'ut-help': 'field',
	'ut-input': 'field',
	'ut-label': 'field',
	'ut-badge': 'status-badge',
	'ut-badge-brand': 'status-badge',
	'ut-badge-danger': 'status-badge',
	'ut-badge-desk': 'status-badge',
	'ut-badge-neutral': 'status-badge',
	'ut-badge-plain': 'status-badge',
	'ut-badge-success': 'status-badge',
	'ut-badge-warning': 'status-badge',
	'ut-ref': 'record-ref',
	'ut-ref-asset': 'record-ref',
	'ut-ref-project': 'record-ref',
	'ut-ref-ticket': 'record-ref',
	'ut-ref-title': 'record-ref',
	'ut-id': 'record-ref',
	'ut-avatar': 'avatar',
	'ut-avatar-lg': 'avatar',
	'ut-avatar-sm': 'avatar',
	'ut-person': 'avatar',
	'ut-person-meta': 'avatar',
	'ut-person-name': 'avatar',
	'ut-panel': 'work-panel',
	'ut-panel-body': 'work-panel',
	'ut-panel-head': 'work-panel',
	'ut-panel-title': 'work-panel',
	'ut-rel-group': 'related-records',
	'ut-rel-item': 'related-records',
	'ut-rel-label': 'related-records',
	'ut-table': 'data-table',
	'ut-num': 'data-table',
	'ut-timeline': 'asset-timeline',
	'ut-tl-dot': 'asset-timeline',
	'ut-tl-head': 'asset-timeline',
	'ut-tl-item': 'asset-timeline',
	'ut-tl-time': 'asset-timeline',
	'ut-brandbar': 'app-shell',
	'ut-main': 'app-shell',
	'ut-nav-item': 'app-shell',
	'ut-nav-section': 'app-shell',
	'ut-sidebar': 'app-shell',
	'ut-count': 'app-shell',
	'ut-dot': 'app-shell',
	'ut-composer': 'ticket-composer',
	'ut-composer-bar': 'ticket-composer',
	'ut-thread': 'ticket-thread',
	'ut-msg': 'ticket-thread',
	'ut-msg-body': 'ticket-thread',
	'ut-msg-card': 'ticket-thread',
	'ut-msg-event': 'ticket-thread',
	'ut-msg-head': 'ticket-thread',
	'ut-msg-note': 'ticket-thread',
	'ut-record-head': 'ticket-detail-layout',
	'ut-record-title': 'ticket-detail-layout',
	'ut-topbar': 'app-shell',
	'ut-page-title': 'page-header',
	// Base reference primitives: not a single component, several compose them.
	'ut-icon': null,
	'ut-icon-md': null,
	'ut-muted': null,
	'ut-pad': null,
	'ut-row': null,
	'ut-stack': null,
	'ut-tab': null
};

/**
 * Classes whose implementation intentionally diverges from or supersedes the handoff reference
 * (#85: "the old reference's classes are not automatically required if ADR 0019 supersedes
 * them; document status"). Empty today — the radius-grammar changes in ADR 0019 touched which
 * token a class reads, not the class itself, so nothing here is `modified` or `deprecated` yet.
 * Add an entry the day one is: `{ status: 'modified' | 'deprecated', note: 'why' }`.
 */
const CLASS_STATUS_OVERRIDE: Record<string, { status: 'modified' | 'deprecated'; note: string }> =
	{};

/** The production 404 guard lives in the parent `+layout.server.ts` (ADR 0011/0013). */
export const load: PageServerLoad = () => {
	const css = readFileSync('docs/design/assets/css/components.css', 'utf8');
	const classNames = [
		...new Set([...css.matchAll(/\.(ut-[a-zA-Z0-9-]+)/g)].map((m) => m[1]))
	].sort();

	const rows: CoverageRow[] = classNames.map((className) => {
		const componentId = CLASS_TO_COMPONENT[className];
		const entry = componentId ? COMPONENT_MANIFEST.find((e) => e.id === componentId) : undefined;
		const override = CLASS_STATUS_OVERRIDE[className];
		return {
			className,
			status: override?.status ?? (entry ? 'implemented' : 'not-yet-built'),
			implementedBy: entry?.name ?? null,
			galleryHref: entry ? `/dev/components/${entry.id}` : null,
			note: override?.note ?? null
		};
	});

	return {
		rows,
		manifestCount: COMPONENT_MANIFEST.length,
		exceptionCount: GALLERY_EXCEPTIONS.length
	};
};
