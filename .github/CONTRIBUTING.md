# Contributing to Unitati

Thanks for considering a contribution. Development setup, commands and architecture are in the
[README](../README.md#development) for now.

## License and sign-off

Unitati is licensed under the [GNU Affero General Public License v3.0 only](../LICENSE). By
contributing, you agree that your contribution is licensed under the same terms.

Every commit must be signed off, certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/): that you wrote the
change, or otherwise have the right to submit it under the project's license.

```sh
git commit -s -m "fix: describe the change"
```

That appends a trailer with the name and email of your Git identity, which must match the commit
author:

```
Signed-off-by: Ada Lovelace <ada@example.com>
```

The `DCO sign-off` check fails a pull request with any commit that lacks it. To sign off commits
you already made:

```sh
git rebase --signoff origin/main
git push --force-with-lease
```

There is no contributor license agreement. The decision and its trade-offs are in
[ADR 0041](../docs/adr/0041-license-agpl-3.0-only.md).

## Pull requests

- [Conventional Commits](https://www.conventionalcommits.org/) for titles and commits.
- One pull request per change. A change that ships app behaviour bumps the version and updates
  `CHANGELOG.md` and the README badge ([ADR 0003](../docs/adr/0003-semver-and-changelog.md)).
- Before opening it: `npm run check && npm run lint && npm test`, plus `npm run test:db` when the
  change touches the database.
- The description follows [`pull_request_template.md`](pull_request_template.md); see
  [`docs/agents/pull-requests.md`](../docs/agents/pull-requests.md).
