import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EmailUnsubscribePage } from './EmailUnsubscribePage';

const { post } = vi.hoisted(() => ({
  post: vi.fn().mockResolvedValue({ data: { success: true } }),
}));

vi.mock('@/api', () => ({
  apiClient: { post },
}));

describe('EmailUnsubscribePage', () => {
  it('posts the signed token and confirms the preference change', async () => {
    render(
      <MemoryRouter initialEntries={['/unsubscribe?token=signed-token']}>
        <EmailUnsubscribePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/notifications/unsubscribe', {
        token: 'signed-token',
        'List-Unsubscribe': 'One-Click',
      });
    });
    expect(
      await screen.findByRole('heading', { name: 'You are unsubscribed' }),
    ).toBeInTheDocument();
  });
});
