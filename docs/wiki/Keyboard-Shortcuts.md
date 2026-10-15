# Keyboard shortcuts

Press `?` in Weaver to open the shortcut reference. Shortcuts depend on the current page and are suppressed while you type into an input, text area, or rich-text editor.

| Where | Keys | Action |
| --- | --- | --- |
| Anywhere in the app | `?` | Open shortcut help |
| Anywhere in the app | `/` | Focus search |
| On a project page | `c` | Create an issue in the current project |
| Anywhere in the app | `g`, then `p` | Go to Projects |
| Anywhere in the app | `g`, then `d` | Go to Dashboard |
| Issue list | `j` / `k` | Move focus down / up |
| Issue list | `Enter` | Open the focused issue |
| Issue list | `x` | Toggle selection of the focused issue |
| Issue detail | `e` | Open issue editing |
| Issue detail | `a` | Open the assignee picker |
| Issue detail | `s` | Open the status transition menu |
| Editor or dialog | `Escape` | Close the active editor or dialog where supported |
| Board | Arrow keys | Move between cards |
| Board | `Enter` | Open the focused card |
| Inline text cell | `Enter` / `Escape` | Save / cancel |
| Inline editing | `Tab` / `Shift+Tab` | Move to the next / previous editable cell |

For sequences such as `g`, then `p`, press the keys one after the other promptly. They are not a chord. If a shortcut does nothing, click outside the editor or field, check that you are on the relevant page, and try again. Shortcuts do not grant edit permission.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

The application registers contextual shortcuts through `useHotkeys`. Sequence timing is approximately 500 ms. Editable targets, modifier keys, dialogs, and active contexts affect matching. The help dialog is the canonical user-facing list; keep it synchronized with any new shortcut behavior.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/components/ShortcutsDialog.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/components/ShortcutsDialog.tsx)
- [apps/web/src/hooks/useHotkeys.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/hooks/useHotkeys.ts)
- [apps/web/src/layouts/AppLayout.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/layouts/AppLayout.tsx)
