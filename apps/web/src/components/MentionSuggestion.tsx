import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { useSearchUsers } from '@/api/hooks-phase5';
import { UserAvatar } from './UserAvatar';

export interface MentionUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
}

const EMPTY_MENTION_USERS: MentionUser[] = [];

export const MentionList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  SuggestionProps<MentionUser>
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { data, isLoading } = useSearchUsers(props.query);
  const users = data ?? EMPTY_MENTION_USERS;

  const selectItem = useCallback(
    (index: number) => {
      const item = users[index];
      if (item) {
        props.command({
          id: item.id,
          label: item.displayName || item.email,
          email: item.email,
          avatarUrl: item.avatarUrl ?? null,
        });
      }
    },
    [props.command, users],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [users]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev <= 0 ? users.length - 1 : prev - 1));
        return users.length > 0;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev >= users.length - 1 ? 0 : prev + 1));
        return users.length > 0;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return users.length > 0;
      }
      return false;
    },
  }));

  if (isLoading) {
    return (
      <div
        role="status"
        className="min-w-52 rounded-md border border-border bg-popover px-3 py-2 text-sm text-foreground shadow-md"
      >
        Searching people...
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div
        role="status"
        className="min-w-52 rounded-md border border-border bg-popover px-3 py-2 text-sm text-foreground shadow-md"
      >
        No matching people
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Mention a person"
      className="min-w-56 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md"
    >
      {users.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          aria-label={item.displayName || item.email}
          className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm outline-none ${
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/60 focus-visible:bg-accent'
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => selectItem(index)}
        >
          <UserAvatar
            user={{ ...item, avatarUrl: item.avatarUrl ?? undefined }}
            size="sm"
            className="h-6 w-6 shrink-0 text-[10px]"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.displayName || item.email}</span>
            {item.displayName ? (
              <span className="block truncate text-xs text-muted-foreground">{item.email}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
