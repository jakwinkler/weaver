// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchUsers } from '@/api/hooks-phase5';
import { MentionList } from './MentionSuggestion';

vi.mock('@/api/hooks-phase5', () => ({
  useSearchUsers: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MentionList', () => {
  it('shows tenant members for a bare @ and inserts the selected user', () => {
    vi.mocked(useSearchUsers).mockReturnValue({
      data: [
        {
          id: 'user-1',
          displayName: 'Alice Mention',
          email: 'alice@example.com',
          avatarUrl: '/avatars/alice.png',
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useSearchUsers>);
    const command = vi.fn();
    const props = {
      query: '',
      items: [],
      command,
    } as unknown as ComponentProps<typeof MentionList>;

    render(<MentionList {...props} />);

    const option = screen.getByRole('option', { name: 'Alice Mention' });
    expect(option).toBeTruthy();
    fireEvent.click(option);
    expect(command).toHaveBeenCalledWith({
      id: 'user-1',
      label: 'Alice Mention',
      avatarUrl: '/avatars/alice.png',
      email: 'alice@example.com',
    });
  });

  it('exposes a loading state while the debounced search is pending', () => {
    vi.mocked(useSearchUsers).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useSearchUsers>);
    const props = {
      query: 'ali',
      items: [],
      command: vi.fn(),
    } as unknown as ComponentProps<typeof MentionList>;

    render(<MentionList {...props} />);

    expect(screen.getByText('Searching people...')).toBeTruthy();
  });
});
