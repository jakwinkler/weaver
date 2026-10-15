# Collect work with an intake form

An intake form lets someone submit a request without a Weaver account. Each successful submission creates an issue in the chosen project. Share the form's public URL when you want outside input without giving people access to the project itself.

## Build the form

Open **Project Settings → Forms** and create a form. Give it a name, a URL slug, and a short explanation of what people should submit.

Add text, long-text, select, or email fields. For each field, choose a label, whether it is required, and where the answer goes. Map one field to the issue summary. Map the longer explanation to description, and use labels or a custom-field key when appropriate.

Set issue defaults such as type, priority, and labels. These defaults help the team recognize new requests. Leave the form active when ready to receive submissions.

## Test before sharing

Open the share URL and submit a fictional request. Confirm the success message, then check the project's issue list and form submissions list. Make sure the summary, description, defaults, and any custom values landed where intended.

![A public website request form filled with a fictional request](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/form.png)

*This form created a task called “Add an FAQ to the contact page” in the local example project.*

The share dialog provides a URL, embed code, and a QR code. Opening a form does not require project membership. Embedding also depends on the deployed site's security headers and the destination site's iframe policy; test the actual embedded form before promising that experience.

## Manage incoming work

Review submissions in the Forms area and follow their issue links. The project lead can receive an in-app notification and, when configured, email. A submission receipt does not mean an email was delivered.

Disable the form when you want to stop accepting requests. An inactive form cannot be used for a new public submission. Treat the public URL as a public entry point: ask only for information the team needs, and avoid inviting people to submit passwords or other secrets.

## When a submission fails

Check required fields, select choices, and email formatting. The app applies a submission rate limit and a hidden anti-spam field. If the operator enabled CAPTCHA, it must be configured and working. A temporary CAPTCHA failure can prevent submission even when the rest of the form is correct.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Management routes are `/projects/:projectKey/forms` and child routes by form UUID. Public routes are `GET /public/:tenantSlug/forms/:formSlug` and `POST /public/:tenantSlug/forms/:formSlug/submit`.

A submission body is `{ "values": { "summary": "A request", "details": "Context" } }`, where the keys must match that form's field IDs. The public API returns the form's name, description, fields, and optional CAPTCHA site key. It does not give the submitter general project access.

Schemas allow 1 to 30 fields, require a summary mapping, and support `text`, `textarea`, `select`, and `email`. Non-custom mappings must be unique. The submit route is limited to 10 requests per minute by its rate-limit guard. A filled `website` honeypot is rejected. Optional reCAPTCHA uses `RECAPTCHA_SECRET_KEY` and `RECAPTCHA_SITE_KEY`.

The created issue's reporter is the project lead or form creator, not a newly registered external submitter. Preserve a submitted contact field explicitly if your team needs to reply.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/forms/FormBuilder.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/forms/FormBuilder.tsx)
- [apps/web/src/features/forms/FormShareDialog.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/forms/FormShareDialog.tsx)
- [apps/api/src/modules/forms/forms.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/forms/forms.controller.ts)
- [apps/api/src/modules/forms/public-form.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/forms/public-form.controller.ts)
- [apps/api/src/modules/forms/forms.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/forms/forms.service.ts)
- [packages/shared/src/schemas/index.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/shared/src/schemas/index.ts)
