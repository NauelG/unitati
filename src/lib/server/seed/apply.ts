import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
	addNote,
	assignCustody,
	changeLocation,
	changeState,
	createAssetModel,
	createCategory,
	createManufacturer,
	listAssetModels,
	listCategories,
	listManufacturers,
	registerAsset,
	returnCustody
} from '../assets';
import type { SessionUser } from '../auth/guards';
import { listLocations, listPeople, locations, people } from '../directory';
import {
	archiveProject,
	createProject,
	createTask,
	ensureDefaultStates,
	listProjects,
	listStates,
	listTasks,
	moveTask,
	setAssignees
} from '../projects';
import { escalateTicket, relatedTo, type EscalationTarget } from '../links';
import { tickets } from '../service-desk';
import type { EscalationsPlan, InventoryPlan, ProjectsPlan } from './plan';

/**
 * Applies a plan through the domain's own functions rather than by inserting
 * rows, so the history a seeded asset shows is the history the app would have
 * written: `asset.created`, `custody.assigned`, `state.changed` — with the
 * same snapshots and the same transactions. A seed that bypassed them would
 * demo a timeline no real action could produce.
 *
 * **Idempotent by tag.** Every asset is registered with its explicit tag, so a
 * second run is refused by the unique index (`duplicate_asset_tag`) and that
 * asset — events included — is skipped. The catalogue, locations and people use
 * "already exists" the same way. Running it twice leaves what the first run
 * left, which is what "the same asset tags twice in a row" means.
 */

export interface ApplySummary {
	registered: number;
	skipped: number;
	/** Skipped for a reason other than "already seeded": worth reading. */
	refused: string[];
}

export async function applyPlan(actor: SessionUser, plan: InventoryPlan): Promise<ApplySummary> {
	const organisationId = actor.organisationId;

	for (const name of plan.manufacturers) await createManufacturer(actor, { name });
	for (const name of plan.categories) await createCategory(actor, { name });

	const manufacturerIds = new Map(
		(await listManufacturers(organisationId)).map((e) => [e.name, e.id])
	);
	const categoryIds = new Map((await listCategories(organisationId)).map((e) => [e.name, e.id]));

	for (const model of plan.models) {
		await createAssetModel(actor, {
			name: model.name,
			manufacturerId: manufacturerIds.get(model.manufacturer)!,
			categoryId: categoryIds.get(model.category)!
		});
	}

	const modelIds = new Map(
		(await listAssetModels(organisationId)).map((e) => [`${e.manufacturerName}/${e.name}`, e.id])
	);

	await getDb()
		.insert(locations)
		.values(plan.locations.map((name) => ({ organisationId, name })))
		.onConflictDoNothing();
	const locationIds = new Map((await listLocations(organisationId)).map((e) => [e.name, e.id]));

	await getDb()
		.insert(people)
		.values(plan.people.map((person) => ({ organisationId, ...person })))
		.onConflictDoNothing();
	const personIds = new Map((await listPeople(organisationId)).map((e) => [e.email, e.id]));

	const locationId = (name: string | null) =>
		name === null ? null : (locationIds.get(name) ?? null);
	const summary: ApplySummary = { registered: 0, skipped: 0, refused: [] };

	for (const planned of plan.assets) {
		const model = plan.models[planned.model];

		const registered = await registerAsset(actor, {
			assetTag: planned.assetTag,
			name: planned.name,
			serial: planned.serial,
			assetModelId: modelIds.get(`${model.manufacturer}/${model.name}`)!,
			state: planned.state,
			shared: planned.shared,
			locationId: locationId(planned.location)
		});

		if (!registered.ok) {
			summary.skipped += 1;
			// A tag already present is the expected second run. Anything else — a
			// serial that collides with a real asset — deserves a line of output.
			if (registered.error !== 'duplicate_asset_tag') {
				summary.refused.push(`${planned.assetTag}: ${registered.error}`);
			}
			continue;
		}

		summary.registered += 1;
		const { id } = registered.value;

		for (const event of planned.events) {
			switch (event.kind) {
				case 'assign':
					await assignCustody(actor, id, personIds.get(event.personEmail)!);
					break;
				case 'return':
					await returnCustody(actor, id);
					break;
				case 'state':
					await changeState(actor, id, event.to);
					break;
				case 'move':
					await changeLocation(actor, id, locationId(event.location));
					break;
				case 'note':
					await addNote(actor, id, event.text);
					break;
			}
		}
	}

	return summary;
}

/**
 * Projects and their tasks, through the domain like everything else: a seeded
 * task moved to `started` carries the `task.state.changed` a real drag would.
 *
 * **Idempotent by presence**, as the tickets are. Codes come from sequences, so
 * a second run would mint `PRJ-0004` onwards instead of colliding; it is skipped
 * whenever the organisation already has any project, archived or not, which is
 * what keeps the tags identical run after run.
 *
 * Tasks are placed by **group**, never by a state's name: the catalogue is the
 * organisation's to rename, and the seed must work on one that already did.
 */
export async function applyProjects(actor: SessionUser, plan: ProjectsPlan): Promise<number> {
	const organisationId = actor.organisationId;

	const present =
		(await listProjects(actor)).length + (await listProjects(actor, { archived: true })).length;
	if (present > 0) return 0;

	await ensureDefaultStates(getDb(), organisationId);
	const stateOf = new Map<string, string>();
	for (const state of await listStates(actor)) {
		if (!stateOf.has(state.group)) stateOf.set(state.group, state.id);
	}

	const personIds = new Map((await listPeople(organisationId)).map((e) => [e.email, e.id]));
	const person = (email: string) => {
		const id = personIds.get(email);
		if (!id) throw new Error(`The projects plan names ${email}, who is not in the directory.`);
		return id;
	};

	let created = 0;
	for (const planned of plan.projects) {
		const project = await createProject(actor, {
			name: planned.name,
			description: planned.description,
			ownerPersonId: planned.ownerEmail ? person(planned.ownerEmail) : null,
			dueDate: planned.dueDate
		});
		if (!project.ok) throw new Error(`Could not seed ${planned.name}: ${project.error}`);
		created += 1;

		for (const task of planned.tasks) {
			const opened = await createTask(actor, project.value.id, {
				title: task.title,
				description: task.description,
				dueDate: task.dueDate
			});
			if (!opened.ok) throw new Error(`Could not seed ${task.title}: ${opened.error}`);

			// Opened in the default state; moved to its group like a person would.
			const target = stateOf.get(task.group);
			if (!target) throw new Error(`The organisation has no ${task.group} state to seed into.`);
			const moved = await moveTask(actor, opened.value.id, target);
			if (!moved.ok) throw new Error(`Could not place ${task.title}: ${moved.error}`);

			const assigned = await setAssignees(actor, opened.value.id, task.assigneeEmails.map(person));
			if (!assigned.ok) throw new Error(`Could not assign ${task.title}: ${assigned.error}`);
		}

		if (planned.archived) await archiveProject(actor, project.value.id);
	}

	return created;
}

/**
 * Escalates the seeded tickets through `escalateTicket`, so the links and the
 * activity on both sides are the ones the app would have written.
 *
 * **Idempotent by presence**, like tickets and projects. `new_task` mints a
 * record, so replaying the plan would pile up duplicates; instead the whole
 * step is skipped once any planned ticket already has work linked to it, and the
 * links stay exactly as the first run left them. A ticket the plan names that
 * does not exist (a database seeded before this entry) is skipped, not an error.
 *
 * Returns how many tickets it escalated.
 */
export async function applyEscalations(actor: SessionUser, plan: EscalationsPlan): Promise<number> {
	const organisationId = actor.organisationId;

	const ticketIds = new Map<string, string>();
	for (const planned of plan.escalations) {
		const [ticket] = await getDb()
			.select({ id: tickets.id })
			.from(tickets)
			.where(
				and(eq(tickets.organisationId, organisationId), eq(tickets.subject, planned.ticketSubject))
			)
			.limit(1);
		if (ticket) ticketIds.set(planned.ticketSubject, ticket.id);
	}

	for (const id of ticketIds.values()) {
		if ((await relatedTo(actor, { kind: 'ticket', id })).some(isWork)) return 0;
	}

	const projectByName = new Map(
		[...(await listProjects(actor)), ...(await listProjects(actor, { archived: true }))].map(
			(project) => [project.name, project]
		)
	);
	const createdTasks = new Map<string, string>();

	const projectNamed = (name: string) => {
		const project = projectByName.get(name);
		if (!project) throw new Error(`The escalations plan names ${name}, which is not a project.`);
		return project;
	};

	let escalated = 0;
	for (const planned of plan.escalations) {
		const ticketId = ticketIds.get(planned.ticketSubject);
		if (!ticketId) continue;

		const target = planned.target;
		let resolved: EscalationTarget;

		switch (target.kind) {
			case 'new_task':
				resolved = {
					kind: 'new_task',
					projectId: projectNamed(target.projectName).id,
					title: target.title,
					description: target.description
				};
				break;

			case 'planned_task': {
				const taskId = createdTasks.get(target.key);
				if (!taskId) throw new Error(`No earlier entry created the task ${target.key}.`);
				resolved = { kind: 'existing_task', taskId };
				break;
			}

			case 'existing_task': {
				const project = projectNamed(target.projectName);
				const task = (await listTasks(actor, { projectId: project.id })).find(
					(candidate) => candidate.title === target.taskTitle
				);
				if (!task) throw new Error(`${target.projectName} has no task ${target.taskTitle}.`);
				resolved = { kind: 'existing_task', taskId: task.id };
				break;
			}

			case 'existing_project':
				resolved = { kind: 'existing_project', projectId: projectNamed(target.projectName).id };
				break;
		}

		const outcome = await escalateTicket(actor, ticketId, resolved);
		if (!outcome.ok) {
			throw new Error(`Could not escalate ${planned.ticketSubject}: ${outcome.error}`);
		}

		if (target.kind === 'new_task') createdTasks.set(target.key, outcome.value.id);
		escalated += 1;
	}

	return escalated;
}

const isWork = (group: { relation: string }) =>
	group.relation === 'resolved_in' || group.relation === 'handled_in';
