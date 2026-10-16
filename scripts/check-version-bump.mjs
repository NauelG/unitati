/**
 * CI gate for the versioning policy (docs/adr/0003-semver-and-changelog.md):
 * a pull request that touches app-shipping files must
 *   1. bump package.json's version above the base branch's,
 *   2. add exactly one dated "## [x.y.z] - YYYY-MM-DD" heading to CHANGELOG.md,
 *   3. update the version badge in README.md.
 *
 *     BASE_REF=origin/main node scripts/check-version-bump.mjs
 *
 * Adapted from renyst-app's check-version-bump.mjs (without in-app release notes).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseRef = process.env.BASE_REF ?? 'origin/main';

/** Files a PR can touch alone without a version bump: none of them ship app behaviour. */
const EXEMPT_PATTERNS = [
	/^\.github\//,
	/^docs\//,
	/^\.agents\//,
	/^\.claude\//,
	/^AGENTS\.md$/,
	/^CLAUDE\.md$/,
	/^README\.md$/,
	/^CHANGELOG\.md$/,
	// Ignore files steer tooling, never the build output: nothing a user runs changes
	// when they do. Listing only .gitignore here was an oversight.
	/^\.gitignore$/,
	/^\.prettierignore$/,
	/^\.eslintignore$/,
	// The agent skills installer keeps its lockfile at the root while the skills
	// themselves live under .agents/: both are agent tooling, neither ships.
	/^skills-lock\.json$/,
	// This gate is CI tooling; editing the policy is not an app release.
	/^scripts\/check-version-bump\.mjs$/
];

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function parseVersion(value) {
	const parts = value.split('.').map(Number);
	if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
		throw new Error(`Not a plain x.y.z semver string: "${value}"`);
	}
	return parts;
}

function isGreater(next, base) {
	for (let i = 0; i < 3; i += 1) {
		if (next[i] !== base[i]) return next[i] > base[i];
	}
	return false;
}

function fail(message) {
	console.error(`✖ ${message}`);
	process.exitCode = 1;
}

const changedFiles = git(['diff', '--name-only', `${baseRef}...HEAD`])
	.split('\n')
	.filter(Boolean);

if (!changedFiles.some((file) => !EXEMPT_PATTERNS.some((pattern) => pattern.test(file)))) {
	console.log('Only docs/CI/agent files changed: version bump not required.');
	process.exit(0);
}

const baseVersion = JSON.parse(git(['show', `${baseRef}:package.json`])).version;
const headVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const escaped = headVersion.replace(/\./g, '\\.');

if (!isGreater(parseVersion(headVersion), parseVersion(baseVersion))) {
	fail(
		`package.json version "${headVersion}" is not newer than ${baseRef}'s "${baseVersion}". ` +
			'Bump it in the same pull request (features → minor, fixes → patch while pre-1.0).'
	);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const headings =
	changelog.match(new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'gm')) ?? [];

if (headings.length === 0) {
	fail(`CHANGELOG.md has no "## [${headVersion}] - YYYY-MM-DD" heading.`);
} else if (headings.length > 1) {
	fail(`CHANGELOG.md has ${headings.length} headings for "${headVersion}". Keep one.`);
}

if (/^## \[Unreleased\]/m.test(changelog)) {
	fail('CHANGELOG.md still has an [Unreleased] section. Move it under the new version heading.');
}

const readme = readFileSync('README.md', 'utf8');
if (!new RegExp(`badge/version-${escaped}-`).test(readme)) {
	fail(`README.md's version badge does not say "${headVersion}".`);
}

if (process.exitCode !== 1) {
	console.log(
		`Version bump OK: ${baseVersion} → ${headVersion}; CHANGELOG.md and README badge match.`
	);
}
