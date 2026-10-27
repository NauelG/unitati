/**
 * The time module's entry point (ADR 0002, ADR 0052): callers import from here,
 * never from a file inside. Cross-cutting like `activity`: it owns the
 * entry-type catalogue, the time entries and the running timers of tickets and
 * tasks, and a caller resolves the record through its owning domain first.
 */

export type { TimeEntryType } from './schema';

export { isTimeTrackingEnabled, setTimeTracking, SEEDED_TYPE_NAME } from './settings';

export {
	createType,
	renameType,
	moveType,
	setDefaultType,
	removeType,
	listTypes,
	listOfferedTypes,
	MAX_TYPE_NAME_LENGTH
} from './types';
export type { CatalogueFailure, TypeView } from './types';

export {
	logTime,
	editEntry,
	deleteEntry,
	listEntriesFor,
	entryTarget,
	organisationToday,
	MAX_NOTE_LENGTH
} from './entries';
export type {
	EditFailure,
	EntryFailure,
	EntryInput,
	EntryView,
	RecordTime,
	TimeTarget
} from './entries';

export { projectTime, taskTime } from './totals';
export type { ProjectTime, TaskTime } from './totals';

export {
	startTimer,
	getRunningTimer,
	timerTarget,
	timerPayload,
	saveTimer,
	discardTimer
} from './timers';
export type { SaveTimerFailure, StartTimerFailure, TimerPayload, TimerView } from './timers';

export { reportEntries, reportAll, reportScope, projectEntries, getEntry } from './report';
export type { ReportFailure, ReportFilters, ReportPage, ReportRow } from './report';
export { timeEntriesCsv, parseCsvSeparator, CSV_COLUMNS } from './csv';
