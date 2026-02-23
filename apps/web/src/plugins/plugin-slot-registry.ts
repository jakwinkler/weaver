import type { ComponentType } from 'react';
import { TimerWidgetSlot } from './components/TimerWidgetSlot';
import { ChecklistSlot } from './components/ChecklistSlot';
import { ChecklistAppPage } from './components/ChecklistAppPage';

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
  {
    pluginId: '@weaver/plugin-checklist',
    slotName: 'issue-detail-content',
    component: ChecklistSlot,
    requiredPermissions: ['checklist.view'],
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

// ── Navigation Registry ──

export interface NavigationEntry {
  pluginId: string;
  label: string;
  icon: string;
  path: string;
  requiredPermissions: string[];
}

/**
 * Navigation entries for the sidebar "Apps" section.
 * Plugins register here when they have an app page.
 */
export const NAVIGATION_REGISTRY: NavigationEntry[] = [
  {
    pluginId: '@weaver/plugin-checklist',
    label: 'Checklists',
    icon: 'list-checks',
    path: '/apps/checklist',
    requiredPermissions: ['checklist.view'],
  },
];

export function getNavigationEntries(installedPluginIds: string[]): NavigationEntry[] {
  return NAVIGATION_REGISTRY.filter((e) => installedPluginIds.includes(e.pluginId));
}

// ── Page Registry ──

export interface PageEntry {
  pluginId: string;
  path: string;
  component: ComponentType<any>;
  requiredPermissions: string[];
}

/**
 * Full-page plugin components rendered at /apps/* routes.
 */
export const PAGE_REGISTRY: PageEntry[] = [
  {
    pluginId: '@weaver/plugin-checklist',
    path: '/apps/checklist',
    component: ChecklistAppPage,
    requiredPermissions: ['checklist.view'],
  },
];

export function getPageComponent(path: string, installedPluginIds: string[]): PageEntry | undefined {
  return PAGE_REGISTRY.find(
    (e) => path.startsWith(e.path) && installedPluginIds.includes(e.pluginId),
  );
}
