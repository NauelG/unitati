# 0038. Asset labels point at a scan route that never changes

- **Status:** accepted
- **Date:** 2026-10-20

## Context

A printed label outlives every release, every redesign and possibly the hostname. Someone
points a phone at a laptop and expects the asset (#22). The label must therefore encode
something stable, and what the scanner sees must depend on who is scanning.

## Decision

1. **The label encodes a URL**, `https://{public address}/s/{tag}`. The URL is the only thing
   on the label that a camera app understands without Unitati installed.
2. **`/s/` is a contract that never changes.** Not `/assets/…`: that path is a page, free to be
   renamed or restructured, and a label cannot be reprinted when it is. `/s/` means "resolve
   this tag for whoever is scanning", and its path and parameter stay fixed. The shared
   helpers live in `src/lib/domain/scan.ts` (`scanPath`, `scanUrl`, `codeFromScan`).
3. **Four outcomes**, decided in `src/routes/s/[code]/+server.ts`:
   - signed in and the asset is visible to the viewer: `303` to `/assets/{tag}`;
   - signed in and it is missing, out of the viewer's scope, or the viewer holds no asset read
     permission: `404`, the same answer, so a scan never confirms that a tag exists;
   - not signed in: `303` to `/login?redirectTo=/s/{tag}`, and signing in returns to the scan
     and then to the asset;
   - #23 will later replace only the not-signed-in branch (what a visitor without a session
     sees). Nothing else moves.
4. **Responses are `Cache-Control: no-store`**: the answer depends on the session.
5. **Sign-in returns to where you were going.** `requireUser(user, url)` called from the `(app)`
   and `(portal)` layout loads adds `redirectTo`; the login screen carries it and
   `safeRedirectTarget` only lets a same-origin relative path through (no `//`, no scheme, no
   backslash, no control characters, never `/login`, `/setup` or `/sign-out`). Actions keep
   redirecting without a target.
6. **Global search understands a scanned URL.** `parseSearchTerm` reads the code out of a
   `…/s/{tag}` URL on any host, so a keyboard scanner typing into the search box lands on the
   exact-code hit. The host is never navigated to.
7. **QR only, and no in-app scanner.** The phone's native camera is the scanner; keyboard
   scanners type into search. An in-app camera is a separate decision (#24).
8. **The tag is the identifier.** There is no second label identifier and no blank pre-printed
   labels ([ADR 0010](0010-human-readable-record-codes.md)). Renaming a tag means reprinting its
   label; there are no redirects for old tags.

## Printing

Labels are printed from an HTML page, `/assets/labels` (#270).

1. **HTML and `@page`, not PDF.** The page declares its sheet in millimetres (`@page { size;
margin: 0 }`) and the browser's print dialog does the rest. There is no PDF library to
   maintain, the preview on screen is the document, and text prints sharp because it is real text.
   The QR is the only generated artefact: server-side SVG from `qrcode`, error correction M,
   drawn without a margin and padded in CSS so the 4-module quiet zone is exact.
2. **Three fixed formats**, defined once in `src/lib/domain/label-formats.ts`: `a4-3x8`
   (24 labels of 70 × 37 mm, the default), `a4-4x10` (40 labels of 52.5 × 29.7 mm) and
   `roll-62x29` (one label per page). A template editor would be a second product; the formats
   are the ones sold as ordinary A4 sheets and a common thermal roll. On the sheets, a start
   position leaves the first cells empty so a partly used sheet is not wasted; the roll has none.
3. **What a label shows**: the QR, the tag, "Propiedad de {product name}" (with the brand mark
   where it fits) and, on the large format only, the asset name. **Never the serial, the custodian
   or the location**: a label is stuck on a thing that leaves the building, and the people
   scanning it are answered by what their session may see (decision 3), not by what is printed.
4. **The QR origin is `BETTER_AUTH_URL`**, the installation's one public origin, already used by
   authentication and by mail links. Not the request's origin: a label printed from
   `http://192.168.1.10:3000` would be useless for years. Not a per-organisation setting: it
   would be a second source for the same fact, and the per-organisation origin for auth, mail and
   labels must be decided together in #42. When the page is opened from another origin, a
   visible warning says where the codes will point; it does not block printing.
5. **`assets.manage` only, at most 500 labels per job.** More than 500 tags, or none, is a 400.
   Tags the viewer cannot see or that do not exist are listed as missing and the rest print;
   the page cannot tell the two apart, as with the scan route. Like every permission denial in
   the app ([ADR 0007](0007-roles-and-permissions.md)) the answer for someone without the
   permission is 404.
6. **Printing is not an event.** It leaves no activity on the asset: the label is a copy of the
   tag, not a change to the asset. Renaming a tag shows a note in the edit form, because the
   printed label is now stale (decision 8).

## Consequences

- A label printed today works as long as `/s/{tag}` and the tag exist.
- Every login can now return to a deep link, not only scans.
- The tag is both the human code and the machine identifier, so it cannot be reused for another
  asset without the old label pointing at the wrong thing.
