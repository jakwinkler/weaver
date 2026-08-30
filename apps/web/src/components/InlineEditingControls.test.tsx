import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineDatePicker } from './InlineDatePicker';
import { InlineSelect } from './InlineSelect';

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

describe('InlineSelect', () => {
  it('saves a selected option', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <InlineSelect
        value="medium"
        options={[
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ]}
        onSave={onSave}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('combobox'), {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: 'mouse',
    });
    const highOption = screen.getByRole('option', { name: 'High' });
    fireEvent.click(highOption);

    expect(onSave).toHaveBeenCalledWith('high');
  });

  it('renders no select affordance when editing is not allowed', () => {
    render(
      <InlineSelect
        value="medium"
        options={[{ value: 'medium', label: 'Medium' }]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        editable={false}
      />,
    );

    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('InlineDatePicker', () => {
  it('saves changed and cleared dates', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<InlineDatePicker value="2026-08-26" onSave={onSave} />);

    fireEvent.change(screen.getByDisplayValue('2026-08-26'), {
      target: { value: '2026-09-01' },
    });
    expect(onSave).toHaveBeenCalledWith('2026-09-01');
    await act(async () => {
      await Promise.resolve();
    });

    rerender(<InlineDatePicker value="2026-09-01" onSave={onSave} />);
    fireEvent.change(screen.getByDisplayValue('2026-09-01'), {
      target: { value: '' },
    });
    expect(onSave).toHaveBeenLastCalledWith(null);
  });

  it('renders a formatted value without a date input when editing is not allowed', () => {
    render(
      <InlineDatePicker
        value="2026-08-26"
        onSave={vi.fn().mockResolvedValue(undefined)}
        editable={false}
      />,
    );

    expect(screen.queryByDisplayValue('2026-08-26')).not.toBeInTheDocument();
    expect(screen.getByText(new Date(2026, 7, 26).toLocaleDateString())).toBeInTheDocument();
  });
});
