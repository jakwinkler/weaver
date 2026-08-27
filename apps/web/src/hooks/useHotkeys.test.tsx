import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeysContext, type HotkeyBinding, type HotkeyContext, useHotkeys } from './useHotkeys';

function Harness({
  activeContext,
  bindings,
  context,
}: {
  activeContext: HotkeyContext;
  bindings: HotkeyBinding[];
  context: HotkeyContext;
}) {
  useHotkeys(bindings, { context });

  return (
    <HotkeysContext.Provider value={activeContext}>
      <input aria-label="Editable field" />
      <span>Shortcut harness</span>
    </HotkeysContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useHotkeys', () => {
  it('matches modifier keys and ignores unmodified presses', () => {
    const handler = vi.fn();

    render(
      <Harness
        activeContext="global"
        context="global"
        bindings={[{ keys: 'ctrl+shift+k', handler }]}
      />,
    );

    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'K', ctrlKey: true, shiftKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire while the user is typing', () => {
    const handler = vi.fn();

    render(<Harness activeContext="global" context="global" bindings={[{ keys: 'c', handler }]} />);

    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document.querySelector('input')!, { key: 'c' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('scopes contextual shortcuts to the active page context', () => {
    const handler = vi.fn();
    const bindings: HotkeyBinding[] = [{ keys: 'j', handler }];
    const { rerender } = render(
      <HotkeysContext.Provider value="board">
        <ContextualHarness bindings={bindings} />
      </HotkeysContext.Provider>,
    );

    fireEvent.keyDown(document, { key: 'j' });
    expect(handler).not.toHaveBeenCalled();

    rerender(
      <HotkeysContext.Provider value="list">
        <ContextualHarness bindings={bindings} />
      </HotkeysContext.Provider>,
    );
    fireEvent.keyDown(document, { key: 'j' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('matches key sequences within 500ms and expires incomplete sequences', () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    render(
      <Harness activeContext="global" context="global" bindings={[{ keys: 'g p', handler }]} />,
    );

    fireEvent.keyDown(document, { key: 'g' });
    vi.advanceTimersByTime(499);
    fireEvent.keyDown(document, { key: 'p' });
    expect(handler).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'g' });
    vi.advanceTimersByTime(501);
    fireEvent.keyDown(document, { key: 'p' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

function ContextualHarness({ bindings }: { bindings: HotkeyBinding[] }) {
  useHotkeys(bindings, { context: 'list' });
  return <span>Contextual harness</span>;
}
