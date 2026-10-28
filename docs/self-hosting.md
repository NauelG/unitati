# Self-hosting Unitati

The [public image](https://github.com/NauelG/unitati/pkgs/container/unitati) runs one Node
application alongside PostgreSQL 17. The repository provides a [Compose example](deploy/compose.yaml)
for **local evaluation**. It starts three services: Postgres, Unitati and Caddy. The app container
is not published directly; Caddy forwards the original host and protocol so forms work over HTTP
on localhost. The same image can run behind an HTTPS reverse proxy in another environment.

## Local evaluation

From a fresh checkout (Docker, Compose v2 and OpenSSL required):

```sh
printf 'POSTGRES_PASSWORD=%s\nBETTER_AUTH_SECRET=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env.production
docker compose --env-file .env.production -f docs/deploy/compose.yaml up -d --wait
```

The repository ignores `.env.production`; **keep it secret and keep it**. Open
<http://localhost:8080/setup> to create the organisation and first administrator. `/setup` is
available only while the installation has no administrator; subsequent visits go to `/login`.
The setup form was verified through the proxy against the anonymous `latest` image.

If your Docker installation has the standalone `docker-compose` binary instead of the Compose
plugin, replace `docker compose` with `docker-compose` in the commands here. No GHCR login is
needed. To use a known release rather than `latest`, add a line such as
`UNITATI_IMAGE=ghcr.io/nauelg/unitati:0.100.0` to `.env.production` once that tag exists. The
release workflow publishes versioned tags after CI succeeds on `main` ([ADR 0023](adr/0023-container-image-on-ghcr.md)).

```sh
# Stop without deleting data.
docker compose --env-file .env.production -f docs/deploy/compose.yaml down

# Start the same installation again (with the same .env.production).
docker compose --env-file .env.production -f docs/deploy/compose.yaml up -d --wait
```

The `postgres-data` and `uploads` volumes survive `down`. `down --volumes` **deletes** the data
and attachments of this local evaluation stack. Changing `POSTGRES_PASSWORD` in the env file after
Postgres has initialised its volume does not update its database user; use the original value.

## Production configuration

The Compose file is an HTTP-only localhost example (`127.0.0.1:8080`), **not** an internet-facing
deployment. For a real installation:

1. Use a hostname with HTTPS and put Unitati behind a trusted reverse proxy. Set
   `BETTER_AUTH_URL` to the public **origin** (`https://unitati.example.org`, no path). Serve
   Unitati at the root of that origin, never at a subpath ([ADR 0014](adr/0014-served-at-the-root-of-the-origin.md)).
2. Point `DATABASE_URL` at a persistent PostgreSQL 17 database and keep
   `BETTER_AUTH_SECRET` stable. Mount persistent storage at `/data/uploads`; otherwise attachments
   and generated handover documents disappear when a container is replaced.
3. Configure `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`; the proxy
   must send those headers with the **actual** public protocol and host. Adapter-node 6 defaults
   to HTTPS without the protocol header: if users connect over plain HTTP without a proxy, form
   POSTs are rejected as cross-site requests. `ORIGIN` is no longer used by adapter-node 6.
   `ADDRESS_HEADER=x-forwarded-for` plus `XFF_DEPTH=1` (one proxy) makes the IP in a signed
   handover the signer's, rather than the proxy's. Set the depth to the real number of trusted
   proxies in your deployment. Do not expose the app container directly alongside trusted
   forwarded headers.
4. Set `APP_ENV=production` to hide development-only surfaces. The image defaults to port 3000,
   `UPLOADS_DIR=/data/uploads` and `BODY_SIZE_LIMIT=56M` (five 10 MB attachments, CSV imports and
   logos). Lowering the body limit below your upload size breaks those workflows.
5. Decide how to back up **both** PostgreSQL and the uploads volume, and test restoring them
   together. Migrations run when the container starts, before the server accepts traffic.
   Migrations are **forward-only**; a failed deployment does not undo its schema changes. Plan
   destructive migrations separately.

Configuration is via environment variables, not values baked into the image. One image can run in
development, staging and production ([ADR 0025](adr/0025-deployment-agnostic.md)). The public
package path in the example is the current upstream image; set `UNITATI_IMAGE` to another registry
URL or tag when appropriate.

| Variable                                                                           | Purpose                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                     | PostgreSQL connection string; required to run                                          |
| `BETTER_AUTH_SECRET`                                                               | Secret for sessions and tokens; generate and preserve it                               |
| `BETTER_AUTH_URL`                                                                  | Public origin of this installation; use HTTPS in production                            |
| `APP_ENV`                                                                          | `development`, `staging` or `production`                                               |
| `UPLOADS_DIR`                                                                      | Persistent file storage; `/data/uploads` in the image                                  |
| `BODY_SIZE_LIMIT`                                                                  | Request body limit; the image sets `56M`                                               |
| `ORGANISATION_TIME_ZONE`                                                           | IANA zone for signed handover documents; e.g. `Europe/Madrid`                          |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`                              | Optional single sign-on; all three or none, see [SSO with authentik](sso-authentik.md) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Optional outbound mail; see [`.env.example`](../.env.example)                          |

Mail is optional: a technician can answer a ticket with `SMTP_HOST` unset, but the requester is
not notified by email. Configure it before relying on email notifications or mailed handover
links. For local development, `npm run mail:start` runs Mailpit on port 8025.

Single sign-on is optional too: with the three `OIDC_*` variables set, people sign in through your
OpenID Connect identity provider ([ADR 0056](adr/0056-single-sign-on-with-oidc-and-scim.md)). The
guide [SSO with authentik](sso-authentik.md) walks through the provider, the application and the
variables. Admins always keep their local password at `/login/local`.

To build the image yourself: `docker build -t unitati:dev .`. Image processing uses `sharp`,
whose prebuilt binaries support Linux x64/arm64 and macOS; `npm ci` needs no native build
toolchain on those platforms.
