import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

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
