# syntax=docker/dockerfile:1
#
# The production artefact of ADR 0001: one Node container, Postgres elsewhere.
# One image serves every environment (ADR 0012): no origin, base path or secret
# is baked in, everything arrives as environment variables at run time.

ARG NODE_VERSION=24

# ── manifests ───────────────────────────────────────────────────────────────
# Every release writes its version into package.json and package-lock.json, and
# an image is only published for a release: the `npm ci` layers below never once
# came from the cache. Here both files lose the project's own version, so those
# layers change only when a dependency does. The build stage copies the real
# package.json back with the sources, so the build still reads the real version.
FROM node:${NODE_VERSION}-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
RUN node -e " \
  const fs = require('node:fs'); \
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')); \
  pkg.version = lock.version = lock.packages[''].version = '0.0.0'; \
  fs.writeFileSync('package.json', JSON.stringify(pkg)); \
  fs.writeFileSync('package-lock.json', JSON.stringify(lock)); \
"

# ── build ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app

COPY --from=manifests /app/package.json /app/package-lock.json ./
COPY .npmrc ./
# --ignore-scripts: `prepare` runs svelte-kit sync before the sources exist.
RUN npm ci --ignore-scripts

COPY . .
# `prepare` generates the Paraglide runtime and SvelteKit's types; the build
# needs both. Building needs no credentials (see src/env.ts).
RUN npm run prepare && npm run build

# ── production dependencies ─────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY --from=manifests /app/package.json /app/package-lock.json ./
COPY .npmrc ./
RUN npm ci --omit=dev --ignore-scripts

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
COPY scripts/migrate.mjs ./scripts/migrate.mjs

# Ticket attachments live outside the image: mount a volume on /data/uploads.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
VOLUME /data/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# Pending migrations are applied on every start; with none pending it is a no-op.
# If one fails the container exits, so a half-migrated app never serves traffic.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node build"]
