/**
 * What the four comment threads (assets, tasks, projects, people) share: the
 * shape a page receives and the rule for what a comment body may be.
 *
 * Each domain owns its own table and its own read and write functions (ADR
 * 0002); only this vocabulary is common, so the one `CommentsCard` can render
 * any of them.
 */

export const COMMENT_MAX_LENGTH = 4000;

/** What a page receives: the author's name as the join resolved it, never an id to look up. */
export type CommentView = {
	id: string;
	body: string;
	authorName: string | null;
	createdAt: Date;
};

export type CommentBodyFailure = 'empty_comment' | 'comment_too_long';

/** The trimmed body, or why it is not one. */
export function checkCommentBody(text: string): { body: string } | { error: CommentBodyFailure } {
	const body = text.trim();
	if (body.length === 0) return { error: 'empty_comment' };
	if (body.length > COMMENT_MAX_LENGTH) return { error: 'comment_too_long' };
	return { body };
}
