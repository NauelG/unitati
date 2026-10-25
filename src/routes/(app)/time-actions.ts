import { error, fail } from '@sveltejs/kit';
import { parseDuration } from '#lib/domain/time.js';
import { m } from '#lib/paraglide/messages.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import {
	deleteEntry,
	discardTimer,
	editEntry,
	logTime,
	saveTimer,
	startTimer,
	type EditFailure,
	type TimeTarget
} from '#lib/server/time/index.js';
import { fieldsOf, rejected } from './assets/form-data';

/** What the person is told for each refusal of a time write. */
export function timeFailureMessage(
	failure: EditFailure | 'timer_already_running' | 'no_timer'
): string {
	const key = typeof failure === 'string' ? failure : failure.kind;
	switch (key) {
		case 'time_tracking_disabled':
			return m.time_error_disabled();
		case 'invalid_minutes':
			return m.time_error_invalid_duration();
		case 'invalid_date':
			return m.time_error_invalid_date();
		case 'future_date':
			return m.time_error_future_date();
		case 'invalid_type':
			return m.time_error_invalid_type();
		case 'note_too_long':
			return m.time_error_note_too_long();
		case 'project_archived':
			return m.time_error_project_archived();
		case 'entry_not_found':
		case 'record_not_found':
			return m.time_error_not_found();
		case 'stale_revision':
			return m.time_error_stale();
		case 'timer_already_running':
			return m.time_error_timer_running();
		case 'no_timer':
			return m.time_error_no_timer();
		default:
			return m.time_error_forbidden();
	}
}

/**
 * The `?/logTime`, `?/editTime` and `?/deleteTime` actions of a ticket or task
 * route (ADR 0051). `resolve` reads the record through its owning domain's
 * read policy, so one the viewer cannot see is a 404 before `time` is asked
 * anything (ADR 0050).
 */
export function timeActions<
	Event extends {
		locals: App.Locals;
		request: Request;
		params: Record<string, string>;
	}
>(
	requireViewer: (user: App.Locals['user']) => SessionUser,
	resolve: (user: SessionUser, event: Event) => Promise<TimeTarget | null>
) {
	async function read(event: Event, action: string) {
		const user = requireViewer(event.locals.user);
		const target = await resolve(user, event);
		if (!target) error(404, 'Not found');

		const fields = await fieldsOf(event.request);
		const minutes = parseDuration(fields.duration ?? '');
		if (minutes === null) return { rejection: rejected(action, m.time_error_invalid_duration()) };

		return {
			user,
			target,
			fields,
			input: {
				minutes,
				workDate: fields.workDate ?? '',
				typeId: fields.typeId || null,
				note: fields.note ?? null
			}
		};
	}

	return {
		logTime: async (event: Event) => {
			const read_ = await read(event, 'logTime');
			if ('rejection' in read_) return read_.rejection;

			const outcome = await logTime(read_.user, read_.target, read_.input);
			if (!outcome.ok) return rejected('logTime', timeFailureMessage(outcome.error));
			return { action: 'logTime' as const };
		},

		editTime: async (event: Event) => {
			const read_ = await read(event, 'editTime');
			if ('rejection' in read_) return read_.rejection;

			const id = read_.fields.id;
			if (!id)
				return fail(400, { action: 'editTime', message: m.time_error_not_found(), id: null });
			const outcome = await editEntry(read_.user, id, read_.input);
			if (!outcome.ok) return rejected('editTime', timeFailureMessage(outcome.error));
			return { action: 'editTime' as const };
		},

		startTimer: async (event: Event) => {
			const user = requireViewer(event.locals.user);
			const target = await resolve(user, event);
			if (!target) error(404, 'Not found');

			const outcome = await startTimer(user, target);
			if (!outcome.ok) return rejected('startTimer', timeFailureMessage(outcome.error));
			return { action: 'startTimer' as const };
		},

		/** Stopping, saved: the form's values become the entry and the timer goes. */
		saveTimer: async (event: Event) => {
			const read_ = await read(event, 'saveTimer');
			if ('rejection' in read_) return read_.rejection;

			const outcome = await saveTimer(read_.user, read_.input);
			if (!outcome.ok) return rejected('saveTimer', timeFailureMessage(outcome.error));
			return { action: 'saveTimer' as const };
		},

		/** Stopping, cancelled: the timer is discarded and nothing is logged. */
		discardTimer: async (event: Event) => {
			const user = requireViewer(event.locals.user);
			const outcome = await discardTimer(user);
			if (!outcome.ok) error(403, 'Forbidden');
			return { action: 'discardTimer' as const };
		},

		deleteTime: async (event: Event) => {
			const user = requireViewer(event.locals.user);
			const target = await resolve(user, event);
			if (!target) error(404, 'Not found');

			const { id } = await fieldsOf(event.request);
			if (!id) return rejected('deleteTime', m.time_error_not_found());
			const outcome = await deleteEntry(user, id);
			if (!outcome.ok) return rejected('deleteTime', timeFailureMessage(outcome.error));
			return { action: 'deleteTime' as const };
		}
	};
}
