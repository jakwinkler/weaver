# Plugin Settings UI

**Status: UI blocked; settings API implemented.** Schema-driven settings exist, but the management page has an observed rendering failure.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins).

## Implemented

- [x] Manifest-driven string, number, boolean, select, and textarea controls with labels/defaults/validation.
- [x] Settings dialog, fetch/update hooks, merged defaults, and server-side field validation.
- [x] Settings summaries that mask sensitive-looking fields when the expected settings object is supplied.

## Differences from the original plan

- The form and settings API are implemented; they are not missing work.
- The installed-plugin list deliberately omits settings. PluginsPage still passes `plugin.settings` to a summary helper that calls Object.entries for nonempty schemas. This contract mismatch matches the locally observed blank page.
- Fetching private settings through the dedicated authorized endpoint is separate from the general installed-plugin list.

## Remaining work and verification

- [ ] Fix the page/list contract without restoring secrets to the general list response.
- [ ] Verify list rendering, settings open/save, default merging, invalid fields, sensitive summaries, and recovery after errors in the browser.

## Evidence

The Plugins page rendered blank after the local example plugin set was installed, including after a fresh login. API installation and issue panels worked. No application fix was made during documentation work.

### Implementation

- [apps/web/src/features/settings/PluginsPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/settings/PluginsPage.tsx)
- [apps/web/src/features/settings/PluginSettingsForm.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/settings/PluginSettingsForm.tsx)
- [apps/api/src/plugins/plugins.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/plugins/plugins.controller.ts)
- [apps/api/src/plugins/plugin-registry.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/plugins/plugin-registry.service.ts)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/plugin-settings.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/plugin-settings.e2e-spec.ts)
- [apps/web/src/features/settings/PluginSettingsForm.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/settings/PluginSettingsForm.test.tsx)

## Dependencies

- None
