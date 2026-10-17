import { RENAMED_EVENTS } from '@weaver/shared';

/**
 * Whether a plugin manifest's or webhook's event list asks for `event`. A retired name in
 * RENAMED_EVENTS subscribes to the event that replaced it.
 */
export function subscribesTo(subscriptions: readonly string[], event: string): boolean {
  return subscriptions.some(
    (name) => name === '*' || name === event || RENAMED_EVENTS.get(name) === event,
  );
}
