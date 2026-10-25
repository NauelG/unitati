/**
 * Record screens (ADR 0049): the read policy of a record page, composed from the domains'
 * public surfaces. A leaf orchestrator: only app routes import it, never a domain or the API.
 */
export { taskScreen } from './task';
export type { TaskChoices, TaskMay, TaskScreen } from './task';
export { projectScreen } from './project';
export type { ProjectChoices, ProjectMay, ProjectScreen } from './project';
export { ticketScreen } from './ticket';
export type { TicketChoices, TicketMay, TicketScreen } from './ticket';
