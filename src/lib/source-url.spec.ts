import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { sourceUrl } from './source-url';

describe('sourceUrl', () => {
	it('turns the npm clone URL into the browsable repository page', () => {
		expect(sourceUrl('git+https://github.com/NauelG/unitati.git')).toBe(
			'https://github.com/NauelG/unitati'
		);
	});

	it('leaves an already browsable URL alone, minus a trailing slash', () => {
		expect(sourceUrl('https://git.example.org/team/unitati/')).toBe(
			'https://git.example.org/team/unitati'
		);
	});

	it.each(['', 'git@github.com:NauelG/unitati.git', 'github:NauelG/unitati', 'https://github.com'])(
		'refuses %j: a broken source link must fail the build',
		(value) => {
			expect(() => sourceUrl(value)).toThrow(/repository\.url/);
		}
	);

	it('accepts the repository this package.json declares', () => {
		expect(sourceUrl(pkg.repository.url)).toBe('https://github.com/NauelG/unitati');
	});
});
