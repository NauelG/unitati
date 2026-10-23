/**
 * Where a record lives. One place, because the server builds these URLs for
 * `relatedTo` and a component builds them from an activity snapshot, and two
 * hand-written copies of a route are two chances to miss the day it moves.
 *
 * The tag is the URL segment (ADR 0010), so it is encoded here and nowhere else.
 */

export const assetHref = (assetTag: string): string => `/assets/${encodeURIComponent(assetTag)}`;

/** The staff view of a ticket; the portal has its own route under `/portal`. */
export const ticketHref = (ticketTag: string): string =>
	`/service-desk/${encodeURIComponent(ticketTag)}`;

export const taskHref = (taskTag: string): string => `/tasks/${encodeURIComponent(taskTag)}`;

/** The canonical link of a knowledge page (#327): an employee is sent on to the portal. */
export const pageHref = (pageTag: string): string => `/knowledge/${encodeURIComponent(pageTag)}`;

export const projectHref = (projectTag: string): string =>
	`/projects/${encodeURIComponent(projectTag)}`;
