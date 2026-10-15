# Sign-in, OAuth, and organization SSO

Use your organization's sign-in method: email/password, Google, GitHub, or configured organization SSO. The sign-in and registration pages show **Continue with Google** and **Continue with GitHub** only when the operator has set those providers up. An organization can still turn either one off under **System Settings → SSO**.

## Sign in as a user

Start from Weaver's login page and choose the provider there. Complete the provider's consent/sign-in flow in the same browser. If your account belongs to more than one organization, use the account menu to switch organizations after sign-in.

The same buttons sign in an existing account and create a new one. If no Weaver account uses the provider's email yet, Weaver creates the account and shows **Create your organization**, which makes you the owner of a new organization. Creating an organization does not grant access to someone else's private organization. To join a team that already uses Weaver, don't create one: use the [private invitation link](https://github.com/jakwinkler/weaver/wiki/For-Invited-Clients) and then ask to be added to the intended private project.

If your account belongs only to organizations that turned the provider off, Weaver shows **Sign in another way** and points you back to the sign-in page. It still offers to create a new organization below that notice.

An account that only uses Google, GitHub, SAML, or OIDC has no Weaver password. **Forgot password?** doesn't add one; its email explains how to sign in instead.

Existing local and external identities are associated by verified email in the implemented flow. Check the selected provider account if you land in an unexpected organization or cannot find your work.

The current invitation form asks for a password. An existing account that only uses external sign-in cannot accept that form without a Weaver password; contact the team before attempting to use the invitation.

## For administrators: configure SSO

**System Settings → SSO** contains tenant SSO configuration. Google and GitHub also need operator-level provider application credentials. SAML and OIDC require the identity provider's settings and the tenant-specific callback. The [Compose deployment template](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/deploy/compose/README.md) describes social provider setup for a deployment.

Keep a working administrator sign-in path while testing. Test a complete login, organization selection, logout, and return login before directing everyone to a new provider. This guide documents the code/configuration; no real Google, GitHub, SAML, or OIDC login was completed during the documentation walkthrough.

## Common failures

| Symptom | Check |
| --- | --- |
| `OAuth is not configured` / 503 | Provider client ID and secret are present in the running API environment |
| No Google or GitHub button | The running API has no client ID and secret for that provider; `GET /api/v1/auth/providers` shows what it sees |
| **Create your organization** after a provider sign-in | No Weaver account used that email, so one was created. Use an invitation to join an existing team |
| **Sign in another way** after a provider sign-in | Every organization on the account turned that provider off |
| Provider rejects redirect URI | Registered callback exactly matches the generated/overridden callback |
| Wrong provider app appears | The running API uses the intended client ID; start a fresh login attempt |
| Invalid state | Begin again from Weaver in the same browser with cookies enabled |
| Redirect works but login fails afterward | Client secret, verified email, provider response, and callback exchange |
| Correct login, wrong organization | Use the account menu to switch to an organization you belong to |

A redirect to the provider verifies only the start of the flow. It does not verify the credential exchange or the final Weaver session.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

### Provider URLs and environment

Set `API_PUBLIC_URL` to the public API origin **without** `/api/v1`, and set `API_PREFIX=api/v1`. Strategies append the prefix. Set `WEB_URL` for frontend authentication redirects. `WEB_APP_URL` is also used elsewhere for application links.

The current `.env.example` has one origin-only `API_PUBLIC_URL` assignment. Do not append `/api/v1` to it: strategies add the prefix when constructing callback URLs.

| Provider | Start route | Callback at the default prefix |
| --- | --- | --- |
| Google | `/api/v1/auth/google` | `/api/v1/auth/google/callback` |
| GitHub | `/api/v1/auth/github` | `/api/v1/auth/github/callback` |
| SAML | `/api/v1/auth/saml/:tenantSlug` | `/api/v1/auth/saml/:tenantSlug/callback` (POST) |
| OIDC | `/api/v1/auth/oidc/:tenantSlug` | `/api/v1/auth/oidc/:tenantSlug/callback` |

For an installation at `https://weaver.example.com`, the social callbacks are `https://weaver.example.com/api/v1/auth/google/callback` and `https://weaver.example.com/api/v1/auth/github/callback`.

`GET /api/v1/auth/providers` answers `{ "google": boolean, "github": boolean }` from those variables, and the web app hides a button that is false. `GET /api/v1/auth/oauth-context` also returns `provider` and `blockedOrganizationCount`, the number of the account's organizations that turned the provider off.

Social provider variables are `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. Optional `GOOGLE_CALLBACK_URL` and `GITHUB_CALLBACK_URL` override callback construction. GitHub requests `user:email`; the strategy requires a verified email. OIDC discovery validates its URL and requires HTTPS.

### Change configuration and verify

Store secrets using protected deployment configuration, never repository literals or browser build variables. Save a protected backup and the current image/configuration identifiers before a live change. Updating an env file does not update an existing container's environment; recreate the affected API container using the intended pinned release configuration. A simple restart retains its existing environment.

Validate API health and proxy routing after recreation. A proxy that cached an old container address may need a validated reload. Then complete a fresh browser login. Restore the previous protected configuration and image pins if the change fails; provider-revoked secrets cannot be restored merely by restoring a file.

The Compose OAuth configuration regression check is `node --test deploy/compose/oauth-config.test.cjs`. It checks configuration shape with synthetic values, not a real provider exchange.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/api/src/core/auth/auth.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/auth.controller.ts)
- [apps/api/src/core/auth/auth.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/auth.service.ts)
- [apps/api/src/core/auth/google.strategy.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/google.strategy.ts)
- [apps/api/src/core/auth/github.strategy.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/github.strategy.ts)
- [apps/api/src/core/auth/oidc.strategy.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/oidc.strategy.ts)
- [apps/api/src/core/auth/saml.strategy.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/saml.strategy.ts)
- [.env.example](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/.env.example)
- [deploy/weaver.usercore.com/oauth-config.test.cjs](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/deploy/weaver.usercore.com/oauth-config.test.cjs)

Deployment path, single-origin example, and organization switching checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [Compose guide](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/deploy/compose/README.md), [configuration check](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/deploy/compose/oauth-config.test.cjs), and [account menu](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/layouts/AppLayout.tsx).
