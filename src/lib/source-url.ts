/**
 * The browsable address of a repository, from the `repository.url` field of package.json.
 *
 * npm stores that field as a clone URL (`git+https://host/owner/repo.git`). People need the page
 * they can open in a browser, so the `git+` prefix and the `.git` suffix go. Runs in
 * `vite.config.ts` at build time; anything that is not an http(s) URL fails the build rather than
 * shipping a broken source link (AGPL-3.0 section 13, ADR 0041).
 */
export function sourceUrl(repositoryUrl: string): string {
	const url = repositoryUrl
		.trim()
		.replace(/^git\+/, '')
		.replace(/\.git$/, '')
		.replace(/\/+$/, '');
	if (!/^https?:\/\/[^/\s]+\/\S+$/.test(url)) {
		throw new Error(
			`package.json repository.url is not a browsable http(s) URL: "${repositoryUrl}"`
		);
	}
	return url;
}
