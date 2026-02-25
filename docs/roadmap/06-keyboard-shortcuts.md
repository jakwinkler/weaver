# Keyboard Shortcuts

> Global and contextual keyboard shortcuts for power users: c=create issue, /=search, j/k=navigate, ?=help.

## Why

Power users in Jira and Linear rely heavily on shortcuts. It's a small effort feature that dramatically improves perceived quality. Keyboard-driven workflows reduce context switching between mouse and keyboard, making triage and navigation significantly faster for daily users.

## Current State

- No keyboard shortcut handling anywhere in the app
- No shortcut help dialog or discoverability mechanism
- Search bar exists but has no global focus shortcut
- Issue list and board have no keyboard navigation

## Tasks

### Frontend
- [ ] **Create useHotkeys hook** — Wrapper around keyboard events. Register global shortcuts in AppLayout. Support modifier keys (Ctrl, Shift, Alt). Disable when input/textarea focused. Track active context (global, list, board, detail) to scope shortcuts. _Files: `apps/web/src/hooks/useHotkeys.ts`_
- [ ] **Global shortcuts** — `/` focuses search bar. `c` opens create issue dialog (when on a project page). `?` opens shortcut help dialog. `g p` (sequence) goes to projects. `g d` goes to dashboard. _Files: `apps/web/src/layouts/AppLayout.tsx`_
- [ ] **List navigation** — `j`/`k` moves selection up/down in issue list. `Enter` opens selected issue. `x` toggles selection for bulk. Visual highlight on the currently focused row. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Issue detail shortcuts** — `e` enters edit mode. `a` opens assignee picker. `s` opens status transition. `Escape` closes modals/dialogs. _Files: `apps/web/src/features/issues/IssueDetailPage.tsx`_
- [ ] **Board shortcuts** — Arrow keys navigate between cards. `Enter` opens card. Visual focus indicator on active card. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **Shortcuts help dialog** — Modal listing all shortcuts grouped by context (Global, Issues, Board). Triggered by `?`. Styled consistently with existing dialogs. _Files: `apps/web/src/components/ShortcutsDialog.tsx`_

### Tests
- [ ] **Manual: all shortcuts work** — Verify each shortcut in context. Shortcuts disabled in input fields. Verify sequences (`g p`, `g d`) work with reasonable timeout between keys.

## Acceptance Criteria

- `/` focuses search, `c` opens create, `?` shows help
- `j`/`k` navigates lists with visible highlight
- Shortcuts don't fire when typing in inputs or textareas
- Help dialog shows all available shortcuts grouped by context
- Works across all major pages (dashboard, projects, issues, boards)
- Sequences like `g p` have a reasonable timeout (~500ms)

## Dependencies

- None
