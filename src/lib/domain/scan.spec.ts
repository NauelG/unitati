import { describe, expect, it } from 'vitest';
import { codeFromScan, scanPath, scanUrl } from './scan';

describe('scanPath', () => {
	it('puts the code under /s/', () => {
		expect(scanPath('AST-0001')).toBe('/s/AST-0001');
	});

	it('encodes characters that would break the path', () => {
		expect(scanPath('A/B C')).toBe('/s/A%2FB%20C');
	});
});

describe('scanUrl', () => {
	it('joins the origin and the path', () => {
		expect(scanUrl('https://assets.acme.test', 'AST-0001')).toBe(
			'https://assets.acme.test/s/AST-0001'
		);
	});

	it('ignores a trailing slash on the origin', () => {
		expect(scanUrl('https://assets.acme.test/', 'AST-0001')).toBe(
			'https://assets.acme.test/s/AST-0001'
		);
	});
});

describe('codeFromScan', () => {
	it('extracts the code from a scanned URL on any host', () => {
		expect(codeFromScan('https://anything.example/s/AST-0001')).toBe('AST-0001');
		expect(codeFromScan('http://192.168.1.4:5173/s/AST-0001')).toBe('AST-0001');
	});

	it('trims the input and accepts a trailing slash', () => {
		expect(codeFromScan('  https://x.test/s/AST-0001/  ')).toBe('AST-0001');
	});

	it('decodes encoded characters', () => {
		expect(codeFromScan('https://x.test/s/A%2FB%20C')).toBe('A/B C');
	});

	it('ignores a query string and a fragment', () => {
		expect(codeFromScan('https://x.test/s/AST-0001?utm=qr#top')).toBe('AST-0001');
	});

	it('returns null for anything that is not a scan URL', () => {
		expect(codeFromScan('AST-0001')).toBeNull();
		expect(codeFromScan('https://x.test/assets/AST-0001')).toBeNull();
		expect(codeFromScan('https://x.test/s/')).toBeNull();
		expect(codeFromScan('https://x.test/s/a/b')).toBeNull();
		expect(codeFromScan('ftp://x.test/s/AST-0001')).toBeNull();
		expect(codeFromScan('javascript:alert(1)')).toBeNull();
		expect(codeFromScan('https://x.test/s/%E0%A4%A')).toBeNull();
	});
});
