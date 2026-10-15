# Real-Time Updates

**Status: Implemented.** Domain events drive live query refresh and notifications through Socket.IO.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications).

## Implemented

- [x] Authenticated `/ws` connections, tenant-scoped project rooms, and event dispatch to the room union.
- [x] Actor-bearing issue/comment/project events, including delete and reorder events.
- [x] One AppLayout connection with reconnect behavior and query invalidation for relevant records.
- [x] Accessible event toasts with self-toast suppression.

## Differences from the original plan

- React Query refresh is connected to the event stream, not limited to manual refetch.
- This refreshes saved records. It does not implement collaborative character-level editing or conflict-free offline synchronization.

## Remaining work and verification

- [ ] Repeat two-user browser checks for movement, comments, reconnect, and permission changes.
- [ ] Maintain tenant and private-project visibility checks when changing event recipients or payloads.

## Evidence

Source and existing event tests were inspected. The documentation walkthrough did not run a two-user concurrency acceptance check.

### Implementation

- [apps/api/src/core/websocket/websocket.gateway.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/core/websocket/websocket.gateway.ts)
- [apps/api/src/modules/events/event-dispatcher.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/events/event-dispatcher.service.ts)
- [apps/web/src/hooks/useWebSocket.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/hooks/useWebSocket.ts)
- [apps/web/src/hooks/websocketEvents.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/hooks/websocketEvents.ts)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/realtime.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/realtime.e2e-spec.ts)
- [apps/web/src/hooks/useWebSocket.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/hooks/useWebSocket.test.ts)

## Dependencies

- None (but pairs well with 01-drag-and-drop)
