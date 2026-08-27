# Keyboard Shortcuts

> Global and contextual keyboard shortcuts for power users: c=create issue, /=search, j/k=navigate, ?=help.

## Why

Power users in Jira and Linear rely heavily on shortcuts. It's a small effort feature that dramatically improves perceived quality. Keyboard-driven workflows reduce context switching between mouse and keyboard, making triage and navigation significantly faster for daily users.

## Current State

- AppLayout registers global shortcuts through a shared, context-aware `useHotkeys` hook
- The shortcut help dialog groups commands by global, list, detail, and board context
- Search, project issue creation, dashboard, and project navigation have global shortcuts
- Issue lists and boards expose visible keyboard focus, selection, and open actions
- Issue detail shortcuts open editing, assignee, and workflow status controls

## Tasks

### Frontend

- [x] **Create useHotkeys hook** — Wrapper around keyboard events. Register global shortcuts in AppLayout. Support modifier keys (Ctrl, Shift, Alt). Disable when input/textarea focused. Track active context (global, list, board, detail) to scope shortcuts. _Files: `apps/web/src/hooks/useHotkeys.ts`_
- [x] **Global shortcuts** — `/` focuses search bar. `c` opens create issue dialog (when on a project page). `?` opens shortcut help dialog. `g p` (sequence) goes to projects. `g d` goes to dashboard. _Files: `apps/web/src/layouts/AppLayout.tsx`_
- [x] **List navigation** — `j`/`k` moves selection up/down in issue list. `Enter` opens selected issue. `x` toggles selection for bulk. Visual highlight on the currently focused row. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [x] **Issue detail shortcuts** — `e` enters edit mode. `a` opens assignee picker. `s` opens status transition. `Escape` closes modals/dialogs. _Files: `apps/web/src/features/issues/IssueDetailPage.tsx`_
- [x] **Board shortcuts** — Arrow keys navigate between cards. `Enter` opens card. Visual focus indicator on active card. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [x] **Shortcuts help dialog** — Modal listing all shortcuts grouped by context (Global, Issues, Board). Triggered by `?`. Styled consistently with existing dialogs. _Files: `apps/web/src/components/ShortcutsDialog.tsx`_

### Tests

- [x] **Automated: shortcut behavior** — Cover matching, modifiers, context scoping, input suppression, sequences, dialogs, page navigation, list selection, issue detail menus, and two-dimensional board navigation.
- [x] **Manual: all shortcuts work** — Verify each shortcut in context. Shortcuts disabled in input fields. Verify sequences (`g p`, `g d`) work with reasonable timeout between keys.

## Acceptance Criteria

- [x] `/` focuses search, `c` opens create, `?` shows help
- [x] `j`/`k` navigates lists with visible highlight
- [x] Shortcuts don't fire when typing in inputs or textareas
- [x] Help dialog shows all available shortcuts grouped by context
- [x] Works across all major pages (dashboard, projects, issues, boards)
- [x] Sequences like `g p` have a reasonable timeout (~500ms)

## Dependencies

- None
