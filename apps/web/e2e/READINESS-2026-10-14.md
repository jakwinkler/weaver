# Weaver local functional readiness, October 14, 2026

## Scope and boundary

This pass used disposable local Postgres and Redis containers with synthetic `example.invalid` accounts. It did not write to `weaver.usercore.com`, deploy, or apply a production database migration. The browser checks use Chromium at desktop size plus one phone-sized core journey. API integration tests use the same isolated local services.

## Verification results

- Full Playwright run: **32 passed out of 32**, including 31 desktop scenarios and one phone-sized journey.
- API end-to-end suite: **229 passed out of 229** across 18 suites.
- API unit suite: **55 passed out of 55**. Web unit suite: **22 passed out of 22**.
- API and web typechecks and production builds passed. The SQL migration executed and re-executed successfully in a separate disposable database. `git diff --check` passed.
- The web build warned that its main JavaScript chunk is 2.17 MB before compression, 568 KB gzip. No loading-time measurement was made, so this is a performance follow-up rather than a confirmed usability failure.

## Main-based release verification

The deployable release branch starts from `f620ad6`, which contains the security and reliability changes already ahead of the original test branch. After integrating the pilot changes, the release branch passed 32/32 Playwright scenarios on a fresh disposable stack, 355/355 API end-to-end tests, 240/240 API unit tests, 150/150 web unit tests, API and web typechecks, and all 20 workspace build tasks. The browser tests were adjusted to use the current account menu name, board drag handle, and sprint page labels. The board drag test confirms status persistence after reload.

The deployment schema planner now includes the new invitation entity. Its read-only diff against the synchronized disposable public schema contained zero statements. The production schema must still be inspected and backed up before applying any plan.

## Functional coverage

| Area | Browser evidence | API or unit evidence |
| --- | --- | --- |
| Account access | Registration, login failure and success, email case, reload, logout, organization switching after access-cookie expiry | Token rotation and revocation; tenant isolation |
| Shared organization | Invitation creation, new and existing account acceptance, wrong email/password, one-time use, owner assigns a member to a private project, switching organizations in both directions with project and role isolation | Expiration, concurrent redemption, owner-only creation, membership-checked switching, permissions |
| Projects and issues | Create, edit, sort, duplicate key recovery, inline edit, delete, comments, time logs | Project and issue CRUD, authorization, drag/reorder |
| Planning and search | Workflow status editing, WQL search and saved filters, board creation and drag, sprint lifecycle | Workflow/board/sprint and WQL endpoints |
| Administration | Team creation, profile update, invitation form, core/admin route rendering | Roles, notifications, webhook and plugin suites |
| Plugin gates | Board, sprint, Gantt, calendar, and issue time logs | Project plugin state and tenant installation |

## Findings and resolutions

| ID | Finding | Evidence | Local resolution |
| --- | --- | --- | --- |
| F01 | Existing Playwright files were placeholders that did not form a reusable suite; `@playwright/test` was absent from the web package. | Baseline browser run failed on missing form selectors and cross-test state. | Replaced them with isolated, disposable local fixtures and behavior assertions; added package dependency, command, config, traces, and instructions. |
| F02 | A second user could not join the same organization. Registration always made a new organization. | Invitation flow test failed with `404` at `/users/invitations`. | Added administrator-created, email-bound, seven-day invitations. Tokens are stored as hashes, accepted once in a transaction, and support both new and existing accounts. Added a Users form and join page. |
| F03 | Reading project plugins after disabling all of them silently restored all defaults. | Regression test received five plugin rows after disabling five. | Defaults remain seeded only when a project is created; reads no longer write plugin state. |
| F04 | Board, sprint, Gantt, calendar, and issue time logs ignored tenant plugin installation when opened directly. | Browser tests reached feature pages before installation. | A shared feature gate now checks both tenant installation/enabled state and project enabled state. |
| F05 | A board drag appeared to move an issue but returned it to the old status on reload. | No status `PATCH` was sent; the drag handler compared the optimistic issue against itself. | Compare against the persisted query result and save the new status. Regression verifies the move after reload. |
| F06 | Project name and project member controls had labels that were not associated with inputs. | Browser label locators could not find their controls. | Added matching label `htmlFor` and input `id` values. |
| F07 | Registering with mixed-case email then signing in with lowercase email failed. | Local browser login remained on `/login`. | Normalize email input and perform case-insensitive lookup for existing accounts. |
| F08 | A full browser run exceeded the deliberate 30-per-minute unauthenticated rate limit during synthetic account setup. | Later registrations returned `429`; isolated scenarios passed. | The local fixture honors `retryAfter`, with a bounded retry and extended test timeout. Product rate limits remain active. |
| F09 | Two delete icons had weak idle contrast. | Design hook flagged gray text with a red hover background. | Icons now use a consistent red foreground; no ignore was added. |
| F10 | An existing account could accept an invitation to a second organization but a later sign-in returned to its first organization with no way to select the invited one. | Browser regression timed out waiting for an organization switch option after a successful sign-in. | Added a membership-checked organization list and switch endpoint and an account-menu switcher. Switching refreshes cookies, clears client data, and reloads the app. The browser test verifies both directions, project visibility, and changed permissions. |
| F11 | The browser did not refresh an expired access cookie for protected `/auth` operations, including organization switching. | A browser regression cleared only the access cookie while retaining a valid refresh cookie; switching stayed in the first organization. | The API client now retries protected auth operations after refreshing the session. Public login, registration, invitation, refresh, and logout actions retain their existing behavior. |
| F12 | The read-only deployment schema planner omitted the new invitation entity. | Its public entity list did not include `OrganizationInvitationEntity`. | Added the entity and confirmed an empty diff after schema creation in a disposable database. |
| F13 | The production Docker build stopped at plugin verification. | Plain Node could not load the SDK's TypeScript source import under the image runtime, although the workspace build passed. | Run the verifier with the API's existing `tsx` runtime. It passed for all 15 plugin bundles, and the API, worker, and web images then built successfully. |

## Remaining pilot gates and limits

1. **Deployment gate:** The new public `organization_invitations` table requires [the SQL migration](../../../packages/db/migrations/20261014_organization_invitations.sql) before deploying the invitation endpoints where schema synchronization is disabled. It has not been applied outside the disposable local database.
2. **Live acceptance:** Local code and tests do not establish that the current live instance contains these fixes. The live instance was not modified or acceptance-tested with accounts.
3. **Invitation delivery:** Administrators copy a private invitation link from Users and share it themselves. Automated invitation email delivery is not implemented.
4. **Coverage limits:** Browser tests do not yet exercise file uploads with the deployed object store, outbound email, third-party plugin integrations, import/export with representative files, or cross-browser rendering. The existing API suite covers related server paths with its local configuration.
5. **Repeated test runs:** Reusing one disposable database across several full browser runs accumulated 92 test organizations; PostgreSQL then hit its 100-client cap and six registration attempts returned 500. The database log confirmed `too many clients already`. A full run on fresh disposable services passed 32/32. The runbook now requires a fresh stack for each full run. Connection pool behavior under many organizations remains a scale follow-up; the one-organization pilot did not reproduce this failure.

The local pilot path is: create the organization, create the project, create and privately share a member invitation, have the member accept it, then add that member to the private project in Project Settings. Public projects remain accessible to all organization members according to existing access rules.
