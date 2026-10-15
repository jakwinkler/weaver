# API Key Management

**Status: Implemented; credential runtime check pending.** Personal API keys have creation/revocation, scopes, hashing, expiration, and UI management.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [API Keys and Integrations](https://github.com/jakwinkler/weaver/wiki/API-Keys-and-Integrations).

## Implemented

- [x] Create/list/delete endpoints with one-time plaintext display and SHA-256 hash storage.
- [x] Bearer wvr_ authentication, current membership resolution, read/write/admin scope checks, and role/project guards.
- [x] Per-key Redis limit of 100 requests/minute, expiration, and last-use updates limited to once per five minutes.
- [x] Profile API Keys tab, create dialog, optional expiry, copy-once display, and revoke confirmation.

## Differences from the original plan

- The endpoints, authentication path, and UI are implemented.
- Keys use a wvr_ prefix plus 40 base64url characters generated from 30 random bytes, not an unprefixed 40-character credential.
- Write does not imply Read. Admin satisfies scope checks but does not grant the account an administrator role.
- API keys cannot be exchanged through interactive session endpoints for an unrestricted JWT.

## Remaining work and verification

- [ ] Run a disposable create/read/write/expire/revoke credential acceptance check and confirm no plaintext persists in logs or lists.
- [ ] Verify Redis outage and proxy/IP behavior separately from the normal rate-limit threshold test.

## Evidence

Source and existing tests were inspected. No API key was minted or exercised in the documentation walkthrough.

### Implementation

- [apps/api/src/modules/api-keys/api-keys.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/api-keys/api-keys.service.ts)
- [apps/api/src/core/auth/api-key.guard.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/auth/api-key.guard.ts)
- [apps/api/src/core/auth/api-key-rate-limit.guard.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/auth/api-key-rate-limit.guard.ts)
- [apps/web/src/features/profile/ApiKeysTab.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/profile/ApiKeysTab.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/api-keys.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/api-keys.e2e-spec.ts)

## Dependencies

- None
