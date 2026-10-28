import { describe, expect, it } from 'vitest';
import {
	oidcDiscoveryUrl,
	oidcProviderKey,
	oidcRedirectUri,
	parseOidcEnvironment
} from './oidc.js';

const SET = { issuer: 'https://idp.test/o/unitati/', clientId: 'id', clientSecret: 'secret' };

describe('parseOidcEnvironment', () => {
	it('is off when none of the three is set', () => {
		expect(parseOidcEnvironment({ issuer: '', clientId: '', clientSecret: '' })).toBeNull();
	});

	it('is on when all three are set, keeping the issuer as written', () => {
		expect(parseOidcEnvironment(SET)).toEqual(SET);
	});

	it.each(['issuer', 'clientId', 'clientSecret'] as const)(
		'refuses to start with %s missing',
		(missing) => {
			expect(() => parseOidcEnvironment({ ...SET, [missing]: '' })).toThrow(/all together or not/);
		}
	);
});

describe('OIDC derived values', () => {
	it('keys the provider by issuer', () => {
		expect(oidcProviderKey(SET.issuer)).toBe('oidc:https://idp.test/o/unitati/');
	});

	it('builds the discovery URL without doubling the slash', () => {
		expect(oidcDiscoveryUrl('https://idp.test/o/unitati/')).toBe(
			'https://idp.test/o/unitati/.well-known/openid-configuration'
		);
		expect(oidcDiscoveryUrl('https://idp.test')).toBe(
			'https://idp.test/.well-known/openid-configuration'
		);
	});

	it('builds the redirect URI from the public origin', () => {
		expect(oidcRedirectUri('https://unitati.test/')).toBe(
			'https://unitati.test/api/auth/sso/callback/oidc'
		);
	});
});
