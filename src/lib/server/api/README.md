# api

The REST API at `/api/v1` and the API keys that open it (ADR 0022). The API is one more adapter
over the domain functions (ADR 0002): nothing here queries a domain's tables, and every endpoint
calls a domain function that already knows who may see what.

| File                      | Owns                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `schema.ts`               | `api_keys`, re-exported from `db/schema.ts`                                                                      |
| `index.ts`                | The public surface: routes and the hook import from here and never from a file inside                            |
| `keys.ts`                 | `createApiKey`, `listApiKeys`, `revokeApiKey`, `authenticateApiKey`                                              |
| `key-format.ts`           | The `unt_` format, the SHA-256 hash and the display `start`                                                      |
| `validation.ts`           | What a key may be created with: name, scopes, expiry                                                             |
| `authenticate-request.ts` | `Authorization: Bearer` to principal; which URLs are the API                                                     |
| `registry.ts`             | `defineEndpoint`, `ApiError`, path matching                                                                      |
| `endpoints/`              | Every endpoint, declared once; `endpoints/index.ts` is the list                                                  |
| `dispatch.ts`             | One function from `Request` to `Response`: 401, rate limit, 404, 400, handler, output schema, the error envelope |
| `rate-limit.ts`           | 120 requests per minute per key, a fixed window in process memory, behind one function                           |

## Rules worth knowing before changing this

- **Keys are stored as a hash.** The plaintext (`unt_` + 32 random bytes, base64url) is returned by
  `createApiKey` once and is nowhere else. `start` is the first 8 characters after the prefix.
- **Effective permissions are role ∩ scopes**, on every request. `authenticateApiKey` returns the
  owner with the key's `scopes` attached and `can()` does the intersection, so a domain needs no
  change to honour a key, row-level rules included. Demoting the owner narrows their keys at once.
- **`/api/v1` is bearer-only.** The hook never reads the session cookie there, and never reads a key
  anywhere else. A failure is `401` JSON, never a redirect.
- **`404` is both "not found" and "not allowed"** (ADR 0007). A handler raises `notFound()` for the
  domain's `not_found`, and `conflict(code, message)` for a refusal (`409`).
- **The `output` schema is the allow-list.** A response is parsed through it, so a column the schema
  does not name never leaves. Tickets are addressed by tag; their UUID is not on the wire (ADR 0010).
- **Adding an endpoint** is one `defineEndpoint` in `endpoints/` plus one line in
  `endpoints/index.ts`. Validation, authorisation and (slice C) the OpenAPI document follow from the
  declaration.
