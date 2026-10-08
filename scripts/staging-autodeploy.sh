#!/usr/bin/env bash
#
# Deploy origin/main to staging, but only when CI for that exact commit is green.
# Driven by unitati-staging-update.timer. See docs/adr/0012-environments-and-real-verification.md.
#
#   scripts/staging-autodeploy.sh               # what the timer runs
#   DRY_RUN=1 scripts/staging-autodeploy.sh     # report the decision, deploy nothing
#   scripts/staging-autodeploy.sh origin/main   # an explicit ref
#
# Why the gate exists: without it a broken push deploys itself minutes later and
# takes staging down with nobody having touched anything, which is the opposite
# of what staging is for. The health check and rollback inside staging-deploy.sh
# are the second net, not the first.
#
# It asks the check-runs API, not the combined status API. GitHub Actions writes
# check runs and leaves the legacy status endpoint empty, so
# `/commits/<sha>/status` answers `{"state":"pending","total":0}` forever and a
# gate built on it would never open. Measured on this repo, not assumed.
#
# Exit codes: 0 when it deployed, and also when it correctly decided not to
# (nothing new, CI still running, CI red) — those are expected, recurring states
# and a failed unit for them would cry wolf. Non-zero only when the deploy
# itself failed, so `systemctl --user --failed` means something.
set -euo pipefail

STAGING_ROOT="${STAGING_ROOT:-$HOME/staging}"
REPO="$STAGING_ROOT/repo"
CURRENT="$STAGING_ROOT/current"
REF="${1:-origin/main}"

# The deploy script next to this one: the autodeploy of a release drives the
# deploy of that same release.
DEPLOY="$(dirname "$(readlink -f "$0")")/staging-deploy.sh"

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }
die() {
	echo "✖ $*" >&2
	exit 1
}

[ -d "$REPO/.git" ] || die "no clone at $REPO"
[ -x "$DEPLOY" ] || die "no executable deploy script at $DEPLOY"

# ── what is new ─────────────────────────────────────────────────────────────
git -C "$REPO" fetch --prune --quiet origin
SHA="$(git -C "$REPO" rev-parse --verify "$REF^{commit}")" || die "cannot resolve ref '$REF'"
SHORT="$(git -C "$REPO" rev-parse --short "$SHA")"

serving=''
if [ -L "$CURRENT" ]; then
	target="$(readlink -f "$CURRENT")"
	serving="${target##*-}"
fi

if [ "$serving" = "$SHORT" ]; then
	log "$SHORT is already serving; nothing to do"
	exit 0
fi

# ── the gate ────────────────────────────────────────────────────────────────
# One line per check run: "<status>:<conclusion>:<name>".
runs="$(
	cd "$REPO" && gh api "repos/{owner}/{repo}/commits/$SHA/check-runs" \
		--jq '.check_runs[] | "\(.status):\(.conclusion // "none"):\(.name)"' 2>/dev/null || true
)"

if [ -z "$runs" ]; then
	log "$SHORT has no check runs yet; waiting for CI"
	exit 0
fi

pending="$(printf '%s\n' "$runs" | grep -cv '^completed:' || true)"
if [ "$pending" -gt 0 ]; then
	log "$SHORT has $pending check run(s) still going; waiting"
	exit 0
fi

# success, skipped and neutral are all acceptable outcomes of a completed run.
# Anything else — failure, cancelled, timed_out, action_required, stale — is not.
red="$(printf '%s\n' "$runs" | grep -Ev '^completed:(success|skipped|neutral):' || true)"
if [ -n "$red" ]; then
	log "$SHORT will NOT be deployed, CI is not green:"
	printf '%s\n' "$red" | while IFS=: read -r _ conclusion name; do
		log "  $name: $conclusion"
	done
	exit 0
fi

# ── deploy ──────────────────────────────────────────────────────────────────
if [ "${DRY_RUN:-0}" = '1' ]; then
	log "would deploy $SHORT (CI green); DRY_RUN is set, stopping here"
	exit 0
fi

# Pin the verified SHA rather than passing the ref along: if main moves while
# this runs, the ref would resolve to a commit whose CI nobody checked.
log "CI green for $SHORT; deploying"
exec "$DEPLOY" "$SHA"
