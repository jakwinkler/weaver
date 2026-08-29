import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SortableHeader } from './SortableHeader';

describe('SortableHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('cycles a column through ascending, descending, and unsorted', () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Summary"
              field="summary"
              currentSort={null}
              currentDirection={null}
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );

    fireEvent.click(screen.getByRole('columnheader', { name: 'Summary' }));
    expect(onSort).toHaveBeenLastCalledWith('summary', 'asc');

    rerender(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Summary"
              field="summary"
              currentSort="summary"
              currentDirection="asc"
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );
    fireEvent.click(screen.getByRole('columnheader', { name: 'Summary' }));
    expect(onSort).toHaveBeenLastCalledWith('summary', 'desc');

    rerender(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Summary"
              field="summary"
              currentSort="summary"
              currentDirection="desc"
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );
    fireEvent.click(screen.getByRole('columnheader', { name: 'Summary' }));
    expect(onSort).toHaveBeenLastCalledWith('summary', null);
  });
});
