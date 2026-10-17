# Weaver roadmap and implementation status

Most of the original feature work is implemented. The remaining work is concentrated in specific UI/API gaps, external integration acceptance, and Automatic Time's real-world trial. The older milestone names and effort estimates are planning history, not release certification.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). The application checkout can be older than that source baseline. This edit changes roadmap documentation only.

For user instructions, start with the [published documentation](https://github.com/jakwinkler/weaver/wiki/) or [local documentation index](../README.md). The [coverage guide](https://github.com/jakwinkler/weaver/wiki/Feature-Coverage) records the earlier local walkthrough against `1b1b370`. Main's later cleanup changed deployment/docs paths; application source for those walkthroughs is unchanged.

## Read the status correctly

- **Implemented** means the reviewed source contains the feature. It does not mean every acceptance path was exercised or the feature is production-ready.
- **Implemented with gaps/limits** identifies a specific missing behavior or known issue in the feature page.
- **UI blocked** means an observed runtime failure prevents calling the user workflow complete.
- **Verification pending** keeps external-provider, scheduled-job, real-data, and native-device acceptance explicit.
- Checked implementation items record code presence. Existing test files are evidence of coverage, not a claim that those tests were rerun for this edit. Open boxes record remaining work or verification.

## Current feature status

| # | Feature | Status |
| --- | --- | --- |
| 01 | [Drag & Drop](01-drag-and-drop.md) | Implemented with limits |
| 02 | [Rich Text Rendering](02-rich-text.md) | Implemented |
| 03 | [Real-Time Updates](03-real-time.md) | Implemented |
| 04 | [Pagination & Sorting](04-pagination.md) | Implemented with limits |
| 05 | [Inline Editing](05-inline-editing.md) | Implemented |
| 06 | [Keyboard Shortcuts](06-keyboard-shortcuts.md) | Implemented |
| 07 | [@Mentions](07-mentions.md) | Implemented |
| 08 | [Email Notifications](08-email-notifications.md) | Implemented; external delivery unverified |
| 09 | [Bulk Operations UI](09-bulk-operations.md) | Implemented |
| 10 | [Backlog & Sprint Planning](10-backlog-sprint-planning.md) | Implemented with gaps |
| 11 | [Board Swimlanes & WIP Limits](11-swimlanes-wip.md) | Implemented with a display issue |
| 12 | [Story Points & Estimation](12-story-points.md) | Implemented |
| 13 | [Sprint Reports](13-sprint-reports.md) | Implemented; full-cycle verification pending |
| 14 | [Roadmap View](14-roadmap-view.md) | Implemented |
| 15 | [Automation Engine](15-automation-engine.md) | Implemented with an SDK integration gap |
| 16 | [Automation Rules UI](16-automation-rules-ui.md) | Implemented |
| 17 | [Scheduled Automations](17-scheduled-automations.md) | Implemented; scheduled runtime verification pending |
| 18 | [Dynamic Plugin Loading](18-dynamic-plugin-loading.md) | Implemented with a bundled fallback |
| 19 | [Plugin Settings UI](19-plugin-settings-ui.md) | UI blocked; settings API implemented |
| 20 | [Plugin CLI & Scaffolding](20-plugin-cli.md) | Implemented; package distribution unverified |
| 21 | [Plugin Upgrade Hooks](21-plugin-upgrades.md) | Implemented |
| 22 | [OAuth SSO](22-oauth-sso.md) | Implemented for Google, GitHub, SAML, and OIDC |
| 23 | [Jira Import](23-jira-import.md) | Implemented; real migration unverified |
| 24 | [Docs & Wiki](24-docs-wiki.md) | Implemented |
| 25 | [Forms (External Intake)](25-forms.md) | Implemented |
| 26 | [API Key Management](26-api-keys.md) | Implemented; credential runtime check pending |
| 27 | [Recurring Tasks](27-recurring-tasks.md) | Implemented; scheduled generation verification pending |
| 28 | [Audit Log](28-audit-log.md) | Implemented with coverage gaps |
| 29 | [Automatic Time Plugin](29-automatic-time-plugin.md) | Local alpha; trial pending |
| 30 | [Jam Integration Plugin](30-jam-plugin.md) | Phases 1 and 2 implemented, not merged; real Jam acceptance pending |

## Concrete remaining work

1. Repair the plugin management page's settings/list contract (19).
2. Correct date-only labels and assignee fallbacks, expose intended sprint capacity edits, and handle aggregate-view fetch limits (04, 10, 11, 13).
3. Wire custom plugin workflow registration if retained in the SDK, and bound automation fan-out (15, 17).
4. Finish intended audit coverage for automation management and retained deletion evidence (28).
5. Verify external OAuth/SSO, email, Jira migration, actual scheduled work, and plugin package/upgrade workflows in configured environments (08, 17, 20, 21, 22, 23, 27).
6. Complete the ten-working-day Automatic Time trial and signed companion/distribution acceptance (29).

Feature pages preserve narrower original targets where the implementation differs, such as Microsoft social sign-in, the retained Automatic Time importer, and the sprint header's completed-point display. Those are explicit remaining decisions/work, not silently completed requirements.

## Original milestone grouping

| Planning milestone | Feature scope | How to interpret it now |
| --- | --- | --- |
| v0.5, usable | 01 through 09 | Implemented UX and collaboration foundation; delivery/acceptance limits remain |
| v0.7, agile planning | 10 through 14 | Planning/reporting code exists; known display, capacity, and completeness gaps remain |
| v0.8, automations | 15 through 17 | Engine, builder, and schedules exist; SDK/fan-out and operational checks remain |
| v0.9, plugin platform | 18 through 21 | Federation, settings, CLI, and upgrades exist; settings UI and external-package acceptance remain |
| v1.0, integration and administration | 22 through 28 | Implemented source does not certify a production-ready release |
| v1.1, personal intelligence | 29 | Local-alpha implementation, with representative trial and distribution gates open |

## Maintain this roadmap

Update the source baseline, implemented behavior, differences, and remaining work together. Link the actual code/test surface. A passing unit test, a rendered page, a completed provider login, and a production deployment are different evidence and should be recorded separately.

Keep the original project boundaries: optional features remain plugins where appropriate, user and tenant data boundaries are enforced at the API, and implementation starts with a complete, bounded workflow. Do not convert the existence of code or a historical checkbox into a new runtime or release claim.
