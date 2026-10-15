import { z } from 'zod';
import type { EscalationTarget } from './escalate';

/**
 * Reads the escalation form's flat payload into the domain's discriminated
 * target. When it is not one, says which field to blame so the Sheet can put the
 * sentence next to it instead of at the bottom.
 */

export type EscalationField = 'title' | 'projectId' | 'taskId' | 'name' | 'ownerPersonId' | 'kind';

export type ParsedEscalation =
	{ ok: true; target: EscalationTarget } | { ok: false; field: EscalationField };

const uuid = z.uuid();
const bad = (field: EscalationField): ParsedEscalation => ({ ok: false, field });

export function parseEscalation(fields: Record<string, string>): ParsedEscalation {
	switch (fields.kind) {
		case 'new_task': {
			const projectId = uuid.safeParse(fields.projectId);
			if (!projectId.success) return bad('projectId');
			if (!fields.title?.trim()) return bad('title');
			return {
				ok: true,
				target: {
					kind: 'new_task',
					projectId: projectId.data,
					title: fields.title,
					description: fields.description?.trim() ? fields.description : null
				}
			};
		}
		case 'existing_task': {
			const taskId = uuid.safeParse(fields.taskId);
			return taskId.success
				? { ok: true, target: { kind: 'existing_task', taskId: taskId.data } }
				: bad('taskId');
		}
		case 'existing_project': {
			const projectId = uuid.safeParse(fields.projectId);
			return projectId.success
				? { ok: true, target: { kind: 'existing_project', projectId: projectId.data } }
				: bad('projectId');
		}
		case 'new_project': {
			if (!fields.name?.trim()) return bad('name');
			const owner = fields.ownerPersonId ? uuid.safeParse(fields.ownerPersonId) : null;
			if (owner && !owner.success) return bad('ownerPersonId');
			return {
				ok: true,
				target: { kind: 'new_project', name: fields.name, ownerPersonId: owner?.data ?? null }
			};
		}
		default:
			return bad('kind');
	}
}

/** The field a domain `invalid_input` belongs to: the one free-text field each kind has. */
export function invalidField(kind: EscalationTarget['kind']): EscalationField | null {
	if (kind === 'new_task') return 'title';
	if (kind === 'new_project') return 'name';
	return null;
}
