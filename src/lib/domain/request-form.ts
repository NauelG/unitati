/**
 * What a request form asks for and what fulfils it. System-owned, because code
 * depends on it (ADR 0037): a new kind is a code change, the same split as
 * `StateGroup`. `equipment` is fulfilled by delivering an asset (ADR 0035).
 */
export const REQUEST_FORM_KINDS = ['equipment'] as const;

export type RequestFormKind = (typeof REQUEST_FORM_KINDS)[number];

/** Characters of Markdown a form's description may hold: it is a short blurb, not a page. */
export const REQUEST_FORM_DESCRIPTION_MAX = 500;

/** Characters of an equipment request's justification. */
export const JUSTIFICATION_MAX = 2000;
