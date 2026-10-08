import { DATABASE_URL } from '$app/env/private';
import { advanceAssetTagSequence, applyPlan } from './apply';
import { DEMO_PASSWORD, ensureDemoLogins, ensureWorkspace } from './accounts';
import { assertLocalDatabase } from './guard';
import { buildPlan } from './plan';

/**
 * `npm run db:seed`: a believable inventory for development, deterministic from
 * a fixed seed and safe to run twice. Cross-cutting by nature — it touches
 * `directory`, `assets` and `activity` — which is why it sits beside the
 * domains rather than inside one (ADR 0002), and calls their public functions
 * rather than their tables.
 *
 * #13 brings it to volume and extends it to tickets and projects.
 */
export async function run(): Promise<void> {
	assertLocalDatabase(DATABASE_URL);

	const workspace = await ensureWorkspace();
	const plan = buildPlan();
	const summary = await applyPlan(workspace.actor, plan);

	await advanceAssetTagSequence(plan.assets.length);

	const logins = await ensureDemoLogins(workspace.organisationId);

	console.log(`Registered ${summary.registered} assets, skipped ${summary.skipped} already there.`);
	for (const line of summary.refused) console.warn(`  not seeded — ${line}`);

	console.log('\nSign in (password for every demo account: ' + DEMO_PASSWORD + '):');
	if (workspace.createdOrganisation) console.log('  admin       admin@acme.test');
	for (const login of logins) {
		console.log(
			`  ${login.role.padEnd(11)} ${login.email}${login.created ? '' : '  (already existed)'}`
		);
	}
}
