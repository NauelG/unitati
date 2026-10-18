import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * The one place user markdown becomes HTML (ADR 0030). Every `{@html}` of user
 * content in the app receives the output of `renderMarkdown`, so there is a
 * single sanitisation point and the client never sees unsanitised HTML.
 */

const marked = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		// Headings are not allowed formatting: a legacy body that starts with `#`
		// must read as a normal paragraph, not a title.
		heading({ tokens }) {
			return `<p>${this.parser.parseInline(tokens)}</p>\n`;
		}
	}
});

const options: sanitizeHtml.IOptions = {
	allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote'],
	// `rel` and `target` are set by the transform below, which runs before the
	// attribute filter, so they have to be allowed here; the transform overrides
	// whatever the source tried to put in them.
	allowedAttributes: { a: ['href', 'rel', 'target'] },
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false,
	// Tags outside the list are dropped with their text kept; these lose the text too.
	nonTextTags: ['script', 'style', 'iframe', 'textarea', 'noscript'],
	transformTags: {
		a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
	}
};

/** Markdown in, sanitised HTML out. */
export function renderMarkdown(source: string): string {
	if (source.trim() === '') return '';
	return sanitizeHtml(marked.parse(source, { async: false }), options);
}
