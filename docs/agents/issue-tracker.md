# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Language

Issue titles and bodies are written in **English**, like every other technical artefact in
this repo. Pull request descriptions are the one exception — see
[pull-requests.md](pull-requests.md).

## Issue body contract

An issue carrying the `ready-for-agent` label has a body with these sections, in this order.
The contract exists because an AFK agent reads the body and nothing else: what the body omits,
the agent invents.

| Section            | Holds                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| _(lead paragraph)_ | One or two sentences: what this is and why it exists. No heading.                                                                  |
| `## Context`       | Why now, what it unblocks, which decisions already constrain it.                                                                   |
| `## Scope`         | What is built. Each bullet is a deliverable, not an aspiration.                                                                    |
| `## Out of scope`  | What is deliberately absent, **with the reason**. An omission with no reason comes back as an argument.                            |
| `## Data model`    | Tables, columns, types, foreign keys, constraints, and the domain that owns each (ADR 0002).                                       |
| `## Done when`     | Verifiable criteria. If a human has to judge whether one passed, it is not a criterion.                                            |
| `## Verification`  | The commands that prove it: `npm run check`, `npm run lint`, `npm test`, `npm run test:db`, plus any steps a command cannot cover. |
| `## References`    | ADRs, docs, existing files the work must follow or extend.                                                                         |

Rules:

- **`Out of scope` is not optional.** It is the section that stops an agent from building v1
  while implementing the MVP.
- **`Data model` names real columns.** "A table for custody" is not a data model; it is a wish.
- **Reference files by path**, and docs by relative link (`../blob/main/docs/...`), so the
  links resolve from the GitHub issue view.
- Keep the provenance footer (`From [roadmap-v1.md](...)`) when rewriting an existing body.

New issues start from [`.github/ISSUE_TEMPLATE/feature.md`](../../.github/ISSUE_TEMPLATE/feature.md),
which is this contract as a fillable skeleton.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
