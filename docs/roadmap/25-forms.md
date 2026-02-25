# Forms (External Intake)

> Public forms that create issues without authentication — for bug reports, feature requests, and support tickets.

## Why
Teams need external intake: customers report bugs, users request features. Without forms, every issue must be manually entered. Jira, ClickUp, and Monday all have this.

## Current State
- Public project endpoints exist (unauthenticated)
- Issue creation requires authentication
- No form entity or builder

## Tasks

### Backend
- [ ] **Create FormEntity** — Fields: id, projectId, name, slug (unique), description, fields (JSONB array of field definitions), issueDefaults (JSONB: default issueTypeId, priority, labels), active (boolean), createdBy, createdAt. _Files: `packages/db/src/entities/tenant/form.entity.ts`_
- [ ] **Form CRUD endpoints** — `POST/GET/PATCH/DELETE /projects/:key/forms`. Requires `projects.update` permission. _Files: `apps/api/src/modules/forms/forms.controller.ts`, `apps/api/src/modules/forms/forms.service.ts`, `apps/api/src/modules/forms/forms.module.ts`_
- [ ] **Public form submission endpoint** — `POST /public/:tenantSlug/forms/:formSlug/submit`. No auth required. Validates submission against form field definitions. Creates issue with submitted data + defaults. Rate limited (10/min per IP). _Files: `apps/api/src/modules/forms/public-form.controller.ts`_
- [ ] **Public form data endpoint** — `GET /public/:tenantSlug/forms/:formSlug`. Returns form title, description, fields (for rendering). No auth required. _Files: `apps/api/src/modules/forms/public-form.controller.ts`_
- [ ] **Spam protection** — Honeypot field + optional reCAPTCHA integration. _Files: `apps/api/src/modules/forms/public-form.controller.ts`_
- [ ] **Submission notification** — Notify project lead when form submitted (in-app + email). _Files: `apps/api/src/modules/forms/forms.service.ts`_

### Frontend
- [ ] **Form builder page** — Route: `/projects/:projectKey/settings` forms tab. List existing forms. Builder: add/remove fields (text, textarea, select, email), set labels, required flag, map to issue fields. Set defaults (type, priority, labels). _Files: `apps/web/src/features/forms/FormBuilder.tsx`_
- [ ] **Public form page** — Route: `/public/:tenantSlug/forms/:formSlug`. Renders form fields. Submit button. Success/error message. Weaver branding footer. _Files: `apps/web/src/features/forms/PublicForm.tsx`_
- [ ] **Form share dialog** — Copy public URL. Embed code (iframe). QR code. _Files: `apps/web/src/features/forms/FormShareDialog.tsx`_
- [ ] **Form submissions list** — In project settings, show recent submissions with link to created issue. _Files: `apps/web/src/features/forms/SubmissionsList.tsx`_

### Tests
- [ ] **E2E: form CRUD** — Create form, verify GET returns it. Update, delete. _File: `apps/api/test/forms.e2e-spec.ts`_
- [ ] **E2E: public submission** — Submit form data to public endpoint, verify issue created with correct fields. _File: `apps/api/test/forms.e2e-spec.ts`_
- [ ] **E2E: rate limiting** — Submit 11 times rapidly, expect 429 on 11th. _File: `apps/api/test/forms.e2e-spec.ts`_
- [ ] **E2E: inactive form** — Disable form, submit, expect 404 or 410. _File: `apps/api/test/forms.e2e-spec.ts`_

## Acceptance Criteria
- Admin can create forms with custom fields
- Forms have shareable public URL
- Public submission creates issue (no login required)
- Rate limiting prevents abuse
- Spam protection (honeypot)
- Form can set issue defaults (type, priority, labels)
- Submissions show in project settings
- Inactive forms reject submissions

## Dependencies
- None
