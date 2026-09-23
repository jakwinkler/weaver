# OAuth SSO

Google and GitHub sign-in are implemented. For provider registration, callback
URLs, credential changes, and API reload commands, use the
[OAuth sign-in guide](../wiki/OAuth-Sign-In.md).
The checklist below records the original implementation plan.

> Sign in with Google, GitHub, and Microsoft. SAML/OIDC for enterprise SSO.

## Why
Most teams already use Google or GitHub. Requiring a separate password creates friction. Enterprise customers require SAML/OIDC for compliance.

## Current State
- UserEntity has `authProvider` field (local/google/saml/oidc) — only 'local' implemented
- JWT authentication fully working
- No OAuth routes, no provider configuration
- Tenant settings schema exists but no SSO config

## Tasks

### Backend
- [ ] **Install passport strategies** — Add `passport-google-oauth20`, `passport-github2` dependencies. _Files: `apps/api/package.json`_
- [ ] **Google OAuth strategy** — Passport strategy using Google client ID/secret from env vars. On callback: find or create user by email, create/update membership, issue JWT. _Files: `apps/api/src/core/auth/google.strategy.ts`_
- [ ] **GitHub OAuth strategy** — Same pattern for GitHub. _Files: `apps/api/src/core/auth/github.strategy.ts`_
- [ ] **OAuth routes** — `GET /auth/google` (redirect to Google), `GET /auth/google/callback` (handle response, set cookie, redirect to app). Same for GitHub. _Files: `apps/api/src/core/auth/auth.controller.ts`_
- [ ] **Account linking** — If user with same email exists (local auth), link OAuth provider to existing account instead of creating duplicate. _Files: `apps/api/src/core/auth/auth.service.ts`_
- [ ] **Tenant association** — After OAuth, if user has no memberships, show "Join or Create Organization" page. If single membership, auto-select. If multiple, show picker. _Files: `apps/api/src/core/auth/auth.service.ts`_
- [ ] **SAML strategy** — Using `passport-saml`. Configurable per tenant (IdP URL, certificate). _Files: `apps/api/src/core/auth/saml.strategy.ts`_
- [ ] **OIDC strategy** — Using `openid-client`. Configurable per tenant (discovery URL, client ID/secret). _Files: `apps/api/src/core/auth/oidc.strategy.ts`_
- [ ] **SSO config in tenant settings** — Add `sso` section to tenant settings: `{ google: { enabled }, github: { enabled }, saml: { idpUrl, cert }, oidc: { discoveryUrl, clientId, clientSecret } }`. _Files: `apps/api/src/modules/settings/settings.service.ts`_

### Frontend
- [ ] **Social login buttons** — "Sign in with Google" and "Sign in with GitHub" buttons on LoginPage. Link to `/auth/google` and `/auth/github`. _Files: `apps/web/src/features/auth/LoginPage.tsx`_
- [ ] **OAuth callback handler** — Route `/auth/callback` reads JWT from cookie (set by backend redirect), stores in auth store, redirects to dashboard. _Files: `apps/web/src/features/auth/OAuthCallback.tsx`_
- [ ] **SSO configuration in admin** — Toggle Google/GitHub SSO. SAML config form (IdP URL, certificate upload). OIDC config form (discovery URL, client ID/secret). _Files: `apps/web/src/features/settings/SystemSettingsPage.tsx`_
- [ ] **Organization picker** — Post-OAuth page when user has multiple memberships. Select which org to enter. _Files: `apps/web/src/features/auth/OrgPicker.tsx`_

### Tests
- [ ] **E2E: OAuth redirect** — GET /auth/google returns 302 to Google URL. _File: `apps/api/test/oauth.e2e-spec.ts`_
- [ ] **E2E: account linking** — Create local user, OAuth login with same email, verify single user with both providers. _File: `apps/api/test/oauth.e2e-spec.ts`_
- [ ] **E2E: new OAuth user** — OAuth callback with unknown email creates user + prompts org creation. _File: `apps/api/test/oauth.e2e-spec.ts`_

## Acceptance Criteria
- "Sign in with Google" and "Sign in with GitHub" on login page
- OAuth creates account if new, links if existing email
- JWT issued after OAuth (same as local login)
- Multi-org users see org picker
- Admin can enable/disable OAuth providers
- SAML/OIDC configurable per tenant for enterprise
- Auth provider stored on user record

## Dependencies
- None
