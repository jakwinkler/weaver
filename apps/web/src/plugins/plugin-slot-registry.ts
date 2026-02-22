import type { ComponentType } from 'react';
import { TimerWidgetSlot } from './components/TimerWidgetSlot';

export interface SlotEntry {
  pluginId: string;
  slotName: string;
  component: ComponentType<any>;
  requiredPermissions: string[];
}

/**
 * Static registry mapping plugin slots to React components.
 * Each plugin that provides UI adds entries here.
 */
export const SLOT_REGISTRY: SlotEntry[] = [
  {
    pluginId: '@weaver/plugin-timer',
    slotName: 'issue-detail-sidebar',
    component: TimerWidgetSlot,
    requiredPermissions: ['timer.allow'],
  },
];

/**
 * Get all slot components for a given slot name,
 * filtered to only include plugins that are installed.
 */
export function getSlotComponents(
  slotName: string,
  installedPluginIds: string[],
): SlotEntry[] {
  return SLOT_REGISTRY.filter(
    (entry) =>
      entry.slotName === slotName && installedPluginIds.includes(entry.pluginId),
  );
}
