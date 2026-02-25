# Audit Log

> Tenant-level audit trail of all significant actions: who did what, when, from where.

## Why
Enterprise customers require audit logs for compliance (SOC2, ISO 27001). Even without compliance needs, admins need visibility into who changed permissions, deleted projects, or modified workflows.

## Current State
- Activity log exists at issue level (field changes on issues)
- No tenant-wide audit trail
- No logging of admin actions (role changes, user management, plugin install/uninstall)

## Tasks

### Backend
- [ ] **Create AuditLogEntity** — Tenant-scoped entity: id, userId, action (string), resource (string: 'project', 'issue', 'role', 'user', 'plugin', 'workflow', 'webhook'), resourceId (string), metadata (JSONB: details of the change), ipAddress (string), userAgent (string), createdAt. _Files: `packages/db/src/entities/tenant/audit-log.entity.ts`_
- [ ] **Audit log service** — `log(userId, action, resource, resourceId, metadata, req)`. Extract IP and user agent from request. _Files: `apps/api/src/modules/audit/audit.service.ts`, `apps/api/src/modules/audit/audit.module.ts`_
- [ ] **Audit interceptor** — NestJS interceptor that automatically logs write operations (POST, PATCH, DELETE) on configured controllers. Captures before/after state for updates. _Files: `apps/api/src/modules/audit/audit.interceptor.ts`_
- [ ] **Wire to critical controllers** — Add audit logging to: roles, users (role change), projects (create/delete), plugins (install/uninstall/enable/disable), workflows (create/update/delete), webhooks, settings, automations. _Files: multiple controllers_
- [ ] **Audit log query endpoint** — `GET /audit-log`. Supports filtering: by user, by resource type, by action, by date range. Paginated. Admin only. _Files: `apps/api/src/modules/audit/audit.controller.ts`_
- [ ] **Retention policy** — Auto-delete audit entries older than configurable period (default 90 days). BullMQ scheduled job. _Files: `apps/api/src/modules/audit/audit.service.ts`_
- [ ] **Export** — `GET /audit-log/export` returns CSV download. _Files: `apps/api/src/modules/audit/audit.controller.ts`_

### Frontend
- [ ] **Audit log page** — Route: `/admin/audit-log` (admin only). Table: timestamp, user, action, resource, details (expandable). _Files: `apps/web/src/features/admin/AuditLogPage.tsx`_
- [ ] **Filters** — Dropdowns: user, resource type, action, date range picker. _Files: `apps/web/src/features/admin/AuditLogPage.tsx`_
- [ ] **Export button** — Downloads CSV. _Files: `apps/web/src/features/admin/AuditLogPage.tsx`_
- [ ] **Add to admin nav** — "Audit Log" link in admin sidebar. _Files: `apps/web/src/layouts/AppLayout.tsx`_

### Tests
- [ ] **E2E: audit entry created** — Create project, verify audit entry with action='project.created'. _File: `apps/api/test/audit-log.e2e-spec.ts`_
- [ ] **E2E: audit log query** — Create multiple entries, filter by resource='project', verify only project entries returned. _File: `apps/api/test/audit-log.e2e-spec.ts`_
- [ ] **E2E: admin only** — Viewer/member cannot access GET /audit-log (403). _File: `apps/api/test/audit-log.e2e-spec.ts`_
- [ ] **E2E: export CSV** — GET /audit-log/export returns CSV with headers. _File: `apps/api/test/audit-log.e2e-spec.ts`_

## Acceptance Criteria
- All admin actions logged (role changes, plugin install, project delete, etc.)
- Audit entries include user, IP, timestamp, action details
- Admin can view, filter, and search audit log
- CSV export available
- Auto-retention cleans old entries
- Only admin can access audit log
- Interceptor captures before/after state for updates

## Dependencies
- None
