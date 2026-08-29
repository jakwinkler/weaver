import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableCell } from './EditableCell';

afterEach(() => {
  cleanup();
});

describe('EditableCell', () => {
  it('saves on Enter and shows progress while the save is pending', async () => {
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<EditableCell value="Original summary" onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Original summary' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated summary' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('Updated summary');
    expect(screen.getByLabelText('Saving')).toBeInTheDocument();

    resolveSave?.();
    await waitFor(() => {
      expect(screen.queryByLabelText('Saving')).not.toBeInTheDocument();
    });
  });

  it('reverts the draft on Escape without saving', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<EditableCell value="Original summary" onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Original summary' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Discarded summary' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Original summary' })).toBeInTheDocument();
  });

  it('saves once and moves focus to the next editable cell on Tab', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <table>
        <tbody>
          <tr>
            <td>
              <EditableCell value="Original summary" onSave={onSave} />
            </td>
            <td>
              <button type="button" data-inline-editable-focus>
                Next editable cell
              </button>
            </td>
          </tr>
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Original summary' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated summary' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Next editable cell' })).toHaveFocus();
    });
  });

  it('saves once and moves focus to the previous editable cell on Shift+Tab', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <table>
        <tbody>
          <tr>
            <td>
              <button type="button" data-inline-editable-focus>
                Previous editable cell
              </button>
            </td>
            <td>
              <EditableCell value="Original summary" onSave={onSave} />
            </td>
          </tr>
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Original summary' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated summary' } });
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Previous editable cell' })).toHaveFocus();
    });
  });

  it('saves once on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<EditableCell value="Original summary" onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Original summary' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated summary' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('Updated summary');
    });
  });

  it('renders a non-interactive value when editing is not allowed', () => {
    render(
      <EditableCell
        value="Read-only summary"
        onSave={vi.fn().mockResolvedValue(undefined)}
        editable={false}
      />,
    );

    expect(screen.getByText('Read-only summary')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
