import { redirect } from '@sveltejs/kit';
import {
	ASSET_READ_PERMISSIONS,
	STAFF_SHELL_PERMISSIONS,
	TICKET_READ_PERMISSIONS
} from '#lib/domain/access.js';
import { can, permissionsOf, type Permission } from '#lib/server/access/permissions.js';
import { requireUser } from '#lib/server/auth/guards.js';
import { assetRegistrationsSparkline, assetSummary } from '#lib/server/assets/index.js';
import { countPeople, countTeams } from '#lib/server/directory/index.js';
import { listRecentActivity } from '#lib/server/activity/index.js';
import { visibleFeed } from '#lib/server/links/index.js';
import { myOpenTasks } from '#lib/server/projects/index.js';
import {
	hasPortalActivity,
	listQueues,
	myOpenTickets,
	ticketOpeningsSparkline,
	ticketSummary
} from '#lib/server/service-desk/index.js';
import type { PageServerLoad } from './$types';

/**
 * The two sparkline windows (#90), named rather than inlined so the server and
 * the chart's accessible label cannot disagree about how many days the line
 * covers. Ticket inflow is read a week at a time; asset registrations are far
 * sparser, so a week of them would usually be a flat zero that says nothing —
 * a month is the shortest window with a shape in it.
 */
const TICKET_SPARKLINE_DAYS = 7;
const ASSET_SPARKLINE_DAYS = 30;

/**
 * The three checklist steps this organisation has not completed yet (#84).
 * `addPerson` asks for more than one, since setup already created the
 * registering admin's own directory record — asking for "a person" would
 * read as complete the moment the install exists, before anyone has used it.
 */
interface ChecklistStatus {
	registerAsset: boolean;
	defineQueue: boolean;
	openPortal: boolean;
	addPerson: boolean;
}

/** An employee's home is the portal; the overview belongs to the staff shell. */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	if (!STAFF_SHELL_PERMISSIONS.some((permission) => can(user, permission))) {
		redirect(303, '/portal');
	}

	const permissions = permissionsOf(user);
	const hasAnyPermission = (list: readonly Permission[]) =>
		list.some((permission) => permissions.includes(permission));

	const seesAssets = hasAnyPermission(ASSET_READ_PERMISSIONS);
	const seesTickets = hasAnyPermission(TICKET_READ_PERMISSIONS);
	const seesPeople = can(user, 'people.view');
	const seesProjects = can(user, 'projects.view');

	/**
	 * One query per domain (ADR 0002), resolved in parallel: none depends on
	 * another, and each is gated on the permission its own card needs so a
	 * viewer missing one never triggers a query whose result they could not be
	 * shown anyway.
	 */
	const [
		assets,
		tickets,
		queueCount,
		portalUsed,
		people,
		teams,
		myTickets,
		activity,
		ticketTrend,
		assetTrend,
		myTasks
	] = await Promise.all([
		seesAssets ? assetSummary(user) : undefined,
		seesTickets ? ticketSummary(user) : undefined,
		seesTickets ? listQueues(user).then((rows) => rows.length) : undefined,
		seesTickets ? hasPortalActivity(user.organisationId) : undefined,
		seesPeople ? countPeople(user.organisationId) : undefined,
		seesPeople ? countTeams(user.organisationId) : undefined,
		seesTickets ? myOpenTickets(user, 5) : undefined,
		// Work the viewer cannot see (a members-only project) is dropped from the
		// feed: its sentences are made of its title (ADR 0042).
		seesAssets || seesTickets
			? listRecentActivity(user.organisationId, 8).then((entries) => visibleFeed(user, entries))
			: undefined,
		// Gated on the same permission as the card each one sits inside, so no
		// viewer triggers a query whose result they could not be shown (#90).
		seesTickets ? ticketOpeningsSparkline(user, TICKET_SPARKLINE_DAYS) : undefined,
		seesAssets ? assetRegistrationsSparkline(user, ASSET_SPARKLINE_DAYS) : undefined,
		seesProjects ? myOpenTasks(user, 5) : undefined
	]);

	const checklist: ChecklistStatus = {
		registerAsset: seesAssets ? (assets?.total ?? 0) > 0 : true,
		defineQueue: seesTickets ? (queueCount ?? 0) > 0 : true,
		openPortal: seesTickets ? (portalUsed ?? false) : true,
		addPerson: seesPeople ? (people ?? 0) > 1 : true
	};

	const steps = Object.values(checklist);
	const mode: 'empty' | 'partial' | 'working' = steps.every(Boolean)
		? 'working'
		: steps.every((done) => !done)
			? 'empty'
			: 'partial';

	return {
		user: { name: user.name },
		mode,
		checklist,
		assets,
		tickets,
		people,
		teams,
		myTickets: myTickets ?? [],
		// `undefined` for a viewer who cannot read projects: no panel section at all.
		myTasks,
		activity: activity ?? [],
		ticketTrend,
		assetTrend
	};
};
