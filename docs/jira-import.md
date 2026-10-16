# Jira imports and deferred invitations

An administrator starts an import at **Settings > Import / Export**. Select the source projects, review the read-only preview, then start the background job. The API, worker, Redis, database and attachment storage must be available. Configure `IMPORT_CREDENTIAL_KEY` consistently on API and worker, and set `WEB_APP_URL` to the browser application's actual origin.

Run both API and worker with `TZ=UTC`, including host-based pilot processes. The Compose deployment already sets this. Source timestamps must be interpreted consistently when stored in timestamp columns without a timezone.

For a smaller trial, set **Issues updated since** when choosing projects. The date selects issues, including older issues with recent activity. Each selected issue retains its complete readable comments, files and history. Preview and the import report identify the date window. This is a partial project sample; links to excluded issues remain in the source data. A partial reimport cannot re-establish visibility for previously imported issues omitted by the date window, so those projects remain administrator-only until a full readable pass.

## People and access

Imported people are tenant-local attribution identities identified by Jira instance plus account ID (or Server user key). Private or missing email addresses do not change authorship. Import does not create authentication accounts, memberships, invitations, mail jobs, notification records or domain events. It does not match existing accounts by email. New SSO users cannot automatically join an organization after its first import has started.

Imported projects begin private with only the requesting administrator as a project member. Owners and administrators can review restricted content. Source roles and groups begin with an empty mapped audience. Choose active Weaver members explicitly under **Restricted audiences** to let them read that audience's comments and worklogs, subject to their project access. An invitation does not automatically add someone to a restricted audience. Unknown, conflicting, missing-parent or cyclic restrictions remain administrator-only.

Under **Imported people and restricted audiences**:

1. Select the people to invite. Supply or verify each email address.
2. Choose viewer or member access. Review the listed source projects for every recipient.
3. Review the recipients, roles and projects, then explicitly create private invitation links or send email invitations. Link creation is the default and sends no mail. SMTP is required for email delivery.
4. Recipients accept within seven days. Acceptance verifies an existing account's password or signed-in identity, or creates a new account. Only then are organization and selected project memberships created. Existing memberships keep their roles. Historical notifications are never replayed.

Invitation secrets are stored as hashes. Tokens are single use, expire after seven days and can be revoked. Creating a replacement invalidates the previous token. Failed mail delivery invalidates that token. Imported authorship, assignments, attachment uploaders, worklogs, project leads and structured mentions are linked to the verified account on acceptance. App/system and unidentified source actors cannot be invited.

### Imported file access

Jira applies comment restrictions to files added inside private comments. Its general attachment metadata does not establish a safe equivalent destination audience. Imported files therefore begin administrator-only, including files from older imports. After the final test import, open an issue's **Attachments** tab and use **Review file access** to choose a verified source audience or all project readers, then explicitly apply that choice. List, download and delete checks enforce the file's audience. Every reimport resets imported file access to administrator-only for another review. [Atlassian attachment permissions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/).

## What is preserved

| Data                                                                                        | Destination                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Issues, source keys, dates, labels, priorities, status categories and story points          | Native issues, with original payload retained                                                                                  |
| Reporter, assignee, creator, comment authors/editors, attachment authors and history actors | Stable source identities; creator/editor details also remain in source records                                                 |
| Comments, restrictions, replies and timestamps                                              | Native read-only imported comments, with original rich content retained                                                        |
| Attachments                                                                                 | Native storage, source author, size validation and SHA-256; administrator-only until explicit file access review               |
| Worklogs                                                                                    | Exact seconds and original notes in Jira data; unrestricted entries also become locked native time entries, rounded to minutes |
| Parent/subtask and epic relationships, rank and issue links                                 | Native mappings where both ends are available; original relationships retained                                                 |
| Boards, column/status groups, sprints and issue types                                       | Native structures plus original configuration                                                                                  |
| Custom field IDs, names, schemas and issue values                                           | Stable source-specific field keys plus full source payloads                                                                    |
| Versions, components, resolution, estimates and creator                                     | Issue metadata and the Jira data tab; complete source records retained                                                         |
| Change history and remote links                                                             | Jira data tab and complete source records                                                                                      |
| Board filters/subqueries and source workflow statuses                                       | Administrator source records and explicit review warnings                                                                      |

Source records are tenant-scoped and available only through administrator import endpoints. `GET /import/resources?jobId=<id>&page=1` returns up to 100 records per page. They contain source data, including restricted content, and must remain protected in backups and exports.

## Reimports and incomplete data

Source IDs prevent duplicate issues, comments and attachments. Reimports refresh source-managed data. Editable issue fields are compared with the previous imported snapshot: a local change is retained and reported as a conflict. Legacy imports receive attribution repair and a fresh visibility check; their imported comments are quarantined during the additive migration until reimport verifies visibility.

The schema migration runs atomically under a tenant-specific PostgreSQL advisory lock, including legacy visibility quarantine. Concurrent API or worker startup cannot race to create the same import tables. Reimports read stored attachment bytes and verify their SHA-256 against the archived checksum. Legacy files without a checksum are compared with a fresh source download before being trusted. Missing or changed files produce review errors; conflicting local bytes are retained for investigation.

The importer marks an affected project administrator-only while checking source visibility. Failed issue/comment/worklog requests, unavailable previously imported issues and Jira issue security levels keep it quarantined. A successful complete readable pass clears quarantine. Secured issues are retained only in the administrator archive; an existing native copy stays inaccessible to other members. Previously imported comments that disappear from the Jira response become administrator-only. Restore Jira access and reimport to verify them again.

Errors, conflicts and fidelity warnings produce **needs review**, rather than a successful completion. The report identifies resource counts, restricted counts and incomplete items. Cancelled or failed jobs retain their imported records. Runs in the same organization are serialized by the worker. Invitations are blocked while an import is queued or running.

### Limits requiring review

- Only data visible to the supplied Jira account can be discovered. Preview comment/worklog counts use Jira issue metadata; the worker fetches their full paginated collections and checks returned totals when available. A source that changes during import can require another pass.
- Jira transition permissions, validators and conditions are not reproduced. New imported workflows do not receive fabricated transitions. Configure and test destination transitions before using status changes. Older imported workflow rules require manual review.
- JQL board filters and subqueries are retained as metadata and are not executed by Weaver. Review the destination board's visible issue set.
- Complex ADF, app fields, attachment placement, custom link semantics and field configuration may need destination equivalents. Original JSON remains available. Inline Jira media references are represented as attachment references, rather than a pixel-identical rendering.
- Restricted worklogs are excluded from ordinary native time reports. They remain available only in the Jira data view to the mapped audience or administrators. Native time entries have minute precision; the source archive retains exact seconds.
- This is a migration and repeat-import workflow, not a continuous two-way synchronization. Source deletions do not automatically delete destination issues, files or archived records. Missing source issues keep a project quarantined pending review. Source records retain the latest observed payload per resource; they are not a versioned backup of every run.

## Trial import acceptance and recovery

Use a disposable private organization for the first trial, with outbound SMTP disabled. Before importing into an organization with valuable data, take a restorable database backup covering public identity/membership tables and the tenant schema, plus an attachment-storage backup. Record the source URL, account permissions, selected projects and import job ID. A repeat import can update existing records, so deleting a job is not a rollback.

Compare source-visible issue counts, statuses and board columns with the selected Jira projects, including saved filters and subqueries. Sample an issue with restricted comments and replies, multiple authors, worklogs, components and releases. Also check an issue whose reporter has no visible email, structured mentions, attachment authors and history. Fetch current Jira totals for acceptance.

Before inviting anyone, check as an administrator and a separate viewer: unmapped internal comments and replies are absent for the viewer; mapping the internal audience reveals only the intended content. Check worklog seconds, hierarchy, source links and report warnings. Confirm imported files are initially absent from the viewer attachment list and direct downloads fail. Explicitly review one file for the internal audience, map the viewer to that audience, verify access, then revoke the mapping and verify both list and download are denied again. Repeat the import, verify no duplicates, and verify a deliberate destination edit is retained. Confirm there are no imported authentication accounts, memberships, notifications or mail deliveries.

After reviewing the pilot, test one invitation with an address you control. Check that creating its link grants no access, acceptance grants exactly the reviewed memberships, internal audiences still require separate mapping, and revoke/expiry/reuse fail correctly. Invite real users only through an explicit recipient review.

For a disposable pilot, discard the entire trial organization and its storage through the normal reviewed administration process. For an existing organization, stop imports and restore the coordinated database/storage backup after reviewing the affected identities and memberships. There is no automatic per-job destructive rollback endpoint.

## Automated verification

- `pnpm build`
- `pnpm lint` (warnings are reported separately from errors)
- `pnpm --filter @weaver/api test -- --runInBand`
- `pnpm --filter @weaver/web test`
- `pnpm --filter @weaver/worker test`
- `pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js --runInBand jira-import.e2e-spec.ts`

### Database and runtime integration suite

Use dedicated disposable PostgreSQL and Redis services. These commands bind them to loopback on the fixture's fixed ports; do not point the suite at an existing environment. The password below is a test fixture value.

```sh
docker run --rm -d --name weaver-jira-test-postgres -p 127.0.0.1:55439:5432 -e POSTGRES_USER=weaver -e POSTGRES_PASSWORD=weaver_import_test -e POSTGRES_DB=weaver_e2e_jira_import postgres:16-alpine
docker run --rm -d --name weaver-jira-test-redis -p 127.0.0.1:55440:6379 redis:7-alpine
docker exec weaver-jira-test-postgres pg_isready -U weaver -d weaver_e2e_jira_import
WEAVER_IMPORT_TEST_DB=1 WEAVER_IMPORT_DATABASE=weaver_e2e_jira_import pnpm --filter @weaver/api exec jest --config test/jest-jira.config.cjs --runInBand --coverage
docker stop weaver-jira-test-postgres weaver-jira-test-redis
```

Wait for `pg_isready` to report ready before running Jest. The suite refuses a database name outside `weaver_e2e_...`, forces local attachment storage, and uses generated tenant schemas and temporary directories. Run only one copy against these services at a time because its real worker consumes the `jira-import` Redis queue.

The suite exercises Nest HTTP controllers, JWT authentication, tenant middleware and permission guards, encrypted job payloads, BullMQ/Redis, the actual worker processor, PostgreSQL repositories, local attachment storage, invitation acceptance and Nodemailer delivery into a loopback SMTP sink. Jira HTTP responses are synthetic. SMTP cannot deliver outside the local sink. API key authentication, unrelated comment events and websocket delivery are outside this harness.

### Verification of the reconciled branch

The dedicated `jira-import` CI job runs both database/runtime suites with disposable services. The ordinary API E2E job does not enable these suites. Build and Docker checks depend on both jobs passing.

The integration suite covers restricted comments and inherited replies, audience mapping/revocation, direct file downloads, cross-tenant requests, stale administrator tokens, explicit invitation delivery and concurrent single-use acceptance. It also checks failed source requests, secured or disappearing issues, local edit preservation, cancellation/retry, concurrent jobs, tampered tenant payloads, concurrent legacy migrations, and damaged or missing stored files.

Jira responses and attachment bytes are synthetic. These tests do not establish real Jira network throughput, large-file performance, live customer acceptance or a coordinated backup restoration. Review the PR checks for the current revision's results.

## Jira API references

Visibility checks follow the source role/group restrictions documented for [comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/) and [worklogs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/). Imported identities use source account IDs because source profile data can omit email. Original source JSON is retained to support manual fidelity review.
