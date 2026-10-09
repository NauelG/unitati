import { and, asc, eq } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { queues, type Queue } from './schema';
import { queueInput, type QueueInput } from './validation';

/** Queues are plain named buckets; SLA configuration will hang off them (#14). */

export type QueueFailure = 'duplicate_queue_name';
export type QueueEditFailure = QueueFailure | 'queue_not_found';
export type QueueDeleteFailure = 'queue_not_found' | 'queue_in_use';

export async function listQueues(viewer: SessionUser): Promise<Queue[]> {
	return getDb()
		.select()
		.from(queues)
		.where(eq(queues.organisationId, viewer.organisationId))
		.orderBy(asc(queues.createdAt), asc(queues.name));
}

/** Where a portal ticket lands, since an employee does not pick a queue. */
export async function defaultQueue(viewer: SessionUser): Promise<Queue | null> {
	const [queue] = await getDb()
		.select()
		.from(queues)
		.where(eq(queues.organisationId, viewer.organisationId))
		.orderBy(asc(queues.createdAt), asc(queues.name))
		.limit(1);
	return queue ?? null;
}

export async function createQueue(
	actor: SessionUser,
	input: QueueInput
): Promise<Outcome<{ id: string }, QueueFailure>> {
	const values = queueInput.parse(input);

	try {
		const [row] = await getDb()
			.insert(queues)
			.values({ ...values, organisationId: actor.organisationId })
			.returning({ id: queues.id });
		return success({ id: row.id });
	} catch (error) {
		if (uniqueConstraintName(error) === 'queues_org_name') return failure('duplicate_queue_name');
		throw error;
	}
}

export async function renameQueue(
	actor: SessionUser,
	queueId: string,
	input: QueueInput
): Promise<Outcome<void, QueueEditFailure>> {
	const values = queueInput.parse(input);

	try {
		const updated = await getDb()
			.update(queues)
			.set({ name: values.name, updatedAt: new Date() })
			.where(and(eq(queues.id, queueId), eq(queues.organisationId, actor.organisationId)))
			.returning({ id: queues.id });
		return updated.length === 0 ? failure('queue_not_found') : success(undefined);
	} catch (error) {
		if (uniqueConstraintName(error) === 'queues_org_name') return failure('duplicate_queue_name');
		throw error;
	}
}

/** A queue with tickets cannot go: the foreign key is `restrict` and says so. */
export async function deleteQueue(
	actor: SessionUser,
	queueId: string
): Promise<Outcome<void, QueueDeleteFailure>> {
	try {
		const deleted = await getDb()
			.delete(queues)
			.where(and(eq(queues.id, queueId), eq(queues.organisationId, actor.organisationId)))
			.returning({ id: queues.id });
		return deleted.length === 0 ? failure('queue_not_found') : success(undefined);
	} catch (error) {
		if (constraintViolation(error)?.code === '23503') return failure('queue_in_use');
		throw error;
	}
}
