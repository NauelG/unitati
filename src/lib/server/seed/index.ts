import { DATABASE_URL } from '$app/env/private';
import { advanceAssetTagSequence } from '../assets';
import { registerPorts } from '../ports';
import { applyEscalations, applyPlan, applyProjects } from './apply';
import { DEMO_PASSWORD, ensureDemoLogins, ensureWorkspace } from './accounts';
import { assertLocalDatabase } from './guard';
import { buildEscalationsPlan, buildPlan, buildProjectsPlan } from './plan';
import { seedTickets } from './tickets';

/**
 * `npm run db:seed`: a believable inventory for development, deterministic from
 * a fixed seed and safe to run twice. Cross-cutting by nature — it touches
 * `directory`, `assets` and `activity` — which is why it sits beside the
 * domains rather than inside one (ADR 0002), and calls their public functions
 * rather than their tables.
 *
 * #13 brings it to volume.
 */
export async function run(): Promise<void> {
	assertLocalDatabase(DATABASE_URL);
	// Before any write: the tickets below are opened through `service-desk`.
	registerPorts();

	const workspace = await ensureWorkspace();
	const plan = buildPlan();
	const summary = await applyPlan(workspace.actor, plan);

	await advanceAssetTagSequence(plan.assets.length);

	const ticketCount = await seedTickets(workspace.actor);
	const projectCount = await applyProjects(workspace.actor, buildProjectsPlan());
	const escalationCount = await applyEscalations(workspace.actor, buildEscalationsPlan());

	const logins = await ensureDemoLogins(workspace.organisationId);

	console.log(`Registered ${summary.registered} assets, skipped ${summary.skipped} already there.`);
	console.log(
		ticketCount > 0 ? `Opened ${ticketCount} tickets.` : 'Tickets already there, none opened.'
	);
	console.log(
		projectCount > 0
			? `Created ${projectCount} projects, with their tasks.`
			: 'Projects already there, none created.'
	);
	console.log(
		escalationCount > 0
			? `Escalated ${escalationCount} tickets to tasks and projects.`
			: 'Escalations already there, none made.'
	);
	for (const line of summary.refused) console.warn(`  not seeded — ${line}`);

	console.log('\nSign in (password for every demo account: ' + DEMO_PASSWORD + '):');
	if (workspace.createdOrganisation) console.log('  admin       admin@acme.test');
	for (const login of logins) {
		console.log(
			`  ${login.role.padEnd(11)} ${login.email}${login.created ? '' : '  (already existed)'}`
		);
	}
}
