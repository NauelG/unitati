import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../auth/guards';
import { addComment } from './comments';
import { MAX_COMMENT_LENGTH } from './validation';

describe('addComment length limit', () => {
	it('refuses a body over the limit with a typed failure, before touching the database', async () => {
		const outcome = await addComment({} as SessionUser, 'TCK-0001', {
			body: 'x'.repeat(MAX_COMMENT_LENGTH + 1),
			visibility: 'public'
		});

		expect(outcome).toEqual({ ok: false, error: 'body_too_long' });
	});
});
