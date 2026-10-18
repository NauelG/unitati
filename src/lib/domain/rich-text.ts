/**
 * Characters of markdown a rich text field may hold (ADR 0030). One constant,
 * read by the editor in the browser and by the domain schemas on the server, so
 * the two bounds cannot drift apart.
 */
export const RICH_TEXT_MAX_LENGTH = 20_000;
