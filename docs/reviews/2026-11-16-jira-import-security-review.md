# Local Jira import security review

November 16, 2026. Reviewed the uncommitted working tree on `f0d7cae`. **Not ready to commit as complete: five confirmed findings, including two restricted-data disclosure paths.** The earlier passing tests did not exercise these paths.

No implementation fixes were made during this review. No commit, push, deployment, EPD reimport, real invitation, or external email occurred. Review fixtures used a separate local database, Redis, and a mocked mail transport.

## Remediation follow-up

All five findings were fixed locally after this review. See [the remediation and repeat-review report](2026-11-16-jira-import-security-remediation.md) for the changes, regression results, and remaining rollout limits. The original findings below are retained as historical evidence.

## Findings

### R1: P1. Jira remote-link titles survive restricted-reference redaction

- Owning code: `apps/api/src/core/tenant/issue-reference-redaction.ts:40–49`; producer: `apps/api/src/modules/import/import-source.controller.ts:79–85`.
- A readable imported issue can have a Jira remote link to a restricted issue. The source-details endpoint returns the link as `{ id, title, url }`. The redactor masks the URL containing the restricted key, but recursively retains the sibling title because this object has no native issue ID/key or rich-text node type.
- **Reproduced through HTTP:** the viewer received 404 for the target issue, but GET on the readable issue's `/jira` endpoint returned `title: "Confidential payroll acquisition"` with `url: "[Restricted issue reference]"`.
- Required fix: authorize/redact the entire referenced object, including its label, before returning it. Cover Jira remote links and other structured references, rather than relying on independent string replacements.

### R2: P1. Bundled plugin responses bypass reference redaction

- Owning code: `apps/api/src/core/tenant/issue-reference.interceptor.ts:18–24`; response boundary: `apps/api/src/plugins/plugin-route.controller.ts:152–160`.
- Plugin routes call `res.json`/`res.send` before the interceptor runs. Its `headersSent` bypass is necessary for completed download streams, but also skips every plugin response. Filtering the primary checklist/report issue does not remove restricted references embedded in that readable issue's content.
- **Reproduced through HTTP:** a viewer reading the bundled checklist route on a visible issue received `Depends on OPEN-4: Restricted takeover target`, although OPEN-4 was quarantined and inaccessible. No custom or malicious plugin was involved.
- Required fix: apply the reference boundary before serializing bundled plugin responses. Structured JSON and CSV/export output need intentional handling; do not try to redact an already-sent Express response.

### R3: P1. Standard issue-notification email is silently discarded

- Owning code: `apps/worker/src/processors/notifications.processor.ts:171–178`.
- The new check scans the entire rendered HTML with an issue-key regex. Standard templates contain `<meta charset='utf-8' />`, which becomes an alleged issue key `utf-8`. The fresh permission lookup returns false for that nonexistent issue, so the processor returns without sending and without failing/retrying the job.
- **Reproduced using actual comment rendering and the worker processor:** the primary issue check passed, the next check was `utf-8` and failed, and the mocked transport recorded zero sends for an ordinary authorized comment email. Assignment, mention and status-change templates contain the same charset declaration. Account-email processing uses a separate path and is not implicated by this finding.
- Required fix: carry structured issue references into queued mail, then authorize those references at send time. Do not infer issue identity from HTML markup.
- Related remediation constraint: the comment excerpt currently strips rich-text link targets while retaining their text. The fixture showed a restricted link title surviving into the queued email body even though the HTTP comment response redacted it. Current delivery was blocked by the charset bug, so this is **not a confirmed delivered-email leak**. Fixing R3 must preserve/redact reference metadata before flattening the rich text, rather than merely excluding `utf-8` from the regex.

### R4: P2. Authenticated plugin operations lose their principal and can partially succeed

- Owning code: `apps/api/src/plugins/plugin-context.factory.ts:236–258`, `apps/api/src/core/tenant/issue-visibility.ts:17–27`.
- `PermissionGuard` populates `tenant.actor`, but plugin routes use `PluginRouteAuthGuard`, which only authenticates the request. The SDK's explicit initial access check succeeds, but calls into `IssuesService` and time-entry services use an absent ambient actor. The new SQL predicate then treats the request as anonymous and hides private-project issues, including from their owner.
- **Reproduced through HTTP:** with checklist `syncDoneRatio` enabled, the organization owner added an item to their private issue. The item was inserted, but percentage synchronization returned `404 Issue "AUTH-1" not found`; SQL confirmed one persisted item after the failed response. A user retry can create duplicate items. Other plugin time/issue operations using the ambient predicate have the same missing-principal boundary.
- Required fix: pass the resolved principal explicitly or establish it consistently for plugin operations, and make dependent writes atomic. Add authorized private-project and mapped-issue plugin tests, not only denied-access tests.

### R5: P2. UUID fragments suppress ordinary events and webhooks

- Owning code: `packages/server-common/src/issue-delivery.ts:59–81`; consumer: `apps/api/src/modules/events/event-dispatcher.service.ts:53–61`.
- The broad-event check scans every string field as issue-key text, including actor/project/issue UUIDs. For the valid UUID `aaaaaaaa-1234-4123-8123-123456789012`, it invents the issue key `aaaaaaaa-1234`. Since that issue does not exist, an otherwise unrestricted event is marked restricted.
- **Reproduced against the real fixture database:** an event for the unrestricted AUTH-1 issue with that actor ID returned `blocked: true`. A direct trace showed the query searching for `AUTH-1` and `aaaaaaaa-1234`. This can suppress domain automation, bundled plugin event handlers and webhooks independently of actual issue security.
- Required fix: distinguish typed identifiers from content references. Validate explicit issue-ID/key fields and structured rich-text links; ordinary UUID fields must not be scanned as ticket keys.

## Verification and scope

A temporary E2E suite reused the existing full-application authorization fixtures and added five adversarial cases. Final result: **19 existing tests passed; all five new expected-behavior assertions failed**, matching R1 through R5. Tests executed the current application, actual PostgreSQL queries, bundled checklist handlers, actual mail rendering and the worker's authorization code. Mail delivery was replaced with a recorder; nothing was sent externally.

Command used:

```sh
WEAVER_E2E_DATABASE=weaver_e2e_jira_review \
WEAVER_E2E_DATABASE_PASSWORD=weaver_review_test \
WEAVER_E2E_DATABASE_PORT=55449 WEAVER_E2E_REDIS_PORT=55450 \
STORAGE_DRIVER=local STORAGE_LOCAL_PATH=/private/tmp/weaver-jira-review-files \
ATTACHMENT_STORAGE_DIR=/private/tmp/weaver-jira-review-files \
SMTP_HOST= SMTP_USER= SMTP_PASS= \
  pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js --runInBand \
  test/jira-local-review.e2e-spec.ts --testTimeout=60000
```

Evidence:

- Log: `/private/tmp/weaver-jira-review-e2e.log`.
- Preserved reproduction suite: `/private/tmp/weaver-jira-local-review.e2e-spec.ts`. Copy it to `apps/api/test/jira-local-review.e2e-spec.ts` to repeat the command; the temporary copy was removed from the repository after review.
- The disposable containers `weaver-jira-review-postgres-20261116` and `weaver-jira-review-redis-20261116` were stopped after testing and retained for reruns.

Direct issue access, list/search filtering, child-route denial, API-key mapping/revocation and stale mapping-review checks continued to pass in these fixtures. This review also traced storage transfer/recovery and quarantine behavior, but did not rerun the complete earlier 512 MiB/storage matrix or all repository tests. These results are not a claim of exhaustive security coverage or full CI success.

Keep native secured imports disabled. The importer flag does not disable the new event/email predicates or plugin service changes, so the functional regressions matter even while that flag remains off. Fix the five findings, retain the negative tests, and repeat the disclosure matrix before considering the feature ready.
