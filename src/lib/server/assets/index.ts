/**
 * The assets domain's public surface (ADR 0002): routes validate input, call
 * one of these, and map the outcome to HTTP. Nothing below is reachable from a
 * route, and no route builds a query of its own.
 *
 * **Two kinds of check, split on purpose.** Whether a user may *reach* a screen
 * is a capability, gated by `requirePermission` in the route (ADR 0007). Which
 * *rows and fields* they then see is data, and that cannot live in a route — so
 * it lives in `scope.ts` and `view.ts`. The write functions below
 * trust the route's gate and scope tenancy only; the read functions resolve the
 * permission themselves, because for them the permission *is* the query.
 */

export { viewAsset } from './view';
export type { AssetView, FullAssetView, SharedAssetView } from './view';

/**
 * What `links` reads of an asset, a handover or a category to relate a ticket to
 * it (ADR 0002). The row scope itself (`scope.ts`) stays inside the domain.
 */
export {
	assetSnapshot,
	assetSummaries,
	categoryInOrganisation,
	findAssetInScope,
	handoverByCode,
	handoverInOrganisation,
	handoverSummaries
} from './link-targets';
export type { AssetLinkTarget, AssetLinkSummary, HandoverSummary } from './link-targets';

/** Asset registrations per day, for the KPI sparkline (#90). */
export { assetRegistrationsSparkline } from './sparkline';

/** Files attached to an asset: invoice, warranty, delivery note (ADR 0039). */
export {
	addAssetAttachments,
	getAssetAttachment,
	listAssetAttachments,
	readAssetAttachmentForm,
	removeAssetAttachment
} from './attachments';
export type {
	AddAssetAttachmentsFailure,
	AssetAttachmentBytes,
	AssetAttachmentDeps,
	AssetAttachmentView,
	RemoveAssetAttachmentFailure
} from './attachments';

/** Count per lifecycle state, for the donut on the assets index (#90). */
export { assetStateDistribution } from './state-distribution';
export type { AssetStateSlice } from './state-distribution';

export {
	listHandoverAgreements,
	listHandoverTemplateVersions,
	saveHandoverTemplate,
	removeHandoverOverride,
	getHandoverSettings,
	setHandoverLinkValidDays,
	setCategoryRequiresHandover,
	ensureDefaultHandoverTemplates,
	LINK_VALID_DAYS_DEFAULT,
	LINK_VALID_DAYS_MIN,
	LINK_VALID_DAYS_MAX
} from './handover-templates';
export type {
	HandoverAgreement,
	HandoverSettings,
	HandoverTemplateVersion,
	RemoveHandoverOverrideFailure,
	SaveHandoverTemplateFailure
} from './handover-templates';
export { deliver, listDeliverableAssets, WAIVE_REASON_MAX } from './deliver';
export { takeBack, listAssetsHeldBy } from './take-back';
export { signingLinkQr } from './handover-qr';
export type { HeldAsset, TakeBackDeps, TakeBackFailure, TakeBackItem } from './take-back';
export { decideHandover, openHandover } from './handover-decision';
export { ensureHandoverDocument, getHandoverDocument } from './handover-documents';
export { regulariseCustody } from './regularise-custody';
export type {
	RegularisationResult,
	RegularisedHandover,
	RegulariseDeps,
	RegulariseFilter,
	SkippedPerson
} from './regularise-custody';
export { resendHandover } from './handover-resend';
export type { ResendDeps, ResendFailure, ResentHandover } from './handover-resend';
export {
	custodyHandover,
	getHandover,
	HANDOVER_LIST_LIMIT,
	listHandovers,
	listOwnHandovers
} from './handover-list';
export type {
	CustodyHandover,
	HandoverDetail,
	HandoverDetailAsset,
	HandoverFilter,
	HandoverListItem
} from './handover-list';
export type {
	DocumentDeps,
	EnsureDocumentFailure,
	StoredHandoverDocument
} from './handover-documents';
export type {
	DecideFailure,
	DecidedStatus,
	DecisionDeps,
	DecisionEvidence,
	HandoverDecision,
	SigningAsset,
	SigningView
} from './handover-decision';
export type {
	DeliverableAsset,
	DeliverableFilter,
	DeliverDeps,
	DeliverFailure,
	DeliveredHandover,
	DeliverRequest
} from './deliver';
export { renderHandoverTemplate, resolveHandoverTemplate } from './handover-template';

export { getLabelSettings, setLabelOwnerText } from './label-settings';
export type { LabelSettings, SetLabelOwnerTextFailure } from './label-settings';
export type { HandoverDirection } from './handover-template';

export {
	createManufacturer,
	createCategory,
	createAssetModel,
	renameManufacturer,
	renameCategory,
	updateAssetModel,
	deleteManufacturer,
	deleteCategory,
	deleteAssetModel,
	listManufacturers,
	listCategories,
	listAssetModels
} from './catalogue';
export type {
	CatalogueEntry,
	CategoryEntry,
	CatalogueFailure,
	CatalogueEditFailure,
	CatalogueDeleteFailure,
	AssetModelFailure,
	AssetModelEditFailure,
	AssetModelEntry
} from './catalogue';

export {
	assets,
	assetModels,
	categories,
	manufacturers,
	assetState,
	assetCodeSequence
} from './schema';
export type { Asset, AssetModel, Category, Manufacturer } from './schema';
export {
	RESERVED_ASSET_TAGS,
	registerAssetInput,
	updateAssetDetailsInput,
	assetModelInput,
	categoryInput,
	manufacturerInput
} from './validation';
export type {
	RegisterAssetInput,
	UpdateAssetDetailsInput,
	AssetModelInput,
	CategoryInput,
	ManufacturerInput
} from './validation';

export {
	listAssets,
	listAssetChoices,
	toAssetOption,
	countAssetsByLocation,
	countAssetsInCustodyOf,
	countActive,
	assetSummary,
	resolveAssetTags,
	listAssetsByTags,
	getAssetByTag,
	assetTimeline
} from './reads';
export type { AssetListRequest, AssetChoice, AssetChoiceRequest, AssetSummary } from './reads';

export {
	registerAsset,
	updateAssetDetails,
	advanceAssetTagSequence,
	existingAssetKeys
} from './registration';
export type { RegisterAssetFailure, UpdateAssetFailure } from './registration';

export {
	archiveAsset,
	unarchiveAsset,
	assignCustody,
	returnCustody,
	changeState,
	changeLocation
} from './lifecycle';
export type { ArchiveAssetFailure, AssignCustodyFailure, ReturnCustodyFailure } from './lifecycle';

export { addAssetComment, listAssetComments } from './comments';

export { assetHits } from './search';
