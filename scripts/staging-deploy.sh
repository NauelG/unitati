#!/usr/bin/env bash
#
# Deploy a ref of Unitati to a staging host. See docs/adr/0012-environments-and-real-verification.md.
#
#   scripts/staging-deploy.sh                # deploys origin/main
#   scripts/staging-deploy.sh feat/assets    # deploys a branch
#   scripts/staging-deploy.sh df00b32        # deploys a commit
#   FORCE=1 scripts/staging-deploy.sh        # rebuilds the ref already serving
#
# It runs on the staging host, against a layout it owns:
#
#   $STAGING_ROOT/
#     repo/                        a clone of origin, fetched on every run
#     releases/<timestamp>-<sha>/  one unpacked, installed and built tree each
#       .release-complete          written only once it served a healthy response
#     current -> releases/...      the symlink the systemd unit points at
#     unitati.env                  secrets, mode 600, never inside the clone
#     .deploy.lock                 flock held for the length of a deploy
#
# The ref is resolved from `origin`, never from a working tree: staging proves
# that what was pushed works, which is what catches the file nobody committed.
#
# The deploy mechanism and the application are versioned together but resolved
# apart: the application comes from the ref you ask for, while these scripts are
# always main's copy, fast-forwarded in `repo/` on every run. That gives the
# systemd units one stable path to point at — `$STAGING_ROOT/repo/scripts/` —
# instead of one that changes with every release.
#
# A failed health check reverts the symlink to the release that was serving and
# restarts, so a broken build never takes staging down. What it does NOT revert
# is the database: migrations are forward-only. A deploy that applies a
# destructive migration and then fails leaves the previous release running
# against a schema it was not written for. Additive migrations are safe;
# destructive ones need a plan of their own.
set -euo pipefail

STAGING_ROOT="${STAGING_ROOT:-$HOME/staging}"
SERVICE="${SERVICE:-unitati-staging}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

REPO="$STAGING_ROOT/repo"
RELEASES="$STAGING_ROOT/releases"
CURRENT="$STAGING_ROOT/current"
ENV_FILE="$STAGING_ROOT/unitati.env"

# Written into a release only once it has served a healthy response. Its absence
# is what marks a release as having died mid-deploy.
COMPLETE_MARKER='.release-complete'

# Overridable so the rollback path can be exercised on purpose: point the check
# at a port nothing serves and the deploy must revert the symlink and restart.
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-45}"

REF="${1:-origin/main}"

die() {
	echo "✖ $*" >&2
	exit 1
}
step() {
	echo
	echo "── $*"
}

# ── preconditions ───────────────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || die "no env file at $ENV_FILE"
[ -d "$REPO/.git" ] || die "no clone at $REPO"
systemctl --user cat "$SERVICE" >/dev/null 2>&1 || die "no systemd user unit '$SERVICE'"
mkdir -p "$RELEASES"

# systemd refuses to start the timer's oneshot while it is already running, but
# nothing stops a hand-run deploy from racing one — which is exactly what
# happened while this environment was being built. Two deploys sharing a clone,
# a symlink and a database is not a race worth debugging later.
exec 9>"$STAGING_ROOT/.deploy.lock"
flock -n 9 || die "another deploy holds $STAGING_ROOT/.deploy.lock"

# Exported for drizzle-kit (DATABASE_URL) and for the closing message
# (BETTER_AUTH_URL). The release tree carries no .env, so these are the only
# source of truth for this host.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[ -n "${DATABASE_URL:-}" ] || die "$ENV_FILE defines no DATABASE_URL"

PREVIOUS=''
if [ -L "$CURRENT" ]; then
	PREVIOUS="$(readlink -f "$CURRENT")"
fi

# ── resolve the ref ─────────────────────────────────────────────────────────
step "fetching $REF"
git -C "$REPO" fetch --prune --quiet origin

# Keep the clone's checkout on main so `repo/scripts/` is always main's copy —
# the stable path the systemd units invoke. Nothing else ever writes to this
# tree, so a fast-forward is always available; --ff-only refuses loudly rather
# than inventing a merge, which is the behaviour we want if it ever diverges.
git -C "$REPO" checkout --quiet main
git -C "$REPO" merge --quiet --ff-only origin/main

SHA="$(git -C "$REPO" rev-parse --verify "$REF^{commit}")" || die "cannot resolve ref '$REF'"
SHORT="$(git -C "$REPO" rev-parse --short "$SHA")"
echo "$SHORT  $(git -C "$REPO" log -1 --format=%s "$SHA")"

if [ -n "$PREVIOUS" ] && [ "${PREVIOUS##*-}" = "$SHORT" ] && [ "${FORCE:-0}" != '1' ]; then
	echo
	echo "$SHORT is already the serving release. FORCE=1 to rebuild it anyway."
	exit 0
fi

RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)-$SHORT"

# ── materialise the tree ────────────────────────────────────────────────────
step "unpacking $SHORT into $(basename "$RELEASE")"
mkdir -p "$RELEASE"
git -C "$REPO" archive "$SHA" | tar -x -C "$RELEASE"

step 'installing dependencies'
(cd "$RELEASE" && npm ci --silent)

# Build before touching the database: a tree that cannot compile must never
# have migrated anything.
step 'building'
(cd "$RELEASE" && npm run build >/dev/null)

step 'applying migrations'
(cd "$RELEASE" && npm run db:migrate)

# ── swap ────────────────────────────────────────────────────────────────────
step 'swapping the symlink'
ln -sfn "$RELEASE" "$CURRENT.tmp"
mv -Tf "$CURRENT.tmp" "$CURRENT"
echo "current -> $(basename "$RELEASE")"

step "restarting $SERVICE"
systemctl --user restart "$SERVICE"

# ── health check ────────────────────────────────────────────────────────────
step 'health check'
healthy=0
for _ in $(seq "$HEALTH_TIMEOUT"); do
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)"
	case "$code" in
	2?? | 3??)
		healthy=1
		echo "alive (HTTP $code)"
		break
		;;
	esac
	sleep 1
done

if [ "$healthy" != '1' ]; then
	echo "✖ no healthy response from $HEALTH_URL after ${HEALTH_TIMEOUT}s" >&2
	if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
		echo "rolling back to $(basename "$PREVIOUS")" >&2
		ln -sfn "$PREVIOUS" "$CURRENT.tmp"
		mv -Tf "$CURRENT.tmp" "$CURRENT"
		systemctl --user restart "$SERVICE" || true
	else
		echo 'no previous release to roll back to' >&2
	fi
	echo >&2
	echo '── journal ──' >&2
	journalctl --user -u "$SERVICE" -n 30 --no-pager >&2 || true
	exit 1
fi

# This release has served a healthy response, which is the only thing that makes
# it a valid rollback target. Everything downstream keys off this marker.
touch "$RELEASE/$COMPLETE_MARKER"

# ── prune ───────────────────────────────────────────────────────────────────
# Incomplete releases do not occupy a slot in the quota. A deploy that dies
# mid-build leaves a directory behind — one did, killed by the OOM killer during
# `npm ci` — and counting those would let a run of failures evict the last
# known-good release, which is the single thing this pattern exists to keep.
step "pruning releases (keeping $KEEP_RELEASES complete)"
keep_current="$(readlink -f "$CURRENT")"

prune() {
	while read -r dir; do
		[ -n "$dir" ] || continue
		[ "$(readlink -f "$dir")" = "$keep_current" ] && continue
		echo "removing $1$(basename "$dir")"
		rm -rf "$dir"
	done
}

find "$RELEASES" -mindepth 1 -maxdepth 1 -type d \
	'!' -exec test -e "{}/$COMPLETE_MARKER" ';' -print |
	prune 'incomplete '

find "$RELEASES" -mindepth 1 -maxdepth 1 -type d \
	-exec test -e "{}/$COMPLETE_MARKER" ';' -print |
	sort | head -n -"$KEEP_RELEASES" |
	prune ''

step 'done'
echo "$SHORT serving at ${BETTER_AUTH_URL:-$HEALTH_URL}"
