# API Key Management

> Create and manage personal API keys for programmatic access. Support scoped permissions.

## Why
Automation, CI/CD, and scripting need API access without browser sessions. The entity already exists but has no endpoints or UI.

## Current State
- ApiKeyEntity exists in public schema (id, tenantId, userId, name, keyHash, scopes, expiresAt, lastUsedAt, createdAt)
- No API key endpoints
- No authentication via API key (only JWT)
- No UI for key management

## Tasks

### Backend
- [ ] **API key generation endpoint** — `POST /api-keys`. Generate random 40-char key, hash with SHA-256, store hash. Return plain key ONCE in response (never stored or returned again). _Files: `apps/api/src/modules/api-keys/api-keys.controller.ts`, `apps/api/src/modules/api-keys/api-keys.service.ts`, `apps/api/src/modules/api-keys/api-keys.module.ts`_
- [ ] **API key list/delete endpoints** — `GET /api-keys` (list user's keys, mask key), `DELETE /api-keys/:id`. _Files: `apps/api/src/modules/api-keys/api-keys.controller.ts`_
- [ ] **API key authentication guard** — Check `Authorization: Bearer wvr_xxxxx` header. If key starts with `wvr_`, look up by hash. Set request.user from associated user + membership. _Files: `apps/api/src/core/auth/api-key.guard.ts`_
- [ ] **Scope enforcement** — API key scopes limit which endpoints can be called. Scopes: `read`, `write`, `admin`. Check scope against endpoint's required permission category. _Files: `apps/api/src/core/auth/api-key.guard.ts`_
- [ ] **Rate limiting** — Per-key rate limit: 100 requests/minute. Track via Redis. _Files: `apps/api/src/core/auth/api-key-rate-limit.guard.ts`_
- [ ] **Last used tracking** — Update `lastUsedAt` on each API key use (debounced to every 5 minutes). _Files: `apps/api/src/core/auth/api-key.guard.ts`_
- [ ] **Expiration** — Reject expired keys with 401. Allow `expiresAt` to be set on creation (optional, nullable = never expires). _Files: `apps/api/src/core/auth/api-key.guard.ts`_

### Frontend
- [ ] **API keys page** — Route: in Profile page, "API Keys" tab. List keys: name, scopes, created, last used, expires. "Create new key" button. Delete button with confirmation. _Files: `apps/web/src/features/profile/ApiKeysTab.tsx`_
- [ ] **Create key dialog** — Form: name, scopes (checkboxes: read, write, admin), expiration (optional date or "never"). On create, show key in copyable field with warning "This will only be shown once." _Files: `apps/web/src/features/profile/CreateApiKeyDialog.tsx`_

### Tests
- [ ] **E2E: create API key** — POST /api-keys, verify key returned. Use key to call GET /auth/me, verify 200. _File: `apps/api/test/api-keys.e2e-spec.ts`_
- [ ] **E2E: scope enforcement** — Create read-only key, attempt POST /projects, expect 403. _File: `apps/api/test/api-keys.e2e-spec.ts`_
- [ ] **E2E: expired key rejected** — Create key with past expiration, use it, expect 401. _File: `apps/api/test/api-keys.e2e-spec.ts`_
- [ ] **E2E: delete key** — Delete key, use it, expect 401. _File: `apps/api/test/api-keys.e2e-spec.ts`_
- [ ] **E2E: rate limiting** — Send 101 requests, expect 429 on 101st. _File: `apps/api/test/api-keys.e2e-spec.ts`_

## Acceptance Criteria
- Users can create named API keys with scopes
- Key shown once on creation (never again)
- API key authenticates like JWT (same endpoints)
- Scopes limit access (read/write/admin)
- Expired keys rejected
- Rate limited per key
- Last used timestamp tracked
- Keys can be deleted

## Dependencies
- None
