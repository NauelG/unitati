import type { RelatedGroup, RelatedItem, ViaTask } from '#lib/server/links/index.js';

/**
 * One line of a relation panel. `relatedTo` answers per link, so a ticket
 * reaching a project through two tasks arrives twice (#149); the panel shows it
 * once, naming both tasks. Pure, so the rule is provable without a DOM.
 */
export interface RelatedRow {
	item: RelatedItem;
	/** The tasks a ticket reaches a project through; empty everywhere else. */
	vias: ViaTask[];
}

/** The group's records once each, in the link order of their first appearance. */
export function relatedRows(group: Pick<RelatedGroup, 'items'>): RelatedRow[] {
	const rows = new Map<string, RelatedRow>();

	for (const item of group.items) {
		const row = rows.get(item.ref.id);
		if (!row) {
			rows.set(item.ref.id, { item, vias: item.via ? [item.via] : [] });
		} else if (item.via && !row.vias.some((via) => via.id === item.via!.id)) {
			row.vias.push(item.via);
		}
	}

	return [...rows.values()];
}
