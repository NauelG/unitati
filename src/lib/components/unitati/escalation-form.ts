import { m } from '#lib/paraglide/messages.js';

/**
 * What the escalation Sheet decides from its own state, as pure functions so the
 * sentences and the button name are provable without mounting it (this repo's
 * unit tests run in Node, with no DOM).
 *
 * The Sheet shows three targets, the third with its own *nuevo / existente*
 * choice. The domain knows four kinds of escalation; `escalationKind` is the
 * join between the two.
 */

export type EscalateTarget = 'new_task' | 'existing_task' | 'project';
export type ProjectMode = 'new' | 'existing';
export type EscalationKind = 'new_task' | 'existing_task' | 'new_project' | 'existing_project';

/** The record the user picked, as far as the sentence and the button need to name it. */
export interface PickedRecord {
	/** `TSK-0042`, `PRJ-007`. */
	tag: string;
	/** Shown in the consequence: "TSK-0042 · Replace toner". */
	label: string;
}

/** What the button and the sentences need to name a picked option: its code, and "code · title". */
export function pickedFrom(option: { tag?: string; title?: string; label: string }): PickedRecord {
	const tag = option.tag ?? option.label;
	return { tag, label: option.title ? `${tag} · ${option.title}` : tag };
}

export function escalationKind(target: EscalateTarget, mode: ProjectMode): EscalationKind {
	if (target === 'project') return mode === 'new' ? 'new_project' : 'existing_project';
	return target;
}

/**
 * Without `projects.manage` the actor may relate work and not conjure it
 * (`forbidden_create`): the two *nuevo* choices are not offered, so the Sheet
 * can never ask for what the domain would refuse.
 */
export function targetsFor(canCreate: boolean): EscalateTarget[] {
	return canCreate ? ['new_task', 'existing_task', 'project'] : ['existing_task', 'project'];
}

export function projectModesFor(canCreate: boolean): ProjectMode[] {
	return canCreate ? ['new', 'existing'] : ['existing'];
}

export function initialTarget(canCreate: boolean): EscalateTarget {
	return targetsFor(canCreate)[0];
}

/** The primary button names the act, so there is no second confirmation. */
export function submitLabel(kind: EscalationKind, picked: PickedRecord | null): string {
	switch (kind) {
		case 'new_task':
			return m.escalate_submit_new_task();
		case 'new_project':
			return m.escalate_submit_new_project();
		case 'existing_task':
			return picked ? m.escalate_submit_link({ tag: picked.tag }) : m.escalate_submit_task_none();
		case 'existing_project':
			return picked
				? m.escalate_submit_link({ tag: picked.tag })
				: m.escalate_submit_project_none();
	}
}

export interface Draft {
	projectId: string | null;
	title: string;
	description: string;
	taskId: string | null;
	existingProjectId: string | null;
	name: string;
}

/** Enough to submit: the same minimum the domain's validators ask for, not the whole of it. */
export function isReady(kind: EscalationKind, draft: Draft): boolean {
	switch (kind) {
		case 'new_task':
			return Boolean(draft.projectId) && draft.title.trim() !== '';
		case 'existing_task':
			return Boolean(draft.taskId);
		case 'existing_project':
			return Boolean(draft.existingProjectId);
		case 'new_project':
			return draft.name.trim() !== '';
	}
}

export interface ConsequenceInput {
	kind: EscalationKind;
	/** The chosen project (new task) or the chosen target (existing task or project). */
	picked: PickedRecord | null;
	/** The ticket's current status, already worded. */
	statusLabel: string;
	assigneeName: string | null;
}

/**
 * The informational text under the fields: what is created, what is linked,
 * what does not change and who is told. Three sentences at most, in that order.
 * A project link sends no mail, so for a project there is no fourth sentence.
 */
export function consequence(input: ConsequenceInput): string[] {
	const { kind, picked } = input;
	const lines: string[] = [];

	switch (kind) {
		case 'new_task':
			lines.push(
				picked
					? m.escalate_effect_new_task({ project: picked.label })
					: m.escalate_effect_new_task_no_project()
			);
			break;
		case 'existing_task':
			lines.push(
				picked
					? m.escalate_effect_existing_task({ target: picked.label })
					: m.escalate_effect_existing_task_none()
			);
			break;
		case 'existing_project':
			lines.push(
				picked
					? m.escalate_effect_existing_project({ target: picked.label })
					: m.escalate_effect_existing_project_none()
			);
			break;
		case 'new_project':
			lines.push(m.escalate_effect_new_project());
			break;
	}

	lines.push(m.escalate_keeps({ status: input.statusLabel }));

	if (kind === 'new_task' || kind === 'existing_task') {
		lines.push(
			input.assigneeName
				? m.escalate_notify_assignee({ name: input.assigneeName })
				: m.escalate_notify_nobody()
		);
	}

	return lines;
}

/** The toast after success names the act with the code of what was created or linked. */
export function successText(kind: EscalationKind, tag: string): string {
	switch (kind) {
		case 'new_task':
			return m.escalate_toast_task_created({ tag });
		case 'existing_task':
			return m.escalate_toast_task_linked({ tag });
		case 'new_project':
			return m.escalate_toast_project_created({ tag });
		case 'existing_project':
			return m.escalate_toast_project_linked({ tag });
	}
}
