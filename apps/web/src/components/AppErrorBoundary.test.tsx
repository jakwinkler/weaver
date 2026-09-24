import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps recovery controls visible after a child render failure', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  function Broken(): never {
    throw new Error('synthetic render failure');
  }
  render(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
  );
  expect(screen.getByRole('alert').textContent).toContain('couldn’t be displayed');
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Go to dashboard' }).getAttribute('href')).toBe('/');
});
