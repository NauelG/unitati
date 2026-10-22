import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { checkCommentBody, type CommentBodyFailure, type CommentView } from '../shared/comments';
import { failure, success, type Outcome } from '../shared/outcome';
import { people, personComments } from './schema';

/**
 * Comments on a person. Whoever calls this has already been allowed to (`people.edit` to
 * write, `people.view` to read); scoping to the actor's organisation is this
 * file's job. Every comment also writes a `note.added` entry on the person's
 * timeline, in the same transaction.
 */

export type AddPersonCommentFailure = CommentBodyFailure | 'not_found';

export async function addPersonComment(
	actor: SessionUser,
	personId: string,
	text: string
): Promise<Outcome<void, AddPersonCommentFailure>> {
	const checked = checkCommentBody(text);
	if ('error' in checked) return failure(checked.error);

	return getDb().transaction(async (tx) => {
		const [person] = await tx
			.select({ id: people.id })
			.from(people)
			.where(and(eq(people.id, personId), eq(people.organisationId, actor.organisationId)))
			.limit(1);
		if (!person) return failure('not_found');

		const [comment] = await tx
			.insert(personComments)
			.values({
				organisationId: actor.organisationId,
				personId: person.id,
				authorPersonId: actor.personId,
				body: checked.body
			})
			.returning({ id: personComments.id });

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { personId: person.id },
			verb: 'note.added',
			payload: { text: checked.body, commentId: comment.id }
		});
		return success(undefined);
	});
}

export async function listPersonComments(
	organisationId: string,
	personId: string
): Promise<CommentView[]> {
	const author = alias(people, 'author');
	return getDb()
		.select({
			id: personComments.id,
			body: personComments.body,
			authorName: author.fullName,
			createdAt: personComments.createdAt
		})
		.from(personComments)
		.leftJoin(author, eq(personComments.authorPersonId, author.id))
		.where(
			and(eq(personComments.organisationId, organisationId), eq(personComments.personId, personId))
		)
		.orderBy(desc(personComments.createdAt), desc(personComments.id));
}
