# 0041. Unitati is licensed AGPL-3.0-only, every installation links its source, contributions carry a DCO sign-off

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The repository went public on 2026-10-06 without a license. With no license, the default is "all
rights reserved": nobody may legally run, modify or contribute to the code, whatever the
visibility of the repository says. [The internal-vs-open-source decision](../decision-internal-vs-oss.md)
deferred the choice between AGPLv3 and MIT to "before the first public push", and that point has
passed. The container image ([ADR 0023](0023-container-image-on-ghcr.md)) is now public too.

Unitati is an application that people self-host and use over a network, not a library that other
code embeds. The risk that matters is not a project linking it, but someone running a modified
copy as a closed hosted service.

Every runtime dependency is MIT, MIT-0, Apache-2.0, Unlicense or OFL-1.1 (checked with
`npm view <package> license` on 2026-10-21), all of them compatible with AGPLv3.

## Decision

1. **The license is `AGPL-3.0-only`.** The full text is `LICENSE` at the root, `package.json`
   declares it, and the image carries the `org.opencontainers.image.licenses` label.
   - **AGPL rather than MIT:** MIT allows a closed hosted fork. AGPL section 13 requires whoever
     modifies Unitati and serves it over a network to offer that modified source to its users.
     It is also the norm in this niche: Snipe-IT, Zammad and Plane are AGPLv3, GLPI is GPLv3.
   - **AGPL rather than GPL:** serving an application over a network is not "conveying" it, so
     the GPL would not close the hosted-fork gap.
   - **`-only` rather than `-or-later`:** a future version of the license does not apply unless
     the copyright holder decides it should.
2. **Every installation links its source code.** `AppVersion` renders "Código fuente" next to the
   version on the app shell, the portal, the login, setup, password and handover screens, with or
   without a custom brand, and no setting removes it. The URL is `package.json` `repository`,
   turned into a browsable address at build time (`__APP_SOURCE_URL__`, `src/lib/source-url.ts`).
   A fork that points `repository` at its own code meets section 13 without touching a component.
   This supersedes the "no link while the repository is private" rule of #157 Q16.
3. **Contributions carry a Developer Certificate of Origin sign-off**
   ([developercertificate.org](https://developercertificate.org/)): every commit in a pull request
   ends with `Signed-off-by: Name <email>` matching its author (`git commit -s`). CI checks it in a
   job of its own, with no third-party app. There is no contributor license agreement.
4. **The copyright holder is Nauel Gómez** (`ng@nauelgomez.com`), with contributors keeping the
   copyright of their own contributions under the same license.

## Consequences

- An organisation that runs Unitati unmodified has no obligation beyond keeping the license
  notice. One that modifies it must offer the modified source to the people who use it, its own
  staff included; pointing `repository` at its code is enough. Some companies ban AGPL outright;
  that cost is accepted.
- Without a CLA, relicensing code that others contributed (dual licensing, open-core) needs their
  agreement. Choosing the DCO keeps the barrier to contribute low at that price.
- Removing or hiding the source link is a license problem, not a styling choice. The component
  and its tests say so.
- Commits that predate this record are by the copyright holder and need no sign-off; the CI
  check only covers the commits of each pull request.
