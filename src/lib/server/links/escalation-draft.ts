import { TASK_TITLE_MAX } from '../projects';

/**
 * What the escalation form (#150) pre-fills when a ticket becomes a task: the
 * subject as the title, the opening message as the description. Pure, so the
 * cut is provable without a database.
 */

export interface EscalationDraft {
	title: string;
	description: string | null;
}

export function escalationDraft(ticket: {
	subject: string;
	description: string | null;
}): EscalationDraft {
	// The limit is the validator's, which counts UTF-16 units; walking code
	// points drops an emoji at the boundary whole instead of leaving half a
	// surrogate pair, and the trim after the cut keeps the title from ending on
	// the space the cut landed on.
	let title = '';
	for (const character of ticket.subject.trim()) {
		if (title.length + character.length > TASK_TITLE_MAX) break;
		title += character;
	}
	title = title.trimEnd();
	const description = ticket.description?.trim();

	return { title, description: description ? description : null };
}
