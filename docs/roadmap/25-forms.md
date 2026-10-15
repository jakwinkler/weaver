# Forms (External Intake)

**Status: Implemented.** Public intake forms can create issues using configured fields and defaults.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Intake Forms](https://github.com/jakwinkler/weaver/wiki/Intake-Forms).

## Implemented

- [x] Form CRUD, field/default validation, authenticated management, and public data/submission endpoints.
- [x] Field mapping, active-state checks, honeypot, per-IP limit, and optional reCAPTCHA.
- [x] Lead notification paths, form builder, public rendering, success/error receipt, and submission list.
- [x] Sharing UI for a URL, iframe embed code, and QR code.

## Differences from the original plan

- The form entity, builder, and public creation path are implemented.
- Public submission does not give the submitter authenticated project access. The lead/form creator supplies the server-side reporter context.
- CAPTCHA and email receipt need configured external services; source support is not delivery proof.

## Remaining work and verification

- [ ] Verify configured CAPTCHA, actual lead email delivery, and embedded form behavior under deployment headers.
- [ ] Repeat management permissions, disabled forms, rate limiting, and submission mapping with representative fields.

## Evidence

A fictional public request was submitted in the browser; the success receipt and resulting WEB-13 issue were verified locally. External CAPTCHA/email were not exercised.

### Implementation

- [apps/api/src/modules/forms/forms.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/forms/forms.service.ts)
- [apps/api/src/modules/forms/public-form.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/forms/public-form.controller.ts)
- [apps/web/src/features/forms/FormBuilder.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/forms/FormBuilder.tsx)
- [apps/web/src/features/forms/FormShareDialog.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/forms/FormShareDialog.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/forms.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/forms.e2e-spec.ts)

## Dependencies

- None
