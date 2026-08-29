// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MentionChip } from './MentionNode';

vi.mock('./UserAvatar', () => ({
  UserAvatar: ({ user }: { user: { displayName: string; avatarUrl?: string } }) => (
    <img src={user.avatarUrl} alt={user.displayName} />
  ),
}));

afterEach(cleanup);

describe('MentionChip', () => {
  it('renders an avatar-aware, identifiable mention chip', () => {
    const { container } = render(
      <MentionChip id="user-1" label="Alice Mention" avatarUrl="/avatars/alice.png" />,
    );

    expect(screen.getByText('@Alice Mention')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Alice Mention' }).getAttribute('src')).toContain(
      '/avatars/alice.png',
    );
    expect(container.firstElementChild?.getAttribute('data-user-id')).toBe('user-1');
  });
});
