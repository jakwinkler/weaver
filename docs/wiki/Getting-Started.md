# Your first project

This guide is for the person setting up a new organization and project. If a team invited you to an existing project, use [Weaver for invited clients](https://github.com/jakwinkler/weaver/wiki/For-Invited-Clients).

## 1. Sign in or create a workspace

Use the address your administrator provides. To create a new organization, choose **Create account** from the sign-in screen. Enter your display name, email, password, organization name, and organization slug.

The name is what people read. The slug is a short identifier such as `northstar-studio`; use lowercase letters, numbers, and hyphens. Registration creates a new organization and makes you its owner. To join an existing organization, use a private invitation link from its administrator. Joining the organization and being added to a private project are separate steps.

You can also start with **Continue with Google** or **Continue with GitHub**, on either the sign-in or the registration page. If no Weaver account uses that email yet, Weaver creates one and then asks you to name your organization, which makes you its owner. Don't do this to join a team that already uses Weaver; ask its owner for an invitation instead. The buttons appear only when your installation has set them up. See [OAuth Sign In](https://github.com/jakwinkler/weaver/wiki/OAuth-Sign-In) for Google, GitHub, and organization SSO.

### Forgot your password

Choose **Forgot password?** next to the password field on the sign-in page and enter your email address. Weaver shows the same message whether or not an account uses that address. If one does, you'll get an email with a link that works once and expires after 30 minutes. Asking again cancels the earlier link.

Open the link, choose a new password of 8 to 128 characters, and sign in with it. Changing your password signs you out on every device within 15 minutes, and Weaver emails you to confirm the change. If you sign in only with Google, GitHub, or your organization's single sign-on, your account has no Weaver password; the email explains how to sign in instead.

Weaver has no separate change-password screen yet, so use **Forgot password?** to change a password you still know too.

## 2. Create a project

Open **Projects**, choose **Create Project**, and enter:

| Field | Example | What it means |
| --- | --- | --- |
| Name | Website Launch | The name teammates see |
| Key | WEB | The prefix on issues, such as WEB-1 |
| Description | Plan, build, and launch our website | The project's purpose and scope |

Choose a key with 2 to 10 uppercase letters or numbers, starting with a letter. Treat it as a lasting identifier. Save the project, then open it from the project list or sidebar.

## 3. Create the first issue

Open the project's **Issues** view and choose **Create Issue**, or press `c` while on a project page. Give the issue a specific outcome, such as “Design the homepage.” Add the context and expected result in **Description**. Planning fields are under **More options (optional)**, with question-mark help buttons. Choose **Create**, then open the issue from the list.

Choose a priority when useful. A story-point estimate is optional. Check that the saved summary and description are correct. See [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues) for editing, attachments, and bulk updates.

![An example issue with a description, comment, status, estimate, and assignee](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/issue.png)

*Example: WEB-3 records the homepage work. Optional plugins add Checklist, Relations, and Timer panels, so your issue screen may have fewer panels.*

## 4. Choose a way to work

Use **Issues** for a sortable list. Use **Board** for status columns. Use **Backlog** and **Sprints** when the team plans in time boxes. The same issue can appear in several views; moving or editing it changes the shared record.

If a view is missing, ask an administrator to check both [the installed plugin and project feature settings](https://github.com/jakwinkler/weaver/wiki/Plugins). A missing button can also mean your role cannot perform that action.

## 5. Leave a useful handoff

Add a comment when a decision or result matters to the next person. Use the project **Wiki** for longer material such as launch instructions or a support handbook. Keep an issue focused on one piece of work and link to the longer explanation.

Continue with [Projects and Access](https://github.com/jakwinkler/weaver/wiki/Projects-and-Access) or [Boards and Views](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Registration uses `POST /api/v1/auth/register` with `displayName`, `email`, `password`, `orgName`, and `orgSlug`. Passwords must have 8 to 128 characters. The response establishes the authenticated session and returns the tenant identifier. Registration answers 409 when the email already has an account, so it reveals which addresses are registered.

Password reset has two public routes. `POST /api/v1/auth/password-reset/request` takes `{ "email" }` and always answers 202 with the same message. It replies before looking the address up, so neither the answer nor its timing depends on whether the account exists. `POST /api/v1/auth/password-reset/confirm` takes `{ "token", "password" }`, applies the registration password rule, and answers 200 or a 400 that doesn't say why the link failed. It also clears the browser's session cookies.

A reset link is `/reset-password/<token>`. The token has a 128-bit selector, which finds the row, and a 256-bit verifier. Only the verifier's SHA-256 hash is stored, in `public.password_reset_tokens`, and it is compared in constant time. A link expires after 30 minutes. A new request deletes the account's earlier links, and a successful reset deletes them all. The reset also deletes every refresh session for the account, writes a `user.password_reset` audit entry in each of the account's organizations, and queues a "password changed" email. Access tokens already issued stay valid until they expire, at most 15 minutes. Accounts with no password get an explanation email and no link; a reset never adds a password to them.

Each email address and each client IP address can make 5 reset requests per 15 minutes. Confirm allows 10 attempts per client address and 5 per account in 15 minutes. Over the limit, both routes answer 429, and both answer 503 when Redis is unavailable. The reset page takes the token out of the address bar and history and sets `no-referrer`.

Projects are created with `POST /api/v1/projects`. New projects use the default workflow and receive default project-feature records. Tenant plugin installation is a separate layer. See [Developer Reference](https://github.com/jakwinkler/weaver/wiki/Developer-Reference) for authentication, tenancy, and response conventions.

The October 15, 2026 pilot update adds administrator-created organization invitations at `POST /api/v1/users/invitations`, public invitation lookup and acceptance at `/api/v1/auth/invitations/:token`, and organization switching for existing accounts. Invitation acceptance does not add private project membership. The project owner or administrator adds that separately. The later local inline help implementation adds Description to issue creation, groups optional fields, and makes the description edit action visible. These UI additions extend the linked pilot source baseline and need to be deployed before these updated creation instructions match an installation.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/auth/RegisterPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/auth/RegisterPage.tsx)
- [apps/api/src/core/auth/auth.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/auth.service.ts)
- [packages/shared/src/schemas/index.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/shared/src/schemas/index.ts)
- [apps/api/src/modules/projects/project-plugins.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/projects/project-plugins.service.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [invitation page](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/auth/InvitationPage.tsx), [issue create screen](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/issues/IssueListPage.tsx), and [invitation browser checks](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/invitations.spec.ts).
