import { useState, useRef, useEffect, type ComponentType } from 'react';
import {
  Bug,
  CheckSquare,
  BookOpen,
  Zap,
  AlertTriangle,
  Star,
  Rocket,
  Target,
  Shield,
  Wrench,
  Lightbulb,
  FileText,
  Code,
  Database,
  Globe,
  Lock,
  Eye,
  RefreshCw,
  GitBranch,
  GitPullRequest,
  Layers,
  Box,
  Puzzle,
  Flame,
  Clock,
  Heart,
  Flag,
  Bookmark,
  Tag,
  Circle,
  Square,
  Triangle,
  Hexagon,
  X,
  type LucideProps,
} from 'lucide-react';
import { getAttachmentUrl } from '@/api';

interface IconEntry {
  name: string;
  component: ComponentType<LucideProps>;
}

const ICONS: IconEntry[] = [
  { name: 'bug', component: Bug },
  { name: 'check-square', component: CheckSquare },
  { name: 'book-open', component: BookOpen },
  { name: 'zap', component: Zap },
  { name: 'alert-triangle', component: AlertTriangle },
  { name: 'star', component: Star },
  { name: 'rocket', component: Rocket },
  { name: 'target', component: Target },
  { name: 'shield', component: Shield },
  { name: 'wrench', component: Wrench },
  { name: 'lightbulb', component: Lightbulb },
  { name: 'file-text', component: FileText },
  { name: 'code', component: Code },
  { name: 'database', component: Database },
  { name: 'globe', component: Globe },
  { name: 'lock', component: Lock },
  { name: 'eye', component: Eye },
  { name: 'refresh-cw', component: RefreshCw },
  { name: 'git-branch', component: GitBranch },
  { name: 'git-pull-request', component: GitPullRequest },
  { name: 'layers', component: Layers },
  { name: 'box', component: Box },
  { name: 'puzzle', component: Puzzle },
  { name: 'flame', component: Flame },
  { name: 'clock', component: Clock },
  { name: 'heart', component: Heart },
  { name: 'flag', component: Flag },
  { name: 'bookmark', component: Bookmark },
  { name: 'tag', component: Tag },
  { name: 'circle', component: Circle },
  { name: 'square', component: Square },
  { name: 'triangle', component: Triangle },
  { name: 'hexagon', component: Hexagon },
];

const ICON_MAP = new Map(ICONS.map((i) => [i.name, i.component]));

const COLOR_PRESETS = [
  '#6b7280', // gray
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
];

export function getIconComponent(name: string | null | undefined): ComponentType<LucideProps> | null {
  if (!name) return null;
  return ICON_MAP.get(name) ?? null;
}

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  color?: string;
  onColorChange?: (color: string) => void;
}

export function IconPicker({ value, onChange, color, onColorChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = search
    ? ICONS.filter((i) => i.name.includes(search.toLowerCase()))
    : ICONS;

  const SelectedIcon = getIconComponent(value);
  const iconStyle = color ? { color } : undefined;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm hover:bg-gray-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {SelectedIcon ? (
          <SelectedIcon className="h-4 w-4" style={iconStyle || { color: '#374151' }} />
        ) : (
          <Circle className="h-4 w-4 text-gray-300" />
        )}
        <span className="text-gray-700">{value || 'Choose icon...'}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {onColorChange && (
            <div className="mb-2 flex items-center gap-1">
              <span className="mr-1 text-xs text-gray-500">Color:</span>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorChange(c)}
                  className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-gray-800 ring-1 ring-gray-400' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              {color && (
                <button
                  type="button"
                  onClick={() => onColorChange('')}
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 hover:bg-gray-100"
                  title="Remove color"
                >
                  <X className="h-3 w-3 text-gray-400" />
                </button>
              )}
            </div>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icons..."
            className="mb-2 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
          <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
            {/* No icon option */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className={`flex items-center justify-center rounded-md p-2 hover:bg-gray-100 ${!value ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''}`}
              title="No icon"
            >
              <Circle className="h-4 w-4 text-gray-300" />
            </button>
            {filtered.map((icon) => {
              const Icon = icon.component;
              const isSelected = value === icon.name;
              return (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() => { onChange(icon.name); setOpen(false); setSearch(''); }}
                  className={`flex items-center justify-center rounded-md p-2 hover:bg-gray-100 ${isSelected ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''}`}
                  title={icon.name}
                >
                  <Icon className="h-4 w-4" style={iconStyle || { color: '#374151' }} />
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="py-2 text-center text-xs text-gray-400">No icons match</p>
          )}
        </div>
      )}
    </div>
  );
}

interface IssueTypeIconProps {
  icon?: string | null;
  iconColor?: string | null;
  iconAttachmentId?: string | null;
  className?: string;
}

export function IssueTypeIcon({ icon, iconColor, iconAttachmentId, className = 'h-4 w-4' }: IssueTypeIconProps) {
  if (iconAttachmentId) {
    return (
      <img
        src={getAttachmentUrl(iconAttachmentId)}
        alt=""
        className={`${className} rounded object-contain`}
      />
    );
  }

  const IconComp = getIconComponent(icon);
  if (!IconComp) return null;

  return <IconComp className={className} style={iconColor ? { color: iconColor } : { color: '#4b5563' }} />;
}
