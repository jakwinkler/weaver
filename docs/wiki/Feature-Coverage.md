# Feature coverage and verification

All 29 items in the source roadmap have a home in this documentation. The guides describe the implementation, including its current limits, rather than turning planned acceptance criteria into claims that everything is complete.

**Use the feature guides for instructions. Use this page to understand the evidence behind them.** Checks were made on September 23, 2026 against the exact source tree of main `1b1b370`, using a fresh local fictional organization. These results do not establish the deployed state of any public installation.

## October 15 pilot update

The invited-client, organization access, issue, comment, and related troubleshooting instructions were compared with pilot release [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8). The [pilot readiness record](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/READINESS-2026-10-14.md) reports a fresh local run of 33/33 browser scenarios and 370/370 API end-to-end tests. Those results are recorded test evidence; this documentation update did not rerun the application suite or verify that `ce5494a` is deployed.

The pilot changes add single-use, email-bound organization invitations and organization switching; private-project membership remains a separate step. Project members can read status names and available transitions without administrator workflow access. People search, assignee and mention choices, and avatar access are limited to shared project colleagues for ordinary members/viewers. A submitted comment no longer reappears as an unfinished draft after reload. The browser suite also checks board drag persistence and direct-route plugin gates. [Weaver for invited clients](https://github.com/jakwinkler/weaver/wiki/For-Invited-Clients) covers the resulting everyday path without project administration or completion workflows.

Selected administrator and developer guides also record changed automation limits, API key rate limiting, sealed Jira import jobs, audit export handling, plugin security boundaries, and sprint date validation. These are source-reviewed additions to the documentation, not a new runtime acceptance run.

The table below retains the September walkthrough's feature-by-feature evidence. It is not a claim that every feature or external integration was rechecked on the pilot release.

## Local inline help implementation

The later October 15 frontend update adds Description during issue creation, tooltips for optional planning fields, visible description edit actions, short help inside the app, and a comment mention hint. Local verification passed 22 component tests and 9 Chromium scenarios, including invited clients on desktop and phone, saved descriptions and replies through reload, failed-create text preservation, tooltip focus/tap behavior, and read-only viewer controls. The web build also passed. This implementation extends `ce5494a` and has not been deployed or published with the wiki. The client guide's two new screenshots come from these disposable fixtures.

## How to read the checks

- **Local check** means the stated browser, API, or CLI behavior was exercised with synthetic data.
- **Source review** means the implementation was inspected. It does not mean that every path was run.
- **Observed limitation** means a local check found a problem or a source contract limits the behavior.
- **Not exercised** identifies a material path still needing runtime verification.

## Roadmap to guide map

| # | Roadmap item | Documentation | Evidence and limits |
| --- | --- | --- | --- |
| 01 | Drag and drop | [Boards and Views](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views), [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues), [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) | Board/backlog rendered with real local records. Drag persistence and all drag targets were source-reviewed, not exhaustively exercised. |
| 02 | Rich text | [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues), [Project Wiki](https://github.com/jakwinkler/weaver/wiki/Project-Wiki) | Local rich descriptions, comments, and project pages rendered. Formatting contracts source-reviewed. |
| 03 | Real-time updates | [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications) | Socket/event and query-refresh paths source-reviewed. The web client now joins the open project's room. Two-session browser scenarios in `apps/web/e2e/realtime.spec.ts` cover issue, board, sprint, and logged-time updates and a dropped connection; they run locally, not in CI. |
| 04 | Pagination and sorting | [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues), [Developer Reference](https://github.com/jakwinkler/weaver/wiki/Developer-Reference) | Local issue lists loaded. Query and UI contracts reviewed; large-dataset navigation not exercised. |
| 05 | Inline editing | [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues) | Controls and save/revert paths source-reviewed; not every field/keyboard path exercised. |
| 06 | Keyboard shortcuts | [Keyboard Shortcuts](https://github.com/jakwinkler/weaver/wiki/Keyboard-Shortcuts) | Key bindings and scope checked in source; not a full keyboard-accessibility audit. |
| 07 | Mentions | [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications) | Editor, user search, notification, and deduplication paths source-reviewed. Multiple-user receipt not exercised. |
| 08 | Email notifications | [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications), [Self Hosting](https://github.com/jakwinkler/weaver/wiki/Self-Hosting) | Preferences, templates, and job paths source-reviewed. No real email sent. |
| 09 | Bulk operations | [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues) | Selection, limit, payload, and transition handling source-reviewed. No bulk destructive operation performed. |
| 10 | Backlog and sprints | [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) | Local active/planned sprints and assignments created; backlog inspected. Date-label and capacity-update limits documented. |
| 11 | Swimlanes and WIP | [Boards and Views](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views) | Local board and WIP setting created. Grouping and warning behavior source-reviewed; assignee label fallback observed. |
| 12 | Story points | [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues), [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) | Estimates saved in local issues and displayed in board/backlog totals. |
| 13 | Sprint reports | [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) | Statistics inspected through local API. Chart calculations and historical behavior source-reviewed; a full completed sprint cycle was not simulated. |
| 14 | Roadmap view | [Roadmaps and Epics](https://github.com/jakwinkler/weaver/wiki/Roadmaps-and-Epics) | Local epic timeline, children, and completion percentages inspected in browser. |
| 15 | Automation engine | [Automations](https://github.com/jakwinkler/weaver/wiki/Automations) | New local issue received the configured label; successful execution log verified. Other action types source-reviewed. |
| 16 | Automation rules UI | [Automations](https://github.com/jakwinkler/weaver/wiki/Automations) | Four-step rule wizard used to create and save the working example rule. |
| 17 | Scheduled automations | [Automations](https://github.com/jakwinkler/weaver/wiki/Automations), [Self Hosting](https://github.com/jakwinkler/weaver/wiki/Self-Hosting) | Schedule validation and job handoff source-reviewed. No scheduled or overnight run exercised. |
| 18 | Dynamic plugin loading | [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins), [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development) | Ten bundled plugins installed through the local API; enabled issue panels rendered. External packages not tested. |
| 19 | Plugin settings UI | [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins), [Troubleshooting](https://github.com/jakwinkler/weaver/wiki/Troubleshooting) | Observed limitation in September: management page rendered blank with the installed example set. The cause, settings omitted from the list, was fixed in [`5d20a39`](https://github.com/jakwinkler/weaver/commit/5d20a39c472c0885ba5658d59ef26e7543857ba5) with a component test; the page was not rerun in a browser for this update. |
| 20 | Plugin CLI | [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development) | Repository CLI created a disposable scaffold and manifest validation passed. External registry publication not checked. |
| 21 | Plugin upgrade hooks | [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins), [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development) | Version comparison, migrations, and hook contracts source-reviewed. No actual upgrade/rollback cycle exercised. |
| 22 | OAuth and SSO | [OAuth Sign In](https://github.com/jakwinkler/weaver/wiki/OAuth-Sign-In) | Configuration and callback paths reviewed. No external provider login or enterprise SSO round trip exercised. |
| 23 | Jira import | [Jira Import](https://github.com/jakwinkler/weaver/wiki/Jira-Import) | Wizard source step inspected and captured. Import processor reviewed; no Jira account or migration used. |
| 24 | Project wiki | [Project Wiki](https://github.com/jakwinkler/weaver/wiki/Project-Wiki) | Local page hierarchy, edited page, and history rendered. Destructive deletion and restore not exercised. |
| 25 | External intake forms | [Intake Forms](https://github.com/jakwinkler/weaver/wiki/Intake-Forms) | Public form submitted in browser; success receipt and resulting local issue verified. External CAPTCHA not exercised. |
| 26 | API keys | [API Keys and Integrations](https://github.com/jakwinkler/weaver/wiki/API-Keys-and-Integrations) | Generation, hashing, scopes, rate limit, and revocation source-reviewed. Credential creation/use not exercised. |
| 27 | Recurring tasks | [Recurring Tasks](https://github.com/jakwinkler/weaver/wiki/Recurring-Tasks) | Local recurrence configured; schedule, copy, and deduplication paths reviewed. Overnight creation not exercised. |
| 28 | Audit log | [Audit Log](https://github.com/jakwinkler/weaver/wiki/Audit-Log) | Local project/plugin entries rendered in browser and read through API. CSV and retention paths source-reviewed. |
| 29 | Automatic Time | [Automatic Time](https://github.com/jakwinkler/weaver/wiki/Automatic-Time), [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development) | Installed disabled locally; draft/release/device contracts reviewed. Native capture, pairing, and official-time release not exercised. |

## About the screenshots

The original **Northstar Studio** organization, **Website Launch** project, **Alex Morgan** account, and all issues are fictional. The screenshots show the local application itself. The original workspace was seeded through local APIs, with a narrow correction to fictional sprint labels/dates so the examples read in order. The new client guide screenshots use separate disposable invited-client fixtures with fictional requests and replies.

Screenshots capture a point in the walkthrough. Later form submissions and automation checks added issues, so counts can differ between images. The sprint guide calls out the date-display issue visible in the backlog image.

## Limits that matter before relying on a feature

Read [Troubleshooting](https://github.com/jakwinkler/weaver/wiki/Troubleshooting) for the Plugins page problem fixed in PR #21, the remaining backlog date display issue, and assignee labels. Read [Self Hosting](https://github.com/jakwinkler/weaver/wiki/Self-Hosting) before treating a successful local page load as proof of an operational deployment.

The roadmap remains useful planning history. Its release labels, proposed thresholds, and checked or unchecked boxes are not the verification status of this documentation or of your installation.
