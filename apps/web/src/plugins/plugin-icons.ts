import {
  Timer,
  GitBranch,
  Github,
  Gitlab,
  FolderGit2,
  ListChecks,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';

export const PLUGIN_ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  'git-branch': GitBranch,
  github: Github,
  gitlab: Gitlab,
  'folder-git-2': FolderGit2,
  'list-checks': ListChecks,
};

export const DEFAULT_PLUGIN_ICON = Puzzle;
