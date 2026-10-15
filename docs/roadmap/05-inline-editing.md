# Inline Editing

**Status: Implemented.** List cells and issue details provide permission-aware inline updates.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues).

## Implemented

- [x] Inline summary, priority, status, assignee, due date, and story-point controls in issue lists.
- [x] Detail controls for status, priority, estimate, assignee, and dates; explicit rich-text description editing.
- [x] Optimistic save behavior, error recovery, Enter/Escape, and Tab navigation where supported.

## Differences from the original plan

- The implementation is already present. Controls follow update/transition permissions and workflow rules.
- Text cells and rich-text descriptions have different save behavior; descriptions use explicit Save/Cancel.

## Remaining work and verification

- [ ] Repeat the keyboard, failed-save, and read-only-role matrix across each editable field.
- [ ] Correct date-only formatting where local timezone conversion shifts displayed dates; see feature 10.

## Evidence

The controls and save paths were source-reviewed. This documentation work did not perform every inline-edit interaction.

### Implementation

- [apps/web/src/features/issues/IssueListPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/IssueListPage.tsx)
- [apps/web/src/features/issues/IssueDetailPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/IssueDetailPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/web/src/components/InlineEditingControls.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/InlineEditingControls.test.tsx)

## Dependencies

- 04-pagination (inline editing works alongside sortable/paginated tables)
