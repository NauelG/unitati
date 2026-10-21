import { describe, expect, it } from 'vitest';
import { extractMentions, mentionToken, MENTION_TOKEN } from './mentions';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('mentionToken', () => {
	it('writes the token the editor stores', () => {
		expect(mentionToken('Ana Pérez', A)).toBe(`@[Ana Pérez](person:${A})`);
	});

	it('escapes the characters that would end the label', () => {
		expect(mentionToken('Ana ] Pérez', A)).toBe(`@[Ana \\] Pérez](person:${A})`);
		expect(mentionToken('Ana \\ Pérez', A)).toBe(`@[Ana \\\\ Pérez](person:${A})`);
	});
});

describe('extractMentions', () => {
	it('returns the unique person ids in the order they appear', () => {
		const body = `Hola ${mentionToken('Ana', A)} y ${mentionToken('Beto', B)}, otra vez ${mentionToken('Ana', A)}`;
		expect(extractMentions(body)).toEqual([A, B]);
	});

	it.each(['Ana ] Pérez', 'Ana (jefa) Pérez', 'Ana \\ Pérez', 'Ana 🎉 Pérez', 'Ana [x] Pérez'])(
		'reads a token whose name is %j',
		(name) => {
			expect(extractMentions(`hola ${mentionToken(name, A)}!`)).toEqual([A]);
		}
	);

	it('ignores anything that is not a person token', () => {
		expect(extractMentions('[Ana](person:' + A + ')')).toEqual([]);
		expect(extractMentions(`@[Ana](task:${A})`)).toEqual([]);
		expect(extractMentions('@[Ana](person:not-a-uuid)')).toEqual([]);
		expect(extractMentions('')).toEqual([]);
	});

	it('matches the same token the renderer uses', () => {
		const match = new RegExp(MENTION_TOKEN.source, 'u').exec(mentionToken('Ana ] Pérez', A));
		expect(match?.[1]).toBe('Ana \\] Pérez');
		expect(match?.[2]).toBe(A);
	});
});
