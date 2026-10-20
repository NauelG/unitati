import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './redirect';

describe('safeRedirectTarget', () => {
	it('accepts a same-origin relative path with its query', () => {
		expect(safeRedirectTarget('/assets/AST-0001?tab=x')).toBe('/assets/AST-0001?tab=x');
		expect(safeRedirectTarget('/s/AST-0001')).toBe('/s/AST-0001');
	});

	it.each([
		['protocol-relative', '//evil.com'],
		['backslash host', '/\\evil.com'],
		['absolute url', 'https://evil.com'],
		['javascript scheme', 'javascript:alert(1)'],
		['no leading slash', 'assets'],
		['embedded backslash', '/a\\b'],
		['control character', '/a\nb'],
		['tab', '/\t/evil.com'],
		['login', '/login'],
		['login with query', '/login?redirectTo=/x'],
		['setup', '/setup'],
		['sign-out', '/sign-out'],
		['empty', ''],
		['null', null]
	])('falls back to / for %s', (_name, value) => {
		expect(safeRedirectTarget(value)).toBe('/');
	});
});
