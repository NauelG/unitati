/** Running version (SemVer), from package.json at build time. See docs/adr/0003-semver-and-changelog.md. */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * Where the source code of this build lives, from package.json `repository` at build time.
 * Linked next to the version so every installation offers its source (AGPL-3.0, ADR 0041).
 */
export const APP_SOURCE_URL: string = __APP_SOURCE_URL__;
