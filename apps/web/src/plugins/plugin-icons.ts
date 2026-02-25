import { icons, Puzzle, type LucideIcon } from 'lucide-react';

function kebabToPascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function getPluginIcon(name?: string): LucideIcon {
  if (!name) return Puzzle;
  const pascalName = kebabToPascal(name);
  const icon = (icons as Record<string, LucideIcon>)[pascalName];
  return icon ?? Puzzle;
}

export const DEFAULT_PLUGIN_ICON = Puzzle;
