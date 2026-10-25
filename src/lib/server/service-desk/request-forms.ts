import { and, asc, eq } from 'drizzle-orm';
import type { RequestFormKind } from '#lib/domain/request-form.js';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketPorts } from './ports';
import { queues, requestForms } from './schema';
import { openTicket, type CreateTicketFailure, type Deps } from './tickets';
import {
	equipmentRequestInput,
	requestFormEditInput,
	requestFormInput,
	type EquipmentRequestInput,
	type RequestFormEditInput,
	type RequestFormInput
} from './validation';

/**
 * Request forms (ADR 0037, #271): what an employee picks in the portal to say
 * what they are asking for. The form fixes the starting queue and the kind; the
 * kind decides which fields the portal asks for and what fulfils the ticket.
 *
 * The catalogue is staff business (`tickets.manage`, gated by the settings
 * section); reading the active forms and submitting one is an employee's.
 */

export type RequestFormFailure = 'duplicate_request_form_name' | 'queue_not_found';
export type RequestFormEditFailure = RequestFormFailure | 'request_form_not_found';
export type RequestFormDeleteFailure = 'request_form_not_found' | 'request_form_in_use';

export interface RequestFormEntry {
	id: string;
	name: string;
	description: string;
	kind: RequestFormKind;
	queueId: string;
	queueName: string;
	active: boolean;
}

const entryColumns = {
	id: requestForms.id,
	name: requestForms.name,
	description: requestForms.description,
	kind: requestForms.kind,
	queueId: requestForms.queueId,
	queueName: queues.name,
	active: requestForms.active
};

function entries() {
	return getDb()
		.select(entryColumns)
		.from(requestForms)
		.innerJoin(queues, eq(queues.id, requestForms.queueId));
}

/** Every form of the organisation, the inactive ones included: the settings catalogue. */
export function listRequestForms(viewer: SessionUser): Promise<RequestFormEntry[]> {
	return entries()
		.where(eq(requestForms.organisationId, viewer.organisationId))
		.orderBy(asc(requestForms.name));
}

/** What the portal offers. A deactivated form is gone from here, not greyed out. */
export function listActiveRequestForms(viewer: SessionUser): Promise<RequestFormEntry[]> {
	return entries()
		.where(
			and(eq(requestForms.organisationId, viewer.organisationId), eq(requestForms.active, true))
		)
		.orderBy(asc(requestForms.name));
}

/** One active form, or null: an inactive or foreign id is the same answer as a missing one. */
export async function getActiveRequestForm(
	viewer: SessionUser,
	formId: string
): Promise<RequestFormEntry | null> {
	const [form] = await entries()
		.where(
			and(
				eq(requestForms.id, formId),
				eq(requestForms.organisationId, viewer.organisationId),
				eq(requestForms.active, true)
			)
		)
		.limit(1);
	return form ?? null;
}

async function queueInOrganisation(actor: SessionUser, queueId: string): Promise<boolean> {
	const [queue] = await getDb()
		.select({ id: queues.id })
		.from(queues)
		.where(and(eq(queues.id, queueId), eq(queues.organisationId, actor.organisationId)))
		.limit(1);
	return Boolean(queue);
}

export async function createRequestForm(
	actor: SessionUser,
	input: RequestFormInput
): Promise<Outcome<{ id: string }, RequestFormFailure>> {
	const values = requestFormInput.parse(input);
	if (!(await queueInOrganisation(actor, values.queueId))) return failure('queue_not_found');

	try {
		const [row] = await getDb()
			.insert(requestForms)
			.values({ ...values, organisationId: actor.organisationId })
			.returning({ id: requestForms.id });
		return success({ id: row.id });
	} catch (error) {
		if (uniqueConstraintName(error) === 'request_forms_org_name') {
			return failure('duplicate_request_form_name');
		}
		throw error;
	}
}

/** The kind is fixed at creation: tickets already filed under it were asked the kind's questions. */
export async function updateRequestForm(
	actor: SessionUser,
	formId: string,
	input: RequestFormEditInput
): Promise<Outcome<void, RequestFormEditFailure>> {
	const values = requestFormEditInput.parse(input);
	if (!(await queueInOrganisation(actor, values.queueId))) return failure('queue_not_found');

	try {
		const updated = await getDb()
			.update(requestForms)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(eq(requestForms.id, formId), eq(requestForms.organisationId, actor.organisationId))
			)
			.returning({ id: requestForms.id });
		return updated.length === 0 ? failure('request_form_not_found') : success(undefined);
	} catch (error) {
		if (uniqueConstraintName(error) === 'request_forms_org_name') {
			return failure('duplicate_request_form_name');
		}
		throw error;
	}
}

/** A form with tickets cannot go (the foreign key is `restrict`); deactivate it instead. */
export async function deleteRequestForm(
	actor: SessionUser,
	formId: string
): Promise<Outcome<void, RequestFormDeleteFailure>> {
	try {
		const deleted = await getDb()
			.delete(requestForms)
			.where(
				and(eq(requestForms.id, formId), eq(requestForms.organisationId, actor.organisationId))
			)
			.returning({ id: requestForms.id });
		return deleted.length === 0 ? failure('request_form_not_found') : success(undefined);
	} catch (error) {
		if (constraintViolation(error)?.code === '23503') return failure('request_form_in_use');
		throw error;
	}
}

export type SubmitRequestFailure =
	CreateTicketFailure | 'request_form_not_found' | 'invalid_request';

/**
 * An employee files an `equipment` request. The ticket lands in the form's
 * queue, never `defaultQueue`; its subject says which form and which category,
 * its opening message holds the justification and the date, and the category is
 * linked in the same transaction. Nothing is written when any of it is refused.
 */
export async function submitEquipmentRequest(
	actor: SessionUser,
	input: EquipmentRequestInput,
	deps: Deps = {}
): Promise<Outcome<{ id: string; ticketTag: string }, SubmitRequestFailure>> {
	const parsed = equipmentRequestInput.safeParse(input);
	if (!parsed.success) return failure('invalid_request');
	const request = parsed.data;

	const form = await getActiveRequestForm(actor, request.formId);
	if (!form || form.kind !== 'equipment') return failure('request_form_not_found');

	const category = await ticketPorts().categoryInOrganisation(actor, request.categoryId);
	if (!category) return failure('category_not_found');

	const body = request.neededBy
		? `${request.justification}\n\nNecesario para: ${request.neededBy}`
		: request.justification;

	return openTicket(
		actor,
		{ subject: `${form.name}: ${category.name}`, body, queueId: form.queueId },
		[],
		deps,
		{ requestFormId: form.id, categoryId: category.id }
	);
}
