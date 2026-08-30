import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredPerPage, Pagination } from './Pagination';

const storedValues = new Map<string, string>();

vi.stubGlobal('localStorage', {
  clear: () => storedValues.clear(),
  getItem: (key: string) => storedValues.get(key) ?? null,
  removeItem: (key: string) => storedValues.delete(key),
  setItem: (key: string, value: string) => storedValues.set(key, value),
});

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

describe('Pagination', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the result range and navigates by page number', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        page={5}
        perPage={25}
        total={242}
        totalPages={10}
        onPageChange={onPageChange}
        onPerPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Showing 101-125 of 242')).toBeInTheDocument();
    expect(screen.getAllByText('...')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '6' }));
    expect(onPageChange).toHaveBeenCalledWith(6);
  });

  it('persists a selected page size', () => {
    const onPerPageChange = vi.fn();

    render(
      <Pagination
        page={1}
        perPage={10}
        total={42}
        totalPages={5}
        onPageChange={vi.fn()}
        onPerPageChange={onPerPageChange}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('combobox'), {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: 'mouse',
    });
    const fiftyOption = screen.getByRole('option', { name: '50' });
    fireEvent.click(fiftyOption);

    expect(onPerPageChange).toHaveBeenCalledWith(50);
    expect(getStoredPerPage()).toBe(50);
  });
});
