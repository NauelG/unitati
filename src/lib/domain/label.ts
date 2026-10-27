/**
 * Labels on tickets (ADR 0053): the organisation's own vocabulary for what the
 * product does not model. The bounds are shared by the form, the validation and
 * the column checks, so they are spelled once.
 */

/** Characters of a label's name, after trimming. */
export const LABEL_NAME_MAX = 50;

/** Characters of a label's description, shown as a tooltip. */
export const LABEL_DESCRIPTION_MAX = 200;
