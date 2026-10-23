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

	describe('mentions (#303)', () => {
		const ID = '6f1d0a39-2c4e-4d8b-9a77-1e2f3a4b5c6d';

		it('turns the token into a chip and nothing else', () => {
			expect(renderMarkdown(`Hola @[Ada Admin](person:${ID})`)).toBe(
				`<p>Hola <span class="mention" data-person-id="${ID}">@Ada Admin</span></p>\n`
			);
		});

		it('reads the escaped characters of a name back', () => {
			const html = renderMarkdown(`@[Ada \\] \\\\ (jefa) 🎉](person:${ID})`);
			expect(html).toContain('>@Ada ] \\ (jefa) 🎉</span>');
		});

		it('escapes markup inside the name', () => {
			const html = renderMarkdown(`@[<img src=x onerror=alert(1)>](person:${ID})`);
			expect(html).not.toContain('<img');
			expect(html).toContain('@&lt;img src=x onerror=alert(1)&gt;</span>');
		});

		it('renders any other person: link as plain text', () => {
			const html = renderMarkdown(`[Ada](person:${ID}) and [Bob](person:not-a-uuid)`);
			expect(html).not.toMatch(/<a|href|person:/);
			expect(html).toContain('Ada and Bob');
		});

		it('does not honour a mention span written by hand', () => {
			const html = renderMarkdown(`<span class="mention" data-person-id="${ID}">@Fake</span>`);
			expect(html).not.toContain('mention');
			expect(html).not.toContain('data-person-id');
			expect(html).toContain('@Fake');
		});

		it('keeps javascript: disguised as a mention out of the output', () => {
			const html = renderMarkdown(
				[
					'@[x](javascript:alert(1))',
					`@[x](person:${ID}" onclick="alert(1))`,
					`[@[x](person:${ID})](javascript:alert(1))`
				].join('\n\n')
			);
			// The payload may survive as inert text, never as a link or an attribute.
			expect(html).not.toMatch(/href=|<[^>]*onclick/);
		});
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

	it('is the comment profile when none is given', () => {
		const source = '## Paso\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---';
		expect(renderMarkdown(source)).toBe(renderMarkdown(source, 'comment'));
	});

	it('drops headings, tables and rules in a comment, keeping the text', () => {
		const html = renderMarkdown(
			'## Paso\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---\n\nfin',
			'comment'
		);
		expect(html).not.toMatch(/<h\d|<table|<tr|<td|<th|<hr/);
		expect(html).toContain('Paso');
		expect(html).toContain('1');
		expect(html).toContain('fin');
	});
});

describe('renderMarkdown, document profile (#324)', () => {
	const doc = (source: string) => renderMarkdown(source, 'document');

	it('renders h2 to h4, an h1 as h2 and anything deeper as h4', () => {
		expect(doc('## Dos')).toBe('<h2 id="h-dos">Dos</h2>\n');
		expect(doc('### Tres')).toBe('<h3 id="h-tres">Tres</h3>\n');
		expect(doc('#### Cuatro')).toBe('<h4 id="h-cuatro">Cuatro</h4>\n');
		expect(doc('# Uno')).toBe('<h2 id="h-uno">Uno</h2>\n');
		expect(doc('###### Seis')).toBe('<h4 id="h-seis">Seis</h4>\n');
		expect(doc('# Uno')).not.toMatch(/<h1|<h5|<h6/);
	});

	it('gives headings a prefixed slug of their text, deduplicated, as id', () => {
		const html = doc('## Configuración del **correo**\n\n## Paso 1\n\n## Paso 1\n\n## ¿?');
		expect(html).toContain(
			'<h2 id="h-configuracion-del-correo">Configuración del <strong>correo</strong></h2>'
		);
		expect(html).toContain('<h2 id="h-paso-1">Paso 1</h2>');
		expect(html).toContain('<h2 id="h-paso-1-2">Paso 1</h2>');
		expect(html).toContain('<h2 id="h-seccion">¿?</h2>');
	});

	it('never mints an id the app shell uses', () => {
		expect(doc('## Main')).toBe('<h2 id="h-main">Main</h2>\n');
	});

	it('starts the deduplication afresh on every call', () => {
		expect(doc('## Paso')).toContain('id="h-paso"');
		expect(doc('## Paso')).toContain('id="h-paso"');
	});

	it('renders GFM tables with their alignment', () => {
		const html = doc('| Equipo | Planta |\n| :- | -: |\n| Impresora | 2 |');
		expect(html).toContain('<table>');
		expect(html).toContain('<th align="left">Equipo</th>');
		expect(html).toContain('<td align="right">2</td>');
	});

	it('renders the horizontal rule', () => {
		expect(doc('uno\n\n---\n\ndos')).toContain('<hr />');
	});

	it('keeps everything a comment allows', () => {
		const html = doc('**b** *i* `c`\n\n- a\n\n1. b\n\n> q\n\n```\nx\n```');
		expect(html).toMatch(/<strong>b<\/strong>.*<em>i<\/em>.*<code>c<\/code>/);
		expect(html).toMatch(/<ul>[\s\S]*<ol>[\s\S]*<blockquote>[\s\S]*<pre>/);
	});

	it('opens a link to a page in the same tab, and any other link in a new one', () => {
		const html = doc(
			'[VPN](/knowledge/DOC-0012) [paso](/knowledge/DOC-0012#h-paso-2) [x](https://example.com)'
		);
		expect(html).toContain('<a href="/knowledge/DOC-0012">VPN</a>');
		expect(html).toContain('<a href="/knowledge/DOC-0012#h-paso-2">paso</a>');
		expect(html).toContain(
			'<a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a>'
		);
	});

	it('renders a mention token as plain text, never a chip', () => {
		const html = doc('Hola @[Ada \\] Admin](person:6f1d0a39-2c4e-4d8b-9a77-1e2f3a4b5c6d)');
		expect(html).toBe('<p>Hola @Ada ] Admin</p>\n');
	});

	it('neutralises scripts, handlers, javascript links, images and raw html', () => {
		const html = doc(
			[
				'<script>alert(1)</script>',
				'<img src=x onerror=alert(1)>',
				'![logo](https://example.com/x.png)',
				'<iframe src="https://evil"></iframe>',
				'[bad](javascript:alert(1))',
				'<h2 id="fake" onclick="y">raw heading</h2>',
				'<table><tr><td onclick="y">raw cell</td></tr></table>',
				'<span class="mention" data-person-id="6f1d0a39-2c4e-4d8b-9a77-1e2f3a4b5c6d">@Fake</span>',
				'## Título <img src=x onerror=alert(1)>'
			].join('\n\n')
		);
		expect(html).not.toMatch(
			/<script|<img|<iframe|<span|<td|onerror|onclick|javascript:|alert\(1\)|id="fake"|mention|src=/
		);
		expect(html).toContain('raw heading');
		expect(html).toContain('raw cell');
		expect(html).toContain('@Fake');
		expect(html).toContain('<h2 id="h-titulo">Título');
	});

	it('renders no task list checkbox', () => {
		const html = doc('- [ ] pendiente\n- [x] hecho');
		expect(html).not.toMatch(/<input|checkbox/);
		expect(html).toContain('pendiente');
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
