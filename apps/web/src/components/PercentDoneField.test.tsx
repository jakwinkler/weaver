import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PercentDoneField } from './PercentDoneField';

afterEach(cleanup);
describe('PercentDoneField', () => {
  it('commits once after dragging, including the subsequent blur', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<PercentDoneField value={0} disabled={false} onCommit={onCommit} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '10' } });
    fireEvent.change(slider, { target: { value: '20' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    fireEvent.blur(slider);
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(20);
  });

  it('shows a save failure and restores the saved value', async () => {
    render(
      <PercentDoneField
        value={10}
        disabled={false}
        onCommit={vi.fn().mockRejectedValue(new Error('offline'))}
      />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '40' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect((await screen.findByRole('alert')).textContent).toContain('Could not save');
    expect((slider as HTMLInputElement).value).toBe('10');
  });
});
