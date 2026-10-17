import type { ComponentType } from 'react';
import type { PluginManifest } from '@/api';
import { getPluginComponent } from './dynamic-loader';

// ── Slot Entries ──

/** Slots the host renders. A manifest slot with any other name never appears. */
export const HOST_SLOT_NAMES = ['issue-detail-content', 'issue-detail-sidebar'] as const;
export type HostSlotName = (typeof HOST_SLOT_NAMES)[number];

export interface SlotEntry {
  pluginId: string;
  slotName: string;
  componentName: string;
  component: ComponentType<any> | null;
  requiredPermissions: string[];
}

export function getSlotEntries(
  slotName: string,
  manifests: PluginManifest[],
  enabledPluginIds: string[],
): SlotEntry[] {
  const entries: SlotEntry[] = [];
  for (const manifest of manifests) {
    if (!enabledPluginIds.includes(manifest.id)) continue;
    for (const slot of manifest.ui?.slots ?? []) {
      if (slot.slot !== slotName) continue;
      entries.push({
        pluginId: manifest.id,
        slotName: slot.slot,
        componentName: slot.component,
        component: getPluginComponent(manifest.id, slot.component, manifest.clientBundle),
        requiredPermissions: slot.requiredPermissions ?? [],
      });
    }
  }
  return entries;
}

// ── Navigation Entries ──

export interface NavigationEntry {
  pluginId: string;
  label: string;
  icon: string;
  path: string;
  requiredPermissions: string[];
}

export function getNavigationEntries(
  manifests: PluginManifest[],
  enabledPluginIds: string[],
): NavigationEntry[] {
  const entries: NavigationEntry[] = [];
  for (const manifest of manifests) {
    if (!enabledPluginIds.includes(manifest.id)) continue;
    for (const nav of manifest.ui?.navigation ?? []) {
      entries.push({
        pluginId: manifest.id,
        label: nav.label,
        icon: nav.icon,
        path: nav.path,
        requiredPermissions: nav.requiredPermissions ?? [],
      });
    }
  }
  return entries;
}

// ── Page Entries ──

export interface PageEntry {
  pluginId: string;
  path: string;
  componentName: string;
  component: ComponentType<any> | null;
  requiredPermissions: string[];
}

/** A page owns its own path and the routes nested under it, not paths that merely share a prefix. */
export function matchesPagePath(path: string, pagePath: string): boolean {
  const base = pagePath.endsWith('/') ? pagePath.slice(0, -1) : pagePath;
  return path === base || path.startsWith(`${base}/`);
}

export function getPageEntry(
  path: string,
  manifests: PluginManifest[],
  enabledPluginIds: string[],
): PageEntry | undefined {
  for (const manifest of manifests) {
    if (!enabledPluginIds.includes(manifest.id)) continue;
    for (const page of manifest.ui?.pages ?? []) {
      if (matchesPagePath(path, page.path)) {
        return {
          pluginId: manifest.id,
          path: page.path,
          componentName: page.component,
          component: getPluginComponent(manifest.id, page.component, manifest.clientBundle),
          requiredPermissions: page.requiredPermissions ?? [],
        };
      }
    }
  }
  return undefined;
}

// ── Project View Entries ──

export interface ProjectViewEntry {
  pluginId: string;
  label: string;
  icon: string;
  viewPath: string;
  requiredPermissions?: string[];
}

export function getProjectViewEntries(
  manifests: PluginManifest[],
  enabledPluginIds: string[],
): ProjectViewEntry[] {
  const entries: ProjectViewEntry[] = [];
  for (const manifest of manifests) {
    if (!enabledPluginIds.includes(manifest.id)) continue;
    for (const view of manifest.ui?.projectViews ?? []) {
      entries.push({
        pluginId: manifest.id,
        label: view.label,
        icon: view.icon,
        viewPath: view.viewPath,
        requiredPermissions: view.requiredPermissions,
      });
    }
  }
  return entries;
}
