import { and, eq } from 'drizzle-orm';
import type { StateGroup } from '#lib/domain/status.js';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { listProjects, listTasks, readsProjects } from '../projects';
import { ticketProject, ticketTask } from './schema';

/**
 * What the escalation form's pickers offer (#150): the active projects, and the
 * tasks of active projects, that the viewer may open, each flagged with whether
 * this ticket is already linked to it so the form can show it and refuse it.
 *
 * Reads go through `projects`' own scoped lists (ADR 0002). An archived project
 * and its tasks are left out rather than flagged: the domain would refuse them
 * (`project_archived`), and an option that can only fail is noise.
 */

/** A picker shows a page of matches, not the organisation; the box narrows it. */
const CHOICES = 25;

export interface TaskChoice {
	id: string;
	taskTag: string;
	title: string;
	projectTag: string;
	stateName: string;
	stateGroup: StateGroup;
	linked: boolean;
}

export interface ProjectChoice {
	id: string;
	projectTag: string;
	name: string;
	linked: boolean;
}

export async function taskChoices(
	viewer: SessionUser,
	ticketId: string,
	term: string
): Promise<TaskChoice[]> {
	if (!readsProjects(viewer)) return [];

	const [linked, found] = await Promise.all([
		getDb()
			.select({ taskId: ticketTask.taskId })
			.from(ticketTask)
			.where(
				and(eq(ticketTask.organisationId, viewer.organisationId), eq(ticketTask.ticketId, ticketId))
			),
		listTasks(viewer, { q: term })
	]);
	const linkedIds = new Set(linked.map((link) => link.taskId));

	return found
		.filter((task) => !task.projectArchived)
		.slice(0, CHOICES)
		.map((task) => ({
			id: task.id,
			taskTag: task.taskTag,
			title: task.title,
			projectTag: task.projectTag,
			stateName: task.stateName,
			stateGroup: task.stateGroup,
			linked: linkedIds.has(task.id)
		}));
}

export async function projectChoices(
	viewer: SessionUser,
	ticketId: string,
	term: string
): Promise<ProjectChoice[]> {
	if (!readsProjects(viewer)) return [];

	const [linked, found] = await Promise.all([
		getDb()
			.select({ projectId: ticketProject.projectId })
			.from(ticketProject)
			.where(
				and(
					eq(ticketProject.organisationId, viewer.organisationId),
					eq(ticketProject.ticketId, ticketId)
				)
			),
		listProjects(viewer, { q: term })
	]);
	const linkedIds = new Set(linked.map((link) => link.projectId));

	return found.slice(0, CHOICES).map((project) => ({
		id: project.id,
		projectTag: project.projectTag,
		name: project.name,
		linked: linkedIds.has(project.id)
	}));
}
