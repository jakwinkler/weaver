# September 24 review resolution

Implemented on `fix/review-20260924`, based on `f620ad66af31401fb656ff590b071c784fdf6bd2`. Verification below covers the local implementation. Production rollout and acceptance remain separate steps.

## Implemented

| Findings | Result |
| --- | --- |
| M1 | `/auth/session` returns the existing profile and tenant without minting access/refresh credentials or setting cookies. The OAuth callback restores browser state from this response. |
| M2 | OIDC discovery, token exchange, and JWKS fetching use the pinned public-address transport with HTTPS, caller redirect policy, a 10-second request deadline, and a 1 MiB response limit. Changed discovery settings are checked before saving. Discovery is coalesced and cached for five minutes, bounded to 64 tenants, invalidated by configuration changes, and retried after failures. |
| M3 | Public projects, issues, statuses, and boards have explicit field projections. Boards use bounded pagination with stable ordering; both public views provide continuation controls. Board column counts explicitly describe the current page. |
| M4 | Cross-origin redirects preserve only Accept and Accept-Language headers. Preserved request bodies cannot cross origins, HTTPS cannot downgrade, and caller manual/error redirect policies are respected. Same-origin authentication remains supported. |
| M7 | Unsupported `allowedDomains` writes are rejected. Active settings omit the misleading control, while unrelated updates preserve legacy stored data. |
| L1 | SAML requires a matching request ID, stored per tenant in shared Redis for ten minutes and consumed atomically. Request-local reuse supports Node-SAML's two validation reads without permitting another callback or replica to replay it. Unavailable storage fails closed. |
| L5 | Audit IPs use Express's resolved client address and configured trusted-proxy chain, with a socket fallback. Raw forwarded headers cannot override it. |
| L6 | Create, update, and bulk assignment require tenant membership before mutation. Activity name lookup is tenant-scoped, including legacy foreign assignments. |
| L12 | Socket project joins validate payloads, then enforce 20 attempts per socket per ten seconds, 60 per tenant/user per minute, and 600 per tenant per minute before database authorization. Shared budgets use Redis and fail closed. Authorization is not cached. |
| L15 | Browser unsubscribe sends the token in the POST body and replaces the landing URL after capture. Existing links and mail-client one-click requests remain supported. Initial email/landing logs are still outside this mitigation. |
| L18 | Pairing approval explicitly warns users to approve only a code initiated on their own Mac and identifies device names as self-reported. |
| L19 | Jira request validation and the shared client require HTTPS; the shared redirect policy rejects downgrades. |
| M5, M6, L14 | Plugin docs now explain full in-process server authority, public-handler authentication responsibility, and browser plugins' ambient session authority. SQL search paths and same-origin assets are not sandboxes. |

## Rollout and compatibility

- Deploy API, web, worker, and affected shared/plugin artifacts together. Public endpoint response fields are intentionally narrowed, and `/auth/session` no longer returns tokens. External consumers must use the new contracts.
- SAML supports sign-in initiated through Weaver. Unsolicited IdP-initiated responses are rejected. All API replicas need the same Redis backend and key prefix; Redis must support `GETDEL` (the project's Redis 7 configuration does). In-flight sign-ins started before deployment should be restarted. No production identity-provider acceptance is claimed by the synthetic tests.
- Private-network OIDC providers and credential-bearing HTTP Jira endpoints are rejected. Operators must use public HTTPS endpoints under the current outbound policy.
- Redis outages prevent SAML sign-in and new socket project joins; they do not silently bypass these controls. Socket clients can retry once budgets reset or Redis recovers.
- No database migration or stored settings deletion is required. Legacy `allowedDomains` remains stored but unsupported.
- Rollback is the prior coordinated application artifact set. It restores the previous behavior, including the vulnerabilities corrected here. Do not delete Redis globally; the new SAML request keys expire automatically.

## Accepted or deferred

- **L3, L7:** Keep explicit duplicate-account registration and show-once webhook creation secrets. Neither suggested cosmetic change provides the claimed protection. A different registration privacy contract requires an email-based flow.
- **M5/M6/L14:** Trust documentation is fixed. Untrusted-plugin isolation, provider-verifier infrastructure, and signed immutable bundles remain architectural work. Requiring user JWTs on all provider webhooks would break supported integrations.
- **L2/L4:** JWT issuer/audience and refresh-token families need a coordinated session transition. Revoke-all on an unknown refresh hash could let old-token replay repeatedly log out an account.
- **L8/L9:** Shared certificate-verifying PostgreSQL TLS configuration and bounded tenant connection pools remain planned. Naive connection eviction could interrupt active transactions.
- **L10/L11/L17:** Quotas, streaming/concurrency budgets, upload-reference tracking, and client checks remain a storage-lifecycle project. A null issue ID does not mean an upload is unused; avatars and rich-text content may still reference it.
- **L13:** Keep the existing enforced framing/object/base restrictions and report-only full CSP. Enforcing the proposed policy unchanged would block reCAPTCHA; validate all supported browser features first.
- **L16:** Gravatar stays off by default. Opting in sends an email-derived MD5 to Gravatar; this is not anonymous, and a proxy would not hide the hash from Gravatar.
- Informational proposals for bcrypt cost, hard account lockout, antivirus, global email budgets, job signatures, and broader schema/UX cleanup remain separate work. Do not expand socket recipients merely to activate the unused tenant broadcast helper.
- The triage found four moderate dependency advisories with no demonstrated affected application call paths. Keep compatible parent upgrades tracked; do not force incompatible major overrides merely to clear audit counts. This batch adds only the already-transitive `xml-crypto` version as a direct development dependency for signed SAML fixtures.

## Verification

- Observed failing security regressions before fixes, including replay acceptance using real signed SAML responses against the original strategy, then restored the fixes and verified rejection.
- `pnpm --filter @weaver/api exec jest --runInBand`: **52 suites, 265 tests passed**.
- `TZ=UTC WEAVER_E2E_DATABASE=weaver_e2e_sept24_full WEAVER_E2E_DATABASE_PORT=55442 WEAVER_E2E_REDIS_PORT=56392 pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js --runInBand`: **43 suites, 365 tests passed**, using disposable PostgreSQL 16 and Redis 7. The OAuth fixture was then corrected to provision its tenant schemas and its six tests passed again without the prior schema error.
- Web tests: **56 suites, 152 tests passed**. Shared package: **74 tests passed**; server-common: **5 passed**; worker: **10 passed, 1 pre-existing skipped integration test**. Jira client regressions run in the API suite; its standalone package has no tests.
- `pnpm exec turbo run typecheck`: **28 tasks passed**. API, web, worker, dependencies, and Automatic Time builds passed. The web build retains its existing large-chunk warning.
- `pnpm lint`: **0 errors, 344 warnings**. `git diff --check`: passed.
- Local built-app browser acceptance: signup; 30 public issues with page-two continuation in both list and board; private project denied on the public route; repeated OAuth callback bootstrap leaves one refresh session; logout leaves zero sessions and rejects authenticated bootstrap; no token credentials in localStorage; signed unsubscribe succeeds, persists the preference, scrubs the address bar, and sends no API query token; bundled Automatic Time plugin loads and shows the warning on a real synthetic pairing request.
- SAML tests use generated certificates and signed response/assertion XML, two instances sharing Redis, concurrent callbacks, replay, expiry, unknown IDs, wrong-tenant IDs, unsolicited responses, and unavailable storage. These are local protocol tests, not a real enterprise IdP login.
- Production was not changed or functionally tested in this batch. Disposable browser/API processes and both test containers were removed after acceptance; their ports are free. No production data or services were used.
