#!/usr/bin/env node
/**
 * CI gate for the Developer Certificate of Origin (docs/adr/0041-license-agpl-3.0-only.md).
 *
 * Every non-merge commit between BASE_REF and HEAD must carry a
 * `Signed-off-by: Name <email>` trailer whose email is the commit author's.
 * `git commit -s` writes it; `git rebase --signoff origin/main` adds it to commits
 * that lack it.
 *
 * Usage: BASE_REF=origin/main node .github/scripts/check-dco.mjs
 */
import { execFileSync } from 'node:child_process';

const baseRef = process.env.BASE_REF ?? 'origin/main';
const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

// NUL-separated records, unit separator between fields: commit bodies contain newlines.
const log = git(['log', '--no-merges', '--format=%H%x1f%an%x1f%ae%x1f%B%x00', `${baseRef}..HEAD`]);
const commits = log
	.split('\0')
	.map((record) => record.replace(/^\n/, ''))
	.filter(Boolean)
	.map((record) => {
		const [sha, name, email, body] = record.split('\x1f');
		return { sha, name, email, body };
	});

const unsigned = commits.filter(({ email, body }) => {
	const signers = [...body.matchAll(/^Signed-off-by:\s*.+<([^>]+)>\s*$/gim)].map((m) =>
		m[1].trim().toLowerCase()
	);
	return !signers.includes(email.trim().toLowerCase());
});

if (unsigned.length > 0) {
	console.error(
		`${unsigned.length} of ${commits.length} commit(s) lack a DCO sign-off by their author:\n`
	);
	for (const { sha, name, email, body } of unsigned) {
		console.error(`  ${sha.slice(0, 10)} ${body.split('\n')[0]}  (${name} <${email}>)`);
	}
	console.error(
		'\nSign them off with: git rebase --signoff ' +
			baseRef +
			' && git push --force-with-lease\n' +
			'Why: https://developercertificate.org/ and docs/adr/0041-license-agpl-3.0-only.md'
	);
	process.exit(1);
}

console.log(`DCO OK: ${commits.length} commit(s) signed off by their authors.`);
