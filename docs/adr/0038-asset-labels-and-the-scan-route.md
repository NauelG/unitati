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

To be written with #270: formats, label size and the public address setting.

## Consequences

- A label printed today works as long as `/s/{tag}` and the tag exist.
- Every login can now return to a deep link, not only scans.
- The tag is both the human code and the machine identifier, so it cannot be reused for another
  asset without the old label pointing at the wrong thing.
