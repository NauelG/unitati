/**
 * The knowledge domain's public surface (ADR 0002): routes validate input, call
 * one of these and map the outcome to HTTP. No route builds a query.
 *
 * **Two kinds of check, split on purpose.** Whether a user may reach a screen is
 * a capability, gated by `requirePermission` in the route (ADR 0007). Which rows
 * they then read is data, and lives here: every read starts from `scope.ts`.
 */

export {
	knowledgeSpaces,
	knowledgeSpaceAudience,
	pages,
	pageRevisions,
	pageCodeSequence
} from './schema';
export type { KnowledgeSpace, Page, PageRevision } from './schema';

export {
	archivePage,
	createPage,
	getPageByTag,
	listSpaceTree,
	movePage,
	pickPages,
	previewMove,
	publishPage,
	reorderPage,
	unarchivePage
} from './pages';
export type {
	MovePreview,
	PageArchiveFailure,
	PageCreateFailure,
	PageMoveConfirmationFailure,
	PageMoveFailure,
	PagePick,
	PagePublishFailure,
	PageReorderFailure,
	PageStatus,
	PageUnarchiveFailure,
	PageView,
	Placement,
	TreeEntry
} from './pages';

export { getRevision, listRevisions, restoreRevision, savePage } from './revisions';
export type {
	PageSaveFailure,
	PageSaveInput,
	RevisionEntry,
	RevisionRestoreFailure,
	RevisionView,
	SaveResult,
	StaleRevision
} from './revisions';

export { readablePages, readableSpaces, requireSpaceScope } from './scope';

export {
	archiveSpace,
	changeSpaceAudience,
	createSpace,
	deleteSpace,
	listSpaces,
	previewAudienceChange,
	updateSpace
} from './spaces';
export type {
	SpaceArchiveFailure,
	SpaceAudienceFailure,
	SpaceCreateFailure,
	SpaceDeleteFailure,
	SpaceEntry,
	SpacePreviewFailure,
	SpaceUpdateFailure
} from './spaces';

export {
	pageCreateInput,
	pageSaveInput,
	revisionRestoreInput,
	spaceInput,
	spaceUpdateInput
} from './validation';
export type { PageCreateInput, SpaceInput, SpaceUpdateInput } from './validation';
