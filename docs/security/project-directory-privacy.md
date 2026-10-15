# Project directory privacy

Use the organization roles `owner` or `admin` for agency staff who need the
complete organization directory. Use `member` or `viewer` for clients, then add
them to their assigned projects in Project Settings.

## Visibility

- Owners and administrators can list and search all people in their organization.
- Other roles can see themselves and current organization members who explicitly
  share at least one project with them. Multiple projects produce the union of
  their colleagues. A person with no projects sees only themselves.
- A public project's content visibility does not add its members to a client's
  directory. Project member rosters also respect the caller's directory scope.
- Organization team lists and rosters require an owner or administrator.
- Current membership and role are evaluated for every request. Removing the last
  shared project or demoting an administrator restricts subsequent requests,
  including requests using an existing session.

Directory filtering covers names, email addresses, avatar references, exact
searches, and empty mention suggestions. Filtering happens before the ten-person
search limit. An allowed colleague remains eligible even when many hidden
people sort before them.

## Other identity paths

Avatar downloads apply the same person visibility rule. Creating, updating or
bulk-updating an issue rejects a selected assignee outside the actor's directory;
staff selections still require organization membership. This prevents a known
UUID from revealing a hidden person's name through issue history.

Mention notifications and mention emails are delivered only to current
organization members who can read the target project: agency owners/admins,
explicit project members, or organization members for a public project.
This applies to new comments and comment edits.

Historical authors remain part of the project content they contributed to.
Project content continues to follow the project's access rules.

## Regression checks

`apps/api/test/directory-privacy.e2e-spec.ts` covers both staff roles, client
member/viewer access, multiple and zero projects, revocation with existing
sessions, role demotion, search limits and literal wildcard handling,
organization isolation, public/team rosters, avatar access, forged assignees,
and mention notification recipients.

`apps/web/e2e/privacy.spec.ts` checks real assignee and mention pickers and staff
user management. The guarded live acceptance suite checks both clients'
directories, staff directory access, the same browser pickers, changing shared
membership, forbidden assignees and forced mentions, in addition to its existing
project and issue acceptance checks.

The change uses existing organization/project memberships and requires no schema
migration. See the local and live acceptance runbooks before running write tests.
