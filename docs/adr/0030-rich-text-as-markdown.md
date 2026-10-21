# 0030. Rich text is stored as markdown and rendered on the server

- **Status:** accepted
- **Date:** 2026-10-19

## Context

Ticket comments were plain text: a `<textarea>` in, escaped text with `whitespace-pre-wrap` out
(#209, part of #208). Long-text fields (comments now; project and task descriptions next) need
formatting, and that makes user content reach `{@html}` for the first time. Until now the only
`{@html}` injected generated brand CSS. Where sanitisation happens is therefore an architectural
decision.

The stored format also decides three other things. `ticket_comments.search` is a generated
`tsvector` over `body`; mail carries a link today but may carry the text later; inbound mail
(#18) has to convert into whatever is chosen.

## Decision

1. **The stored format is markdown.** Every existing body is already valid markdown, so there is no
   data migration. The column stays `text`; the generated `search` column is unchanged.
2. **The editor is Tiptap** (`@tiptap/core` with `@tiptap/starter-kit` and `@tiptap/markdown`),
   wrapped in our own `unitati/RichTextEditor`. There is no third-party Svelte wrapper. It writes
   the markdown into a hidden input, so existing form posts do not change.
3. **Markdown is rendered on the server, through one function.** `renderMarkdown`
   (`src/lib/server/shared/markdown.ts`) runs `marked` and then `sanitize-html` with an allow-list.
   **All user markdown is rendered through it**; a template may only `{@html}` its output. The
   client never receives unsanitised HTML, and SSR works.
4. **Allowed formatting:** bold, italic, bulleted and numbered lists, links, inline code, code
   blocks and blockquotes. **Not allowed:** headings, strikethrough, tables, inline images
   (attachments already exist). The editor's schema and the sanitiser allow-list say the same
   thing.
5. **Sanitiser allow-list:** tags `p, br, strong, em, ul, ol, li, a, code, pre, blockquote` (and
   the mention `span`, item 10); attribute `href` on `a` only (plus the `rel` and `target` the transform sets); schemes `http`,
   `https`, `mailto`. Every link gets `rel="noopener noreferrer"` and `target="_blank"`. Tags
   outside the list are dropped with their text kept; `script`, `style`, `iframe`, `textarea` and
   `noscript` are dropped with their content. Raw HTML in the source is therefore never rendered.
6. **Headings are flattened.** Headings are rendered by `marked` as paragraphs, so a legacy body
   whose first line starts with `#` reads as text, not as a title. A stray `*word*` in an old body
   rendering as italic is an accepted risk.
7. **Line breaks are kept** (`breaks: true`), because plain-text bodies relied on them.
8. **Length limit: 20,000 characters** of markdown (`RICH_TEXT_MAX_LENGTH`), enforced by the
   editor and by the domain (`addComment` answers `body_too_long`; the schema has `.max`). It is
   not a database constraint.
9. **Mail stays link-only.** Changing that is a product decision of its own.
10. **@mentions (#303)** are the one extension to the allow-list. The stored token is
    `@[Full Name](person:<uuid>)` (`]` and `\` in the name escaped; `src/lib/domain/mentions.ts`).
    `renderMarkdown` turns it into `<span class="mention" data-person-id="<uuid>">@Full Name</span>`
    and the sanitiser keeps exactly that span: a per-call nonce proves it came from a real token, so a
    `span.mention` typed by hand loses its attributes. Any other `person:` link is rendered as plain
    text. The editor offers the picker only when given a `mentionSource`; who may be named is decided
    on the server (`mentionableFor`), never by the client.

### Packages

| Package                     | Version |
| --------------------------- | ------- |
| `@tiptap/core`              | 3.32.0  |
| `@tiptap/pm`                | 3.32.0  |
| `@tiptap/starter-kit`       | 3.32.0  |
| `@tiptap/markdown`          | 3.32.0  |
| `@tiptap/extension-mention` | 3.32.0  |
| `@tiptap/suggestion`        | 3.32.0  |
| `marked`                    | 18.1.1  |
| `sanitize-html`             | 2.18.1  |
| `@types/sanitize-html`      | 2.16.2  |

`@tiptap/markdown` requires `@tiptap/core` and `@tiptap/pm` at the same version, so the Tiptap
packages are pinned together (`@tiptap/extension-mention` and `@tiptap/suggestion` included, #303). The spike confirmed that `editor.getMarkdown()` and
`setContent(md, { contentType: 'markdown' })` round-trip bold, lists, links, code and quotes, and
that the editor runs under jsdom (with layout stubs) for component tests.

## Alternatives rejected

- **Stored HTML or ProseMirror JSON.** Needs a migration of every existing body, pollutes the
  `tsvector` with tags (HTML) or hides the text (JSON), and mail would need text extraction.
- **A textarea with a preview, GitHub style.** Not WYSIWYG, which is what portal users expect.
- **Sanitising in the browser.** Two code paths, no SSR, and the unsanitised string would reach
  the client.

## Consequences

- Project and task descriptions, and comment editing, adopt `RichTextEditor` and `renderMarkdown`
  without a new decision.
- A new allowed construct is a change in three places: the editor's extensions, the allow-list and
  this ADR.
- The first `{@html}` of user content exists; the ESLint exception in `TicketThread.svelte` points
  here.
