import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsDialog } from './ShortcutsDialog';

Object.defineProperty(Element.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
Object.defineProperty(Element.prototype, 'setPointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

afterEach(() => {
  cleanup();
});

describe('ShortcutsDialog', () => {
  it('lists shortcuts by global, issue, and board context', () => {
    render(<ShortcutsDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Issue list' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Issue detail' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByText('Toggle focused issue selection')).toBeInTheDocument();
    expect(screen.getByText('Move between cards')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onOpenChange = vi.fn();
    render(<ShortcutsDialog open onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
