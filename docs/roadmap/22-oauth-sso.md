# OAuth SSO

**Status: Implemented for Google, GitHub, SAML, and OIDC.** Provider routes, identity linking, organization selection, and SSO settings are present.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [OAuth Sign In](https://github.com/jakwinkler/weaver/wiki/OAuth-Sign-In).

## Implemented

- [x] Google/GitHub strategies and callbacks, verified-email identity handling, and session issuance.
- [x] Tenant-configured SAML and OIDC flows, protected state handling, and provider configuration.
- [x] Social sign-in controls, callback/session bootstrap, organization creation/selection, and admin SSO forms.
- [x] Generic deployment configuration and OAuth configuration regression check under deploy/compose.

## Differences from the original plan

- The original only-local-auth/no-routes/no-settings claims are obsolete.
- There is no dedicated Microsoft social-login strategy/button in the reviewed source. An appropriate enterprise OIDC/SAML configuration is a separate route, not that missing branded integration.
- The browser does not read an HTTP-only JWT cookie directly; callback/session endpoints bootstrap authenticated state.
- Provider setup is operator configuration. Visible buttons do not prove working credentials, and a redirect does not prove a completed login.

## Remaining work and verification

- [ ] Complete Google, GitHub, SAML, and OIDC provider round trips, including account linking and multiple organizations, in configured test environments.
- [ ] Implement and verify a dedicated Microsoft social-login flow only if that original scope is still wanted.

## Evidence

Current main uses the generic deploy/compose path. This reconciliation inspected configuration/source; it did not perform real external-provider login.

### Implementation

- [apps/api/src/core/auth/auth.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/auth/auth.controller.ts)
- [apps/api/src/core/auth/auth.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/auth/auth.service.ts)
- [apps/api/src/core/auth/oidc.strategy.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/auth/oidc.strategy.ts)
- [apps/api/src/core/auth/saml.strategy.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/auth/saml.strategy.ts)
- [deploy/compose/README.md](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/deploy/compose/README.md)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/oauth.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/oauth.e2e-spec.ts)
- [deploy/compose/oauth-config.test.cjs](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/deploy/compose/oauth-config.test.cjs)

## Dependencies

- None
