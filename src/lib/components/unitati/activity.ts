import { m } from '#lib/paraglide/messages.js';
import type { ActivityEntry } from '#lib/server/activity/index.js';
import type { Priority } from '#lib/domain/status.js';
import { statusLabel } from './status.js';

/** `normal` has no badge, but a sentence about changing from it needs the word. */
function priorityWord(priority: Priority): string {
	return priority === 'normal' ? m.priority_normal() : statusLabel(priority);
}

/**
 * Turns an activity entry into the sentence a reader sees (ADR 0009). It lives
 * with the components, not with the table: the row stores a verb and a payload,
 * and producing words from them is rendering.
 *
 * The `switch` is exhaustive, and that is the point. The `never` in the default
 * branch means a verb added to `ACTIVITY_VERBS` without a case here fails
 * `npm run check` — without it, the first verb someone forgets ships as a blank
 * line in a history.
 *
 * The type import reaches into `server/` for a type only, which is erased at
 * build time — and through the module's `index.ts`, because that file says
 * callers import from there and never from a file inside it (ADR 0002).
 */
export function activitySentence(entry: ActivityEntry): string {
	switch (entry.verb) {
		case 'asset.created':
			return m.activity_asset_created();

		case 'custody.assigned':
			return m.activity_custody_assigned({ personName: entry.payload.toPersonName });

		case 'custody.returned':
			return m.activity_custody_returned({ personName: entry.payload.fromPersonName });

		case 'state.changed':
			return m.activity_state_changed({
				from: statusLabel(entry.payload.from),
				to: statusLabel(entry.payload.to)
			});

		case 'location.changed':
			// Both ends are nullable: an asset can arrive from nowhere, or come off
			// a location without being given another.
			return m.activity_location_changed({
				from: entry.payload.fromLocationName ?? m.activity_location_none(),
				to: entry.payload.toLocationName ?? m.activity_location_none()
			});

		case 'note.added':
			return m.activity_note_added();

		case 'ticket.created':
			return m.activity_ticket_created();

		case 'ticket.status.changed':
			return m.activity_ticket_status_changed({
				from: statusLabel(entry.payload.from),
				to: statusLabel(entry.payload.to)
			});

		case 'ticket.assigned':
			return m.activity_ticket_assigned({ personName: entry.payload.toPersonName });

		case 'ticket.unassigned':
			return m.activity_ticket_unassigned({ personName: entry.payload.fromPersonName });

		case 'ticket.priority.changed':
			return m.activity_ticket_priority_changed({
				from: priorityWord(entry.payload.from),
				to: priorityWord(entry.payload.to)
			});

		case 'ticket.queue.changed':
			return m.activity_ticket_queue_changed({
				from: entry.payload.fromQueueName,
				to: entry.payload.toQueueName
			});

		case 'link.asset.added':
			return m.activity_link_asset_added();

		case 'link.asset.removed':
			return m.activity_link_asset_removed();

		case 'project.created':
			return m.activity_project_created();

		case 'project.archived':
			return m.activity_project_archived();

		case 'project.unarchived':
			return m.activity_project_unarchived();

		case 'project.owner.changed':
			// Either end can be nobody: a project gains an owner, or loses one.
			return m.activity_project_owner_changed({
				from: entry.payload.fromPersonName ?? m.activity_project_owner_none(),
				to: entry.payload.toPersonName ?? m.activity_project_owner_none()
			});

		case 'project.due.changed':
			return m.activity_project_due_changed({
				from: entry.payload.from ?? m.activity_due_none(),
				to: entry.payload.to ?? m.activity_due_none()
			});

		case 'task.created':
			return m.activity_task_created();

		case 'task.state.changed':
			// The names are the snapshot taken at the move, not today's catalogue.
			return m.activity_task_state_changed({
				from: entry.payload.fromStateName,
				to: entry.payload.toStateName
			});

		case 'task.assigned':
			return m.activity_task_assigned({ personName: entry.payload.toPersonName });

		case 'task.unassigned':
			return m.activity_task_unassigned({ personName: entry.payload.fromPersonName });

		case 'task.due.changed':
			return m.activity_task_due_changed({
				from: entry.payload.from ?? m.activity_due_none(),
				to: entry.payload.to ?? m.activity_due_none()
			});

		case 'task.project.changed':
			return m.activity_task_project_changed({
				from: `${entry.payload.fromProjectTag} ${entry.payload.fromProjectName}`,
				to: `${entry.payload.toProjectTag} ${entry.payload.toProjectName}`
			});

		default: {
			const unhandled: never = entry;
			throw new Error(`Unhandled activity verb: ${JSON.stringify(unhandled)}`);
		}
	}
}

export type ProjectChangedPart = { text: string } | { project: { tag: string; name: string } };

type ProjectChangedPayload = Extract<ActivityEntry, { verb: 'task.project.changed' }>['payload'];

// Control characters that cannot occur in a message: stand-ins for the two
// placeholders, so the translated sentence keeps its own word order.
const FROM = '\u0001';
const TO = '\u0002';

/**
 * The "moved from PRJ-1 A to PRJ-2 B" sentence cut at its two projects, so the
 * renderer can link each code. Splitting the translated message, rather than
 * concatenating pieces, leaves word order to the locale.
 */
export function projectChangedParts(payload: ProjectChangedPayload): ProjectChangedPart[] {
	const sentence = m.activity_task_project_changed({ from: FROM, to: TO });

	return sentence
		.split(new RegExp(`(${FROM}|${TO})`))
		.filter((piece) => piece !== '')
		.map((piece): ProjectChangedPart => {
			if (piece === FROM) {
				return { project: { tag: payload.fromProjectTag, name: payload.fromProjectName } };
			}
			if (piece === TO) {
				return { project: { tag: payload.toProjectTag, name: payload.toProjectName } };
			}
			return { text: piece };
		});
}
