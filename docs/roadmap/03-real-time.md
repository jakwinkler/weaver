# Real-Time Updates

> Live updates via WebSocket (Socket.IO) so boards, issues, and comments reflect changes by other users instantly.

## Why

Without real-time, two people on the same board see stale data. One person moves a card, the other doesn't see it until refresh. This is the #1 collaboration problem.

## Current State

- WebSocket gateway already existed at `apps/api/src/core/websocket/websocket.gateway.ts` (Socket.IO, `/ws` namespace, JWT auth, tenant/project rooms)
- EventDispatcher emits domain events server-side (webhooks + plugin dispatchers)
- React Query handles data fetching with manual refetch

## Implementation (completed)

### Backend

- [x] **Hook EventDispatcher into WebSocket gateway** -- EventDispatcherService injects WeaverGateway and emits each domain event once to the tenant and optional tenant-scoped project-room union. _File: `apps/api/src/modules/events/event-dispatcher.service.ts`_
- [x] **EventsModule imports WebSocketModule** -- So WeaverGateway can be injected. _File: `apps/api/src/modules/events/events.module.ts`_
- [x] **Event payload format** -- Standardized: `{ event: 'issue.updated', data: { issueKey, fields, userId, ... }, timestamp }`. Includes `userId` so sender can skip self-updates. _Files: `event-dispatcher.service.ts`, `issues.service.ts`_
- [x] **userId included in actor-driven event payloads** -- Issue, comment, and project mutations include `userId`, including delete and reorder events, so clients can suppress self-toasts. _Files: `apps/api/src/modules/issues/issues.service.ts`, `apps/api/src/modules/comments/comments.service.ts`, `apps/api/src/modules/projects/projects.service.ts`_
- [x] **Comment events** -- `comment.created`, `comment.updated`, and `comment.deleted` events emitted from CommentsService. CommentsModule imports EventsModule. _Files: `apps/api/src/modules/comments/comments.service.ts`, `comments.module.ts`_
- [x] **Issue reorder events** -- Same-column and same-list drag operations emit `issue.reordered`, so other clients refresh issue and board ordering without a manual reload. _Files: `apps/api/src/modules/issues/issues.service.ts`, `apps/web/src/hooks/websocketEvents.ts`_
- [x] **Tenant-scoped channels** -- Events emit to `tenant:{tenantId}` and `tenant:{tenantId}:project:{projectKey}` rooms derived from the authenticated socket and AsyncLocalStorage tenant context. A union broadcast prevents duplicate delivery to sockets in both rooms. _Files: `apps/api/src/core/websocket/websocket.gateway.ts`, `event-dispatcher.service.ts`_

### Frontend

- [x] **Created useWebSocket hook** -- `apps/web/src/hooks/useWebSocket.ts`. Connects to Socket.IO `/ws` namespace using JWT from auth store. Auto-reconnects with exponential backoff. Listens for all domain events. The unused legacy socket hook was removed to keep one connection path.
- [x] **Invalidate React Query on events** -- Maps domain events to query key invalidations (issues, comments, activity, boards, dashboard, projects) through tested pure helpers. _File: `apps/web/src/hooks/websocketEvents.ts`_
- [x] **Connected in AppLayout** -- `useWebSocket()` called in AppLayout so connection is established once after login. Disconnects on unmount/logout (accessToken change). _File: `apps/web/src/layouts/AppLayout.tsx`_
- [x] **Toast notifications** -- Shows accessible lightweight toast notifications for events from OTHER users (compares `userId` from event payload to current user). Auto-dismisses after 4 seconds. No external toast library needed.

### Tests

- [x] **E2E: WebSocket requires auth** -- Connect without token -> disconnected. Connect with invalid token -> disconnected. Connect with valid token -> connected. _File: `apps/api/test/realtime.e2e-spec.ts`_
- [x] **E2E: Events are received after actions** -- Create issue -> receive `issue.created`. Update issue -> receive `issue.updated`. Create comment -> receive `comment.created`. _File: `apps/api/test/realtime.e2e-spec.ts`_
- [x] **E2E: Complete mutation coverage** -- Comment edits, issue deletes, and issue reorders emit actor-bearing events; clients in both tenant and project rooms receive one copy. _File: `apps/api/test/realtime.e2e-spec.ts`_
- [x] **E2E: Tenant isolation** -- Events from tenant A are not received by tenant B's socket, including when a client attempts to join another tenant's project room. _File: `apps/api/test/realtime.e2e-spec.ts`_
- [x] **Unit: frontend event handling** -- Query invalidation, toast copy, and self-toast suppression are covered without opening a network connection. _File: `apps/web/src/hooks/useWebSocket.test.ts`_

## Acceptance Criteria

- [x] Board updates live when another user moves or reorders a card (query invalidation on issue.moved/status_changed/reordered)
- [x] New and edited comments appear without refresh (query invalidation on comment.created/updated)
- [x] Issue field changes reflect on detail page without refresh (query invalidation on issue.updated)
- [x] WebSocket respects tenant isolation (no cross-tenant leaks)
- [x] Connection auto-reconnects on network failures (Socket.IO built-in)
- [x] Toast shows when another user makes a relevant change

## Architecture Notes

- Used existing Socket.IO WebSocket gateway instead of SSE (was already in place)
- EventDispatcherService reads tenant context from AsyncLocalStorage to determine which tenant and tenant-scoped project rooms to emit to
- Frontend connects once in AppLayout; all domain events trigger React Query invalidation
- Toast system is CSS-only (no external dependency), uses an ARIA live region, and auto-dismisses

## Dependencies

- None (but pairs well with 01-drag-and-drop)
