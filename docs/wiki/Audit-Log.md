# Review the audit log

Open **Administration → Audit Log** to review recorded administrative changes. Filter to a person, resource, action, or date range, then expand an entry to inspect its details. The audit log is available to administrators.

## Find a change

Start with the narrowest fact you know: the resource, the person, or the approximate time. Combine filters to reduce the result set. Entries show the timestamp, actor, action, resource, and captured details.

The audit log is different from an issue's **Logs** tab. Issue activity explains changes to that piece of work. The administrative audit covers instrumented operations such as projects, roles, users, workflows, plugins, webhooks, settings, and the start or cancellation of a Jira import. When a member resets a forgotten password, each of their organizations records a **User Password Reset** entry.

![Administrative audit entries from the fictional workspace](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/audit-log.png)

*Example entries record project creation and plugin installation. Each row can be expanded for details.*

## Export a useful slice

Set filters before choosing **Export CSV**. Check the resulting file's date range and row count before using it for a review. Exported logs can contain identities, network information, and change details, so store and share them according to your organization's rules.

Retention defaults to **90 days** and can be configured by the operator. Export has a default limit of **50,000 rows**. If you need a longer history, arrange that before records age out. A filtered export is not automatically a complete all-time archive.

## Interpret the evidence carefully

An entry records what the instrumented application operation captured. Absence of an entry is not proof that nothing changed: direct database maintenance or an uninstrumented path may not appear. This log is not presented as immutable storage or a compliance certification.

If the view is empty, clear filters, check the time range, and confirm you are in the intended organization. If a specific expected action is absent, ask an operator to inspect that operation and its logging path.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

`GET /audit-log` returns paginated entries. `GET /audit-log/export` returns CSV using the same filter concepts. The controller requires authenticated administrative access.

Audit metadata can include before/after state for operations configured to capture it, as well as IP address and user agent. Coverage is opt-in through the audit decorator/interceptor and service calls; adding a new write endpoint does not make it audited automatically.

The pilot release excludes the full API key from captured after-state and sanitizes recorded delete request bodies. CSV export prefixes cells that could be interpreted as spreadsheet formulas. These safeguards do not make an exported log suitable for unrestricted sharing.

Retention is controlled by `AUDIT_LOG_RETENTION_DAYS` (default 90) and `AUDIT_LOG_RETENTION_CRON` (default `0 3 * * *`). Export size uses `AUDIT_LOG_EXPORT_LIMIT` (default 50000). The API initializes the retention queue and worker, so Redis availability affects cleanup.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/admin/AuditLogPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/admin/AuditLogPage.tsx)
- [apps/api/src/modules/audit/audit.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/audit/audit.controller.ts)
- [apps/api/src/modules/audit/audit.interceptor.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/audit/audit.interceptor.ts)
- [apps/api/src/modules/audit/audit.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/audit/audit.service.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [audit interceptor](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/audit/audit.interceptor.ts), [audit service](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/audit/audit.service.ts), [import controller](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/import/import.controller.ts).
