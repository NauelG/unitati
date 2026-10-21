import { m } from '#lib/paraglide/messages.js';
import type { ActivityEntry } from '#lib/server/activity/index.js';
import type { Priority } from '#lib/domain/status.js';
import { statusLabel } from './status.js';

/** `normal` has no badge, but a sentence about changing from it needs the word. */
function priorityWord(priority: Priority): string {
	return priority === 'normal' ? m.priority_normal() : statusLabel(priority);
}

function projectVisibilityLabel(visibility: 'organisation' | 'members'): string {
	return visibility === 'members'
		? m.activity_project_visibility_members()
		: m.activity_project_visibility_organisation();
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
			return entry.payload.via === 'import'
				? m.activity_asset_created_imported()
				: m.activity_asset_created();

		case 'custody.assigned':
			return m.activity_custody_assigned({ personName: entry.payload.toPersonName });

		case 'custody.returned': {
			const { fromPersonName: personName, condition, conditionNotes: notes } = entry.payload;
			// Only a take-back (#278) records a condition; the plain return reads as before.
			if (!condition) return m.activity_custody_returned({ personName });
			const word = {
				good: m.activity_condition_good,
				damaged: m.activity_condition_damaged,
				incomplete: m.activity_condition_incomplete
			}[condition]();
			return notes
				? m.activity_custody_returned_condition_notes({ personName, condition: word, notes })
				: m.activity_custody_returned_condition({ personName, condition: word });
		}

		case 'handover.issued':
			return m.activity_handover_issued({ code: entry.payload.code });

		case 'handover.accepted':
			return m.activity_handover_accepted({ code: entry.payload.code });

		case 'handover.rejected':
			return m.activity_handover_rejected({
				code: entry.payload.code,
				reason: entry.payload.reason
			});

		case 'handover.waived':
			return m.activity_handover_waived({
				code: entry.payload.code,
				reason: entry.payload.reason
			});

		case 'handover.resent':
			return m.activity_handover_resent({ code: entry.payload.code });

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

		case 'ticket.subject.changed':
			return m.activity_ticket_subject_changed({
				from: entry.payload.from,
				to: entry.payload.to
			});

		case 'comment.edited':
			return m.activity_comment_edited();

		case 'link.asset.added':
			return m.activity_link_asset_added();

		case 'link.asset.removed':
			return m.activity_link_asset_removed();

		// The snapshot, not today's name: the task may have been renamed since.
		case 'link.task.added':
			return m.activity_link_task_added({
				task: `${entry.payload.taskTag} ${entry.payload.taskTitle}`
			});

		case 'link.task.removed':
			return m.activity_link_task_removed({
				task: `${entry.payload.taskTag} ${entry.payload.taskTitle}`
			});

		case 'link.project.added':
			return m.activity_link_project_added({
				project: `${entry.payload.projectTag} ${entry.payload.projectName}`
			});

		case 'link.project.removed':
			return m.activity_link_project_removed({
				project: `${entry.payload.projectTag} ${entry.payload.projectName}`
			});

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

		case 'project.visibility.changed':
			return m.activity_project_visibility_changed({
				from: projectVisibilityLabel(entry.payload.from),
				to: projectVisibilityLabel(entry.payload.to)
			});

		case 'project.member.added':
			return m.activity_project_member_added({ personName: entry.payload.personName });

		case 'project.member.removed':
			if (entry.payload.unassignedTaskCount === 0) {
				return m.activity_project_member_removed_none({ personName: entry.payload.personName });
			}
			return entry.payload.unassignedTaskCount === 1
				? m.activity_project_member_removed_one({ personName: entry.payload.personName })
				: m.activity_project_member_removed_other({
						personName: entry.payload.personName,
						count: entry.payload.unassignedTaskCount
					});

		case 'project.attachment.added':
			return m.activity_project_attachment_added({ filename: entry.payload.filename });

		case 'project.attachment.removed':
			return m.activity_project_attachment_removed({ filename: entry.payload.filename });

		case 'task.attachment.added':
			return m.activity_task_attachment_added({ filename: entry.payload.filename });

		case 'task.attachment.removed':
			return m.activity_task_attachment_removed({ filename: entry.payload.filename });

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

		case 'person.created':
			return entry.payload.via === 'import'
				? m.activity_person_created_imported()
				: m.activity_person_created();

		case 'person.deactivated':
			return m.activity_person_deactivated();

		case 'person.reactivated':
			return m.activity_person_reactivated();

		case 'person.department.changed':
			return m.activity_person_department_changed({
				from: entry.payload.fromDepartmentName ?? m.activity_department_none(),
				to: entry.payload.toDepartmentName ?? m.activity_department_none()
			});

		case 'person.location.changed':
			if (entry.payload.reason === 'location_deleted') {
				return m.activity_person_location_cleared_by_delete({
					location: entry.payload.from?.path ?? m.directory_no_location()
				});
			}
			if (entry.payload.reason === 'imported') {
				return m.activity_person_location_imported({
					location: entry.payload.to?.path ?? m.directory_no_location()
				});
			}
			return m.activity_person_location_changed({
				from: entry.payload.from?.path ?? m.directory_no_location(),
				to: entry.payload.to?.path ?? m.directory_no_location()
			});

		case 'catalogue.location.created':
			return m.activity_location_created({ path: entry.payload.path });

		case 'catalogue.location.updated':
			return locationUpdatedSentence(entry.payload);

		case 'catalogue.location.deleted':
			return m.activity_location_deleted({ path: entry.payload.path });

		default: {
			const unhandled: never = entry;
			throw new Error(`Unhandled activity verb: ${JSON.stringify(unhandled)}`);
		}
	}
}

type LocationUpdatedPayload = Extract<
	ActivityEntry,
	{ verb: 'catalogue.location.updated' }
>['payload'];

/** The changed fields as the words a reader knows them by; latitude and longitude read as one. */
function locationChangedFields(changes: LocationUpdatedPayload['changes']): string[] {
	const fields: string[] = [];
	if (changes.name) fields.push(m.activity_location_field_name());
	if (changes.parent) fields.push(m.activity_location_field_parent());
	if (changes.code) fields.push(m.activity_location_field_code());
	if (changes.address) fields.push(m.activity_location_field_address());
	if (changes.notes) fields.push(m.activity_location_field_notes());
	if (changes.latitude || changes.longitude) {
		fields.push(m.activity_location_field_coordinates());
	}
	return fields;
}

/**
 * A rename or a move alone reads as itself; anything else is one "edited"
 * sentence listing what changed, so a multi-field save is a single line and not
 * a paragraph.
 */
function locationUpdatedSentence(payload: LocationUpdatedPayload): string {
	const { changes, path } = payload;
	const fields = locationChangedFields(changes);

	if (fields.length === 1 && changes.name) {
		return m.activity_location_renamed({ from: changes.name.from, to: changes.name.to });
	}
	if (fields.length === 1 && changes.parent) {
		const name = path.split(' › ').at(-1) ?? path;
		return m.activity_location_moved({
			name,
			from: changes.parent.from?.path ?? m.activity_location_top_level(),
			to: changes.parent.to?.path ?? m.activity_location_top_level()
		});
	}
	return m.activity_location_edited({ path, fields: fields.join(', ') });
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
