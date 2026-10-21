import { describe, expect, it } from 'vitest';
import { plainExcerpt, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders every allowed construct', () => {
		expect(renderMarkdown('**b** and *i*')).toBe('<p><strong>b</strong> and <em>i</em></p>\n');
		expect(renderMarkdown('- a\n- b')).toContain('<ul>');
		expect(renderMarkdown('1. a\n2. b')).toContain('<ol>');
		expect(renderMarkdown('`x`')).toContain('<code>x</code>');
		expect(renderMarkdown('```\ncode\n```')).toContain('<pre><code>code\n</code></pre>');
		expect(renderMarkdown('> quote')).toContain('<blockquote>');
	});

	it('gives every link rel and target', () => {
		const html = renderMarkdown('[x](https://example.com) and <mailto:a@b.co>');
		expect(html).toContain(
			'<a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a>'
		);
		expect(html).toContain('href="mailto:a@b.co"');
	});

	it('neutralises scripts, handlers, javascript links, images, iframes and raw html', () => {
		const html = renderMarkdown(
			[
				'<script>alert(1)</script>',
				'<img src=x onerror=alert(1)>',
				'<iframe src="https://evil"></iframe>',
				'[bad](javascript:alert(1))',
				'<div style="x" onclick="y">raw</div>'
			].join('\n\n')
		);
		expect(html).not.toMatch(
			/<script|<img|<iframe|<div|onerror|onclick|javascript:|style=|alert\(1\)/
		);
		expect(html).toContain('raw');
	});

	it('renders a heading line as plain paragraph text', () => {
		const html = renderMarkdown('# Title');
		expect(html).not.toMatch(/<h\d/);
		expect(html).toContain('Title');
	});

	it('keeps line breaks', () => {
		expect(renderMarkdown('a\nb')).toContain('<br');
		expect(renderMarkdown('\n\n')).toBe('');
	});
});

describe('plainExcerpt', () => {
	it('drops the formatting and keeps the words', () => {
		expect(plainExcerpt('**Hola** y *adiós*', 280)).toBe('Hola y adiós');
		expect(plainExcerpt('Usa `npm ci`', 280)).toBe('Usa npm ci');
		expect(plainExcerpt('> citado\n\nrespuesta', 280)).toBe('citado respuesta');
	});

	it('keeps a link’s text and not its address', () => {
		expect(plainExcerpt('Mira [la guía](https://example.com/x)', 280)).toBe('Mira la guía');
	});

	it('separates list items and lines instead of gluing them', () => {
		expect(plainExcerpt('- uno\n- dos\n\n1. tres', 280)).toBe('uno dos tres');
		expect(plainExcerpt('a\nb', 280)).toBe('a b');
		expect(plainExcerpt('```\nline one\nline two\n```', 280)).toBe('line one line two');
	});

	it('decodes the entities the renderer escaped', () => {
		expect(plainExcerpt('a & b < c > d "e" \'f\'', 280)).toBe('a & b < c > d "e" \'f\'');
	});

	it('never lets markup or a script through', () => {
		expect(plainExcerpt('<script>alert(1)</script>texto <b>x</b>', 280)).toBe('texto x');
	});

	it('reads a mention chip as @Name', () => {
		expect(
			plainExcerpt('Hola @[Ada Admin](person:6f1d0a39-2c4e-4d8b-9a77-1e2f3a4b5c6d)', 280)
		).toBe('Hola @Ada Admin');
	});

	it('cuts at a word boundary with an ellipsis, within the limit', () => {
		const excerpt = plainExcerpt('alpha beta gamma delta', 15);
		expect(excerpt).toBe('alpha beta…');
		expect(excerpt.length).toBeLessThanOrEqual(15);

		const long = plainExcerpt('palabra '.repeat(100), 280);
		expect(long.length).toBeLessThanOrEqual(280);
		expect(long.endsWith('palabra…')).toBe(true);
	});

	it('cuts a single word longer than the limit', () => {
		expect(plainExcerpt('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
	});

	it('leaves text within the limit alone, and empty input empty', () => {
		expect(plainExcerpt('corto', 5)).toBe('corto');
		expect(plainExcerpt('  \n ', 280)).toBe('');
	});
});
