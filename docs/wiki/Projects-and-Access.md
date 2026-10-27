# Projects, people, and access

Use a project to group related work and control who can see or change it. Start with a private project, add the people who need it, and enable only the views and plugins the team will use.

## Understand the levels of access

An organization is the workspace you sign into. Projects live inside it. A person's organization role controls broad permissions, while project membership controls access to private project work.

| Role or access | What to expect |
| --- | --- |
| Organization owner/admin | Administrative access across the organization |
| Organization member and project member | Can create issues and comments in that project with the default permissions |
| Organization viewer | Read-oriented access according to configured permissions and project access |
| Project viewer | Read access to that project; cannot create issues or comments there |

Default roles are a starting point. Changing an issue's status needs **issues.transition**, and setting or changing its assignee needs **issues.assign**, in addition to **issues.update**. The default member role has all three. Administrators can configure permissions, so ask your administrator when a teammate's controls differ from yours. Joining the organization alone does not give an ordinary member access to every private project.

For a client who should create issues and reply, an administrator creates a **member** invitation in **Administration → Users** and privately shares its link. After the client joins, add them to the intended private project as a project **member** in **Project Settings → Members**. A viewer invitation or project viewer assignment gives read access instead. The same page lists pending invitations with a **Revoke** button. Inviting the same address again replaces the earlier link. Anyone who has a link can join as that person until it is used, revoked, or expires, so send it privately. [The invited-client guide](https://github.com/jakwinkler/weaver/wiki/For-Invited-Clients) covers the client's side of the process.

## Configure a project

Open the project and choose **Settings**. Set the description, lead, workflow, members, issue types, and enabled features as needed. Give the project lead responsibility for triaging incoming work, especially if the project uses intake forms.

Use the members area to add existing organization members and choose the right project role. A private project should only include the people who need its contents. Change one access setting at a time and verify with the affected role before making a larger change.

## Choose visibility deliberately

A public project can expose a public project view and can be read more broadly than a private one. Do not change visibility merely to make an internal screenshot or link easier to share. Review the actual public page before using it as a customer-facing surface.

Organization members and viewers see themselves and the people who share an explicit project with them in people search, assignee choices, and mention suggestions. Owners and administrators see the full organization directory. Public project visibility alone does not add its members to a client's people list. Removing project access changes subsequent requests, including an existing session.

A public intake form is a separate feature: it accepts requests without granting general project access. See [Intake Forms](https://github.com/jakwinkler/weaver/wiki/Intake-Forms). Private attachments should not be treated as public assets just because their issue or project has a public representation.

## Define how work moves

Administrators manage **Workflows** and **Issue Types**. A workflow contains statuses and transitions; an issue type identifies the kind of work. The default workflow has To Do, In Progress, and Done. A type such as Epic can also affect planning views.

Before changing a shared workflow, consider the projects and existing issues that use it. A status name does not determine completion by itself. Reports rely on workflow status metadata, including whether a status is terminal.

Each status has three settings in the workflow editor's **Add Status** and **Edit Status** panels:

| Setting | What it does |
| --- | --- |
| **Category** (To Do, In Progress, Done) | Groups and colors the status in the editor and its minimap. The automation condition **Status category** matches it, and plugins such as Relations use it to color statuses. It does not mark work as done. |
| **Terminal** | Marks work as done. Sprint completion and carryover, completed points, velocity, dashboard counts, and epic progress all use it. |
| **Initial** | New issues start in this status. A workflow has one initial status, so turning it on for one status turns it off for the others. |

For a status such as Testing or Blocked, choose the category that should group it, usually In Progress, and leave **Terminal** off so the work still counts as open.

If a user cannot see a project or make a change, check organization membership, project membership, role permissions, and feature enablement in that order. See [Troubleshooting](https://github.com/jakwinkler/weaver/wiki/Troubleshooting).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Project operations use `/projects` and `/projects/:key`; members, issue types, and plugins have project subroutes. Organization membership and project membership are different records. Role permissions use dot-separated keys such as `issues.update` and `pages.read`.

`ProjectAccessService` lets owner/admin roles access project data. For other users, public visibility permits reads; private reads require membership. Writes require membership and reject project-viewer membership. Endpoint permission guards are an additional check, not an alternative to project access.

The pilot release also applies `MemberVisibilityService` to directory results, rosters, avatars, assignees, and mention recipients. `GET /projects/:key/workflow` gives project readers status labels and available transitions without granting workflow administration. Invitations are email-bound, expire after seven days, and are redeemed once. Their token is returned to the administrator for private delivery; Weaver does not email invitations automatically.

Tenant data is stored in tenant schemas. Shared identity and memberships live in the public schema. HTTP tenant headers must match the authenticated identity; they are not a way to switch to arbitrary tenant data.

Completion reads `WorkflowStatusEntity.isTerminal`, not the status name or `category`. Sprint completion and velocity, dashboard counts, epic progress, and plugin issue candidates all filter on it. `category` feeds editor grouping and colors, plugin status colors, and the `status_category` automation condition. New issues take the workflow's `isInitial` status, and creating or updating a status with `isInitial: true` clears the flag on the workflow's other statuses.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/api/src/core/tenant/project-access.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/tenant/project-access.service.ts)
- [apps/api/src/core/tenant/tenant-provisioning.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/tenant/tenant-provisioning.service.ts)
- [apps/api/src/modules/projects/projects.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/projects/projects.controller.ts)
- [apps/web/src/features/projects/ProjectSettingsPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/projects/ProjectSettingsPage.tsx)

Status settings checked against [`eb1e6d3`](https://github.com/jakwinkler/weaver/commit/eb1e6d307159b98e986221e434d376b0ae682252): [workflows service](https://github.com/jakwinkler/weaver/blob/eb1e6d307159b98e986221e434d376b0ae682252/apps/api/src/modules/workflows/workflows.service.ts), [sprints service](https://github.com/jakwinkler/weaver/blob/eb1e6d307159b98e986221e434d376b0ae682252/apps/api/src/modules/sprints/sprints.service.ts), [dashboard service](https://github.com/jakwinkler/weaver/blob/eb1e6d307159b98e986221e434d376b0ae682252/apps/api/src/modules/dashboard/dashboard.service.ts), [issues service](https://github.com/jakwinkler/weaver/blob/eb1e6d307159b98e986221e434d376b0ae682252/apps/api/src/modules/issues/issues.service.ts), [plugin context](https://github.com/jakwinkler/weaver/blob/eb1e6d307159b98e986221e434d376b0ae682252/apps/api/src/plugins/plugin-context.factory.ts), and [automation conditions](https://github.com/jakwinkler/weaver/blob/eb1e6d307159b98e986221e434d376b0ae682252/apps/api/src/modules/automations/condition-evaluator.service.ts).

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [directory privacy policy](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/docs/security/project-directory-privacy.md), [project access service](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/core/tenant/project-access.service.ts), and [invitation browser checks](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/invitations.spec.ts).
