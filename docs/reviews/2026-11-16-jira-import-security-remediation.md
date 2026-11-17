# Jira import security remediation and repeat review

November 16, 2026. Local uncommitted working tree based on `f0d7cae`.

**All five findings from the [first review](2026-11-16-jira-import-security-review.md) are fixed locally. No remaining blocker was found in the reviewed paths.** This is a scoped local result, not a production verification or a full CI claim.

No commit, push, deployment, EPD reimport, real invitation, or external email was performed. Tests used synthetic tenants in a disposable local PostgreSQL database, a separate local Redis instance, local attachment storage, and a mocked mail transport. Existing unrelated working-tree changes were preserved. The two task-owned review containers were stopped after testing and retained for reruns.

## Fixes and regression evidence

| Finding                                                   | Fix                                                                                                                                                                                                                                            | Verified behavior                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1: remote-link title disclosure                          | Remove the entire link object when its URL/href references an inaccessible issue; handle percent-encoded keys.                                                                                                                                 | A viewer receives 404 for the target and cannot see its title in a readable issue's Jira source details. Safe links remain present.                                                                                                                                                      |
| R2: plugin response disclosure                            | Redact plugin bodies before Express serializes them. Provide SDK reference redaction so time reports sanitize structured rows before CSV formatting.                                                                                           | Bundled checklist responses and CSV exports hide restricted references and titles. CSV headers and readable issue rows remain usable.                                                                                                                                                    |
| R3: ordinary email suppressed by HTML markup              | Collect issue references from template context before rendering, retain original comment rich text before generating an excerpt, and put versioned references in the queue job. Check recipient access both before enqueue and before sending. | Ordinary rendered comment email sends without interpreting `utf-8` as an issue. A hidden linked title prevents enqueue; revoking access to a previously readable linked issue prevents delivery of the queued email. Legacy/malformed metadata and revoked issue IDs fail closed.        |
| R4: plugin operations lose actor and leave partial writes | Bind authenticated plugin handlers and direct SDK service calls to the resolved member. Run interactive mutating plugin handlers in a tenant transaction.                                                                                      | Owners can write to private issues; mapped non-admins can update allowed restricted issues and are denied after revocation. An injected dependent checklist-update exception rolls back the inserted item; retry creates exactly one item. Direct time-entry SDK creation also succeeds. |
| R5: UUID fragments suppress ordinary events               | Separate explicit issue IDs from ordinary identity fields and UUID values before extracting prose/URL keys.                                                                                                                                    | The original actor UUID no longer becomes a phantom issue key. Explicit restricted issue IDs, embedded keys, and unknown references still block broad delivery.                                                                                                                          |

The five original expected-behavior regressions were observed failing before the fixes: **5 failed, 19 passed**. A further direct-SDK regression was observed failing with `Issue "AUTH-1" not found`, then passed after principal binding was extended to that entry point. The final regressions live in `apps/api/test/authorization-security.e2e-spec.ts`, with focused redaction, reference-collection, and worker tests alongside their implementations.

## Verification

| Check                                                                                                                  | Result                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| API unit suite: `pnpm --filter @weaver/api exec jest --runInBand`                                                      | **72 suites, 490 tests passed**                                                                 |
| Authorization, tenant isolation, and API-key integration suites                                                        | **3 suites, 47 tests passed**, including 27 authorization/security cases                        |
| Plugin prerequisites, automatic-time core, automatic-time plugin integration suites                                    | **3 suites, 20 tests passed**                                                                   |
| Worker suite with disposable Redis: `WEAVER_WORKER_TEST_REDIS_PORT=55450 pnpm --filter @weaver/worker exec vitest run` | **7 files, 24 tests passed**, including Redis recovery                                          |
| Shared server suite: `pnpm --filter @weaver/server-common test`                                                        | **12 passed; 1 S3 integration test skipped** because no S3 fixture was configured for this pass |
| API, worker, time-report plugin and dependency builds via Turbo                                                        | **8 build tasks passed**                                                                        |
| API, worker, SDK, server-common and time-report plugin type checks via Turbo                                           | **10 tasks passed**, including dependency builds                                                |
| ESLint on the changed implementation/test files                                                                        | **0 errors, 22 warnings**; no clean-lint claim                                                  |
| `git diff --check`                                                                                                     | Passed                                                                                          |

The integration coverage run executes the actual redactor (100% lines and functions), plugin response controller (100% functions), SQL-backed SDK update path, comment rendering, and mail enqueue path. Whole-file coverage of the broader services is partial. Permission-only controller unit tests mock redaction; they are not the evidence for the disclosure fixes. The HTTP integration tests use the real redactor and real bundled plugin handlers.

The security suites were run with these isolated settings:

```sh
WEAVER_E2E_DATABASE=weaver_e2e_jira_review \
WEAVER_E2E_DATABASE_PASSWORD=weaver_review_test \
WEAVER_E2E_DATABASE_PORT=55449 WEAVER_E2E_REDIS_PORT=55450 \
STORAGE_DRIVER=local STORAGE_LOCAL_PATH=/private/tmp/weaver-jira-review-files \
ATTACHMENT_STORAGE_DIR=/private/tmp/weaver-jira-review-files \
SMTP_HOST= SMTP_USER= SMTP_PASS= \
  pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js --runInBand \
  test/authorization-security.e2e-spec.ts test/tenant-security.e2e-spec.ts \
  test/api-keys.e2e-spec.ts --testTimeout=60000
```

The final run used `/private/tmp/weaver-five-jest-coverage.cjs`, which extends that configuration to include source coverage. Evidence logs are `/private/tmp/weaver-five-red.log`, `/private/tmp/weaver-five-extra-red.log`, `/private/tmp/weaver-five-security-final.log`, `/private/tmp/weaver-five-plugin-final.log`, `/private/tmp/weaver-five-api-final.log`, `/private/tmp/weaver-five-worker-final.log`, `/private/tmp/weaver-five-common-final.log`, `/private/tmp/weaver-five-build.log`, `/private/tmp/weaver-five-typecheck.log`, and `/private/tmp/weaver-five-lint.log`. Coverage output is in `/private/tmp/weaver-five-coverage/`.

## Repeat-review conclusions and rollout limits

The review traced readable-source references through HTTP serialization, plugin JSON/CSV serialization, SQL actor binding, transaction rollback, email rendering and send-time access checks, and event/webhook reference extraction. Direct issue denial, project and issue-policy intersection, attachment denial, search/list filtering, stale mapping rejection, API-key access, and revocation remained covered and passing. No additional confirmed disclosure was found in these checked paths.

- Native secured imports remain disabled by default (`JIRA_IMPORT_ISSUE_SECURITY_ENABLED` requires explicit `true`). This work does not enable the flag.
- **Legacy queued issue emails without versioned reference metadata are intentionally discarded.** Their rendered labels cannot be safely reconstructed into references. API and worker rollout must be coordinated to avoid continuing to enqueue legacy-shaped jobs. Account-email delivery is separate and unchanged.
- Plugin transaction rollback covers database writes using the tenant manager. Public webhook handlers retain their existing idempotency/transaction flow. It does not provide rollback for arbitrary external plugin side effects.
- Restricted-content broad events remain deliberately suppressed; unknown content references also fail closed. Plain content containing ticket-like strings can therefore be conservatively suppressed.
- This pass did not repeat live EPD/Jira access, actual SMTP delivery, browser acceptance, or the earlier full 512 MiB/S3 attachment matrix. Attachment-transfer implementation was not changed by these five fixes. Production rollout and any EPD reimport remain separate approval steps.

## Jira-only commit verification

Before the authorized local commit, the saved pre-implementation baseline was used to separate the Jira changes from unrelated invitation-project selection, attachment previews, editor uploads, and older review artifacts. Six shared files were staged partially. The download controller and its new direct-call test were staged without the separate inline-preview parameter. Working files were left intact.

The exact staged tree was exported to `/private/tmp/weaver-jira-commit/tree` and tested independently of the unrelated edits. Its API, worker, and plugin builds passed (8 tasks); type checks including the web app passed (14 tasks). API unit tests passed (72 suites, 478 tests), authorization/tenant/API-key integration tests passed (40 tests), focused people/security/recovery/sorting UI tests passed (24 tests), worker tests passed (24 tests), and shared server tests passed (12 tests, with the S3 integration test skipped). These counts describe the isolated commit contents; the earlier counts describe the complete working tree. Logs are under `/private/tmp/weaver-jira-commit/`.

No push, deployment, or EPD reimport is included in the commit authorization.
