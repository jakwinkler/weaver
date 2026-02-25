import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutEntry {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  label: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Global',
    shortcuts: [
      { keys: '?', description: 'Show keyboard shortcuts help' },
      { keys: 'c', description: 'Create new issue' },
      { keys: 'g p', description: 'Go to projects' },
      { keys: 'g d', description: 'Go to dashboard' },
      { keys: 'g s', description: 'Go to search' },
      { keys: '/', description: 'Focus search input' },
      { keys: 'Escape', description: 'Close any open modal' },
    ],
  },
  {
    label: 'Issue List',
    shortcuts: [
      { keys: 'j', description: 'Move focus down' },
      { keys: 'k', description: 'Move focus up' },
      { keys: 'Enter', description: 'Open focused issue' },
    ],
  },
  {
    label: 'Issue Detail',
    shortcuts: [
      { keys: 'a', description: 'Open assignee picker' },
      { keys: 's', description: 'Open status transition menu' },
    ],
  },
];

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [chordPrefix, setChordPrefix] = useState<string | null>(null);
  const [chordTimeout, setChordTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const clearChord = useCallback(() => {
    setChordPrefix(null);
    if (chordTimeout) {
      clearTimeout(chordTimeout);
      setChordTimeout(null);
    }
  }, [chordTimeout]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      const isEditable = target.isContentEditable;

      if (e.key === 'Escape') {
        setShowHelp(false);
        clearChord();
        return;
      }

      if (isInput || isEditable) {
        return;
      }

      if (chordPrefix === 'g') {
        clearChord();
        if (e.key === 'p') {
          e.preventDefault();
          navigate('/projects');
          return;
        }
        if (e.key === 'd') {
          e.preventDefault();
          navigate('/dashboard');
          return;
        }
        if (e.key === 's') {
          e.preventDefault();
          navigate('/search');
          return;
        }
        return;
      }

      if (e.key === 'g') {
        e.preventDefault();
        setChordPrefix('g');
        const timeout = setTimeout(() => {
          setChordPrefix(null);
        }, 1000);
        setChordTimeout(timeout);
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      if (e.key === 'c') {
        e.preventDefault();
        const match = window.location.pathname.match(/\/projects\/([^/]+)/);
        if (match) {
          navigate(`/projects/${match[1]}/issues`);
        } else {
          navigate('/projects');
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          '[data-shortcut-search]',
        );
        if (searchInput) {
          searchInput.focus();
        } else {
          navigate('/search');
        }
        return;
      }
    },
    [chordPrefix, clearChord, navigate],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    return () => {
      if (chordTimeout) {
        clearTimeout(chordTimeout);
      }
    };
  }, [chordTimeout]);

  if (!showHelp) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShowHelp(false)}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </h3>
              <table className="w-full">
                <tbody className="divide-y divide-gray-100">
                  {group.shortcuts.map((shortcut) => (
                    <tr key={shortcut.keys}>
                      <td className="py-2 pr-4">
                        <div className="flex gap-1">
                          {shortcut.keys.split(' ').map((key, i) => (
                            <span key={i}>
                              {i > 0 && (
                                <span className="mx-1 text-xs text-gray-400">then</span>
                              )}
                              <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                                {key}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 text-sm text-gray-600">{shortcut.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-400">
            Press <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-mono text-xs">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
