import type { TicketPorts } from '../service-desk';
import { failure, success } from '../shared/outcome';
import { linkAsset } from './ticket-asset';
import { linkCategory } from './ticket-category';
import { citePageTags } from './ticket-page';

/**
 * `links` implements the ports `service-desk` declares (ADR 0049), by adapting
 * the relation writers that already exist. `server/ports.ts` registers the
 * object at startup; nothing else needs it.
 *
 * Each adapter lets the failures that mean "the caller broke an assumption"
 * (the ticket the caller just wrote is not there) propagate as errors, and
 * returns only the refusals the port declares.
 */
export const ticketPortsImplementation: Pick<
	TicketPorts,
	'affectedAssets' | 'requestedCategory' | 'citedPages'
> = {
	async affectedAssets(tx, actor, { ticketId, assetIds }) {
		for (const assetId of assetIds) {
			const linked = await linkAsset(tx, actor, { ticketId, assetId });
			if (linked.ok) continue;
			if (linked.error === 'asset_not_found') return failure('asset_not_found');
			throw new Error(`Could not link asset ${assetId} to the ticket just opened: ${linked.error}`);
		}
		return success(undefined);
	},

	async requestedCategory(tx, actor, { ticketId, categoryId }) {
		const linked = await linkCategory(tx, actor, { ticketId, categoryId });
		if (linked.ok) return success(undefined);
		if (linked.error === 'category_not_found') return failure('category_not_found');
		throw new Error(
			`Could not link category ${categoryId} to the ticket just opened: ${linked.error}`
		);
	},

	citedPages(tx, actor, { ticketId, pageTags, visibility }) {
		return citePageTags(tx, actor, ticketId, pageTags, visibility);
	}
};
