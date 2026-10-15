# Keyboard Shortcuts

**Status: Implemented.** Global and contextual shortcuts cover search, navigation, issue actions, and board/list focus.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Keyboard Shortcuts](https://github.com/jakwinkler/weaver/wiki/Keyboard-Shortcuts).

## Implemented

- [x] Shared useHotkeys registration, editable-target suppression, and sequence handling.
- [x] Help dialog; search, create issue, project/dashboard navigation, and issue detail actions.
- [x] List j/k navigation, Enter to open, x selection, and board arrow-key navigation.
- [x] Visible focus and contextual handling for dialogs/editors.

## Differences from the original plan

- The keyboard infrastructure and help dialog exist; no new shortcut framework is needed.
- Sequences use successive keys, while edit controls also provide their own native keyboard behavior.

## Remaining work and verification

- [ ] Repeat keyboard-only flows with dialogs, rich-text fields, permission-restricted roles, and narrow layouts.
- [ ] Keep the help dialog synchronized with registered shortcuts.

## Evidence

Key bindings and existing tests were inspected. No full keyboard-accessibility audit was performed.

### Implementation

- [apps/web/src/hooks/useHotkeys.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/hooks/useHotkeys.ts)
- [apps/web/src/components/ShortcutsDialog.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/ShortcutsDialog.tsx)
- [apps/web/src/layouts/AppLayout.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/layouts/AppLayout.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/web/src/hooks/useHotkeys.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/hooks/useHotkeys.test.tsx)
- [apps/web/src/components/ShortcutsDialog.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/ShortcutsDialog.test.tsx)
- [apps/web/src/features/boards/KanbanBoard.keyboard.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/KanbanBoard.keyboard.test.tsx)

## Dependencies

- None
