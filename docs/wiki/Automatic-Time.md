# Automatic Time: review before release

Automatic Time keeps activity-derived time as private drafts until you review and explicitly release it. Released entries become official Weaver time. A suggested issue or duration is a proposal for you to check.

The plugin includes a macOS companion workflow and is presented as a private local alpha in its settings. The companion's capture, pairing, and release workflow was not exercised on a real device for this documentation. Do not read the earlier roadmap's proposed defaults as a guarantee of deployed behavior.

## Enable the feature

An administrator installs **Automatic Time** and explicitly enables it; it installs disabled. Users also need its permissions. Once available, its app navigation contains **Drafts**, **Daily Review**, and **Settings**.

Your operator must provide the appropriate companion build and installation instructions. The presence of companion metadata in a manifest does not prove a signed/downloadable release exists for your machine.

## Review a day's work

Open **Drafts** to inspect the proposed activity blocks. Check the issue suggestion, confidence, time, and description. Assign or correct an issue, edit the description and proposed minutes, and hide or delete blocks that should not become official work.

Open **Daily Review** for the chosen day. Resolve unassigned work before release. Review the total and each assignment, then explicitly choose the release action. High confidence does not replace this final review.

The current design keeps private drafts separate from official time entries. Device credentials cannot release official time. After release, check the resulting official entries in Weaver's time views.

## Manage devices and corrections

In **Settings**, inspect a pairing request before approving it. Confirm the device name and requested scopes. Revoke a device you no longer use. Device authorization is separate from your ability to sign into Weaver.

Correction memory records assignment corrections. The settings page provides controls to enable, disable, delete, or request recomputation from these memories. Review an unexpected suggestion instead of assuming an earlier correction should always apply.

## Reopen and uninstall carefully

Reopening released work depends on the official entries' lock state. Locked entries cannot be casually rewritten by the plugin. Resolve the lock and review state through the intended workflow.

Uninstalling Automatic Time deletes its private drafts, correction memory, settings, and paired devices. Official time entries are preserved. Use Disable for a temporary pause and read the uninstall confirmation before proceeding.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

The plugin ID is `@weaver/plugin-automatic-time`. Client routes are `/apps/automatic-time/drafts`, `/apps/automatic-time/review`, and `/apps/automatic-time/settings`. Permissions cover viewing, managing drafts, release, and device management.

The canonical official record is the core `time_entries` table. Plugin-owned draft/release state and paired-device credentials have different scopes. Review the server checks and threat model before extending these boundaries. An API key, companion device credential, and interactive user session must not be treated as interchangeable.

The companion source includes metadata collection, local storage, segmentation, matching, and synchronization. The design excludes screen recording, meeting audio, and automatic official release. Verify the actual installed build, capture permissions, retention, model endpoint, and network behavior before making privacy or deployment claims.

The architecture and security documents are useful deeper references, but proposed thresholds and rollout gates require runtime evidence. A rendered empty Drafts or Settings page alone does not demonstrate capture, offline recovery, pairing, or released-time correctness.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [plugins/plugin-automatic-time/weaver-plugin.json](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/plugins/plugin-automatic-time/weaver-plugin.json)
- [plugins/plugin-automatic-time/src/client/AutomaticTimeDraftsPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/plugins/plugin-automatic-time/src/client/AutomaticTimeDraftsPage.tsx)
- [plugins/plugin-automatic-time/src/client/AutomaticTimeReviewPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/plugins/plugin-automatic-time/src/client/AutomaticTimeReviewPage.tsx)
- [plugins/plugin-automatic-time/src/client/AutomaticTimeSettingsPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/plugins/plugin-automatic-time/src/client/AutomaticTimeSettingsPage.tsx)
- [docs/architecture/automatic-time-companion.md](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/docs/architecture/automatic-time-companion.md)
- [docs/security/automatic-time-threat-model.md](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/docs/security/automatic-time-threat-model.md)
