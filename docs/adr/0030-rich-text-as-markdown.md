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
   (attachments already exist). Pages are the exception: see _Profiles_ below. The editor's schema and the sanitiser allow-list say the same
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
| `@tiptap/extension-table`   | 3.32.0  |
| `marked`                    | 18.1.1  |
| `sanitize-html`             | 2.18.1  |
| `@types/sanitize-html`      | 2.16.2  |

`@tiptap/markdown` requires `@tiptap/core` and `@tiptap/pm` at the same version, so the Tiptap
packages are pinned together (`@tiptap/extension-mention` and `@tiptap/suggestion` included, #303;
`@tiptap/extension-table` for the `document` profile, #324). The spike confirmed that `editor.getMarkdown()` and
`setContent(md, { contentType: 'markdown' })` round-trip bold, lists, links, code and quotes, and
that the editor runs under jsdom (with layout stubs) for component tests.

### Profiles (#324)

What a text may contain is a **profile** (`src/lib/domain/markdown-profiles.ts`), passed to both
`RichTextEditor` (`profile`) and `renderMarkdown(source, profile)`, so the editor's schema and the
allow-list still say the same thing. One pipeline: the same `marked` instance and sanitiser, with
the renderer's choices and the allow-list picked by the profile of the call.

- **`comment`** (the default) is everything above, unchanged: ticket replies and notes,
  descriptions, and page comments later.
- **`document`** is for knowledge base pages ([ADR 0031](0031-knowledge-base-spaces-page-tree-and-revisions.md)
  §10): `comment` **minus** mentions (a token renders as plain `@Name` and the editor offers no
  picker) **plus** headings h2–h4 (`#` reads as h2, five or more `#` as h4: the page title is the
  only h1), GFM tables (`align` on cells, `left`, `center` or `right` only), the horizontal rule,
  and links to pages. A heading gets an `id`, `h-` and the slug of its text, deduplicated
  within the document, so a section can be linked (`/knowledge/DOC-0012#h-paso-2`); the prefix keeps
  a page from minting an id the app uses (`main`, the skip link's target). A link to a page, or to a
  section, stays in the tab; every other link opens a new one as before. **No raw HTML at all**:
  where a comment drops the tags outside its list, a document drops every tag typed by hand, even
  `<h2>` or `<table>`, keeping the text; only the markdown makes them. No images and no task lists.
  The editor adds a heading menu, table tools, the rule and a page picker (`[[` or a button, which
  inserts `[Title](/knowledge/DOC-0012)` from `GET /knowledge/pages/pick`), and grows with the
  text instead of scrolling. A page body may hold 200,000 characters (`PAGE_BODY_MAX_LENGTH`).

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
