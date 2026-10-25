import { ASSET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { HANDOVER_STATES } from '#lib/domain/handover.js';
import { can } from '../access/permissions';
import {
	assetTimeline,
	custodyHandover,
	getAssetByTag,
	listAssetAttachments,
	listAssetComments,
	listAssetModels,
	listAssetsHeldBy,
	listCategories,
	listDeliverableAssets,
	listHandovers,
	listManufacturers,
	WAIVE_REASON_MAX
} from '../assets';
import type { SessionUser } from '../auth/guards';
import { listLocations, listPeople } from '../directory';
import {
	assetRelations,
	mergeAssetTimeline,
	RECENT_MONTHS,
	recentTicketCount,
	relatedTo,
	requestedCategory,
	type AssetRelatedGroup,
	type AssetTimelineItem
} from '../links';
import { getTicketByTag } from '../service-desk';
import { failure, success } from '../shared/outcome';
import { activePeople } from './choices';

/**
 * What the viewer may do on this asset, with the record's state already applied
 * (ADR 0050 rule 4): a shared asset (whole-row access withheld) offers no act on
 * its row, and an archived one is read-only apart from unarchiving. The
 * domain's writes stay the authority.
 */
export interface AssetMay {
	printLabel: boolean;
	/** The edit Sheet, which also reaches the model catalogue. */
	edit: boolean;
	changeLocation: boolean;
	changeState: boolean;
	archive: boolean;
	unarchive: boolean;
	comment: boolean;
	attach: boolean;
	/** Handing the asset over: only while nobody holds it. */
	deliver: boolean;
	/** Taking it back: only while somebody holds it. */
	takeBack: boolean;
	/** Skipping the signature: offered inside the delivery dialog only (ADR 0035, decision 8). */
	waiveHandover: boolean;
	/** Links are written on the ticket, so the ticket permission decides (#168). */
	linkTickets: boolean;
}

/** Picker data. Each list is empty unless the act it serves is allowed (ADR 0050 rule 5). */
export interface AssetChoices {
	people: { id: string; fullName: string }[];
	locations: Awaited<ReturnType<typeof listLocations>>;
	/** What the delivery dialog can offer, narrowed to the category an equipment request asked for (#271). */
	deliverable: Awaited<ReturnType<typeof listDeliverableAssets>>;
	/** What the take-back dialog lists: the other assets the custodian holds. */
	heldAssets: Awaited<ReturnType<typeof listAssetsHeldBy>>;
	models: Awaited<ReturnType<typeof listAssetModels>>;
	catalogues: {
		manufacturers: Awaited<ReturnType<typeof listManufacturers>>;
		categories: Awaited<ReturnType<typeof listCategories>>;
	};
}

/** What the viewer arrived with (ADR 0050 rule 7): user intent, not transport. */
export interface AssetContext {
	/** The tag of the ticket they came from (#279). */
	fromTicket?: string | null;
}

export interface AssetRail {
	timeline: AssetTimelineItem[] | null;
	recentTickets: number;
	/** The same `relatedTo` answer the timeline was merged from, for the constellation: no second query. */
	related: AssetRelatedGroup[];
}

export async function assetScreen(
	viewer: SessionUser,
	assetTag: string,
	context: AssetContext = {}
) {
	if (!ASSET_READ_PERMISSIONS.some((permission) => can(viewer, permission))) {
		return failure('not_found');
	}

	const found = await getAssetByTag(viewer, assetTag);
	if (!found.ok) return failure('not_found');
	const asset = found.value;
	const full = asset.visibility === 'full';
	const custodianPersonId = asset.visibility === 'full' ? asset.custodianPersonId : null;
	const archived = asset.visibility === 'full' && asset.archivedAt !== null;

	const manages = can(viewer, 'assets.manage');
	const checkout = can(viewer, 'assets.checkout');
	const may: AssetMay = {
		printLabel: manages,
		edit: manages && full,
		changeLocation: manages,
		changeState: manages && !archived,
		archive: manages && full && !archived,
		unarchive: manages && full && archived,
		comment: manages && full,
		attach: manages && full,
		deliver: checkout && full && custodianPersonId === null,
		takeBack: checkout && full && custodianPersonId !== null,
		waiveHandover: checkout && can(viewer, 'assets.handover.waive'),
		linkTickets: full && can(viewer, 'tickets.manage')
	};

	// Same gate as the history: a shared-asset visitor reads neither.
	const comments = await listAssetComments(viewer, assetTag);

	// Coming from a ticket (#279): the dialogs preselect it and its requester.
	// Only for someone who may link, and only a ticket they can read.
	const fromTicketTag = context.fromTicket?.trim().toUpperCase();
	const fromTicket =
		fromTicketTag && checkout && can(viewer, 'tickets.manage')
			? await getTicketByTag(viewer, fromTicketTag)
			: null;
	// An equipment request narrows the picker to the category it asked for (#271);
	// the technician can still deliver anything from the asset's own page.
	const requested =
		fromTicket?.ok && fromTicket.value.requestFormId
			? await requestedCategory(viewer.organisationId, fromTicket.value.id)
			: null;

	// The pickers feed the action forms, which only a person who can act sees.
	const [people, locations] =
		full && (manages || checkout)
			? await Promise.all([listPeople(viewer.organisationId), listLocations(viewer.organisationId)])
			: [[], []];
	const [deliverable, heldAssets, models, manufacturers, categories] = await Promise.all([
		may.deliver
			? listDeliverableAssets(
					viewer.organisationId,
					undefined,
					requested ? { categoryId: requested.id } : {}
				)
			: [],
		may.takeBack && custodianPersonId
			? listAssetsHeldBy(viewer.organisationId, custodianPersonId)
			: [],
		may.edit ? listAssetModels(viewer.organisationId) : [],
		may.edit ? listManufacturers(viewer.organisationId) : [],
		may.edit ? listCategories(viewer.organisationId) : []
	]);

	// Staff only: an employee holding the asset sees their own handovers in the portal.
	const staff = full && can(viewer, 'assets.view');
	const [handovers, custody] = staff
		? await Promise.all([
				listHandovers(viewer, { assetId: asset.id, states: [...HANDOVER_STATES] }),
				custodyHandover(viewer, { id: asset.id, custodianPersonId: asset.custodianPersonId })
			])
		: [null, null];
	// Invoices and warranties follow the serial's rule: whole-row viewers only.
	const attachments = staff ? await listAssetAttachments(viewer, asset.id) : null;

	const choices: AssetChoices = {
		people: activePeople(people),
		locations,
		deliverable,
		heldAssets,
		models,
		catalogues: { manufacturers, categories }
	};

	return success({
		asset,
		may,
		choices,
		context: {
			fromTicket: fromTicket?.ok
				? {
						tag: fromTicket.value.ticketTag,
						requesterPersonId: fromTicket.value.requesterPersonId
					}
				: null
		},
		handovers,
		custody,
		attachments: attachments?.ok ? attachments.value : null,
		comments: comments.ok ? comments.value : null,
		recentMonths: RECENT_MONTHS,
		waiveReasonMax: WAIVE_REASON_MAX,
		// Slow, so returned unawaited: the route decides whether to stream it (#89).
		rail: railOf(viewer, assetTag, {
			visibility: asset.visibility,
			id: asset.visibility === 'full' ? asset.id : undefined
		})
	});
}

export type AssetScreen = Extract<Awaited<ReturnType<typeof assetScreen>>, { ok: true }>['value'];

async function railOf(
	viewer: SessionUser,
	assetTag: string,
	asset: { visibility: 'full' | 'shared'; id?: string }
): Promise<AssetRail> {
	// Gated separately inside the domain: holding `assets.view.shared` shows a
	// shared asset's name and place, and explicitly not its history (ADR 0007).
	const history = await assetTimeline(viewer, assetTag);

	// The live half of the rail: tickets raised on this machine, with the status
	// they have today. Asked only when the history itself is visible, and
	// `relatedTo` withholds tickets from anybody without `tickets.view`.
	const related =
		history.ok && asset.visibility === 'full' && asset.id
			? assetRelations(await relatedTo(viewer, { kind: 'asset', id: asset.id }))
			: [];
	return {
		timeline: history.ok ? mergeAssetTimeline(history.value, related) : null,
		recentTickets: recentTicketCount(related, new Date()),
		related
	};
}
