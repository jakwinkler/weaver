import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { apiClient } from '@/api/client';

export interface MentionUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
}

export const MentionList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  SuggestionProps<MentionUser>
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = useCallback(
    (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command({ id: item.id, label: item.displayName });
      }
    },
    [props],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) =>
          prev <= 0 ? props.items.length - 1 : prev - 1,
        );
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) =>
          prev >= props.items.length - 1 ? 0 : prev + 1,
        );
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="z-50 rounded-md border border-border bg-popover p-2 text-sm text-muted-foreground shadow-md">
        No users found
      </div>
    );
  }

  return (
    <div className="z-50 min-w-[200px] overflow-hidden rounded-md border border-border bg-popover shadow-md">
      {props.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
            index === selectedIndex
              ? 'bg-accent text-foreground'
              : 'text-foreground hover:bg-accent/50'
          }`}
          onClick={() => selectItem(index)}
        >
          {item.avatarUrl ? (
            <img
              src={item.avatarUrl}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {(item.displayName || item.email || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate font-medium">{item.displayName || item.email}</span>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';

// Debounce helper
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

export async function fetchMentionUsers(query: string): Promise<MentionUser[]> {
  if (searchTimeout) clearTimeout(searchTimeout);

  return new Promise((resolve) => {
    searchTimeout = setTimeout(async () => {
      try {
        const res = await apiClient.get<MentionUser[]>('/users/search', {
          params: { q: query },
        });
        resolve(res.data);
      } catch {
        resolve([]);
      }
    }, 200);
  });
}
