import { createContext, useContext, useEffect, useRef } from 'react';

export type HotkeyContext = 'global' | 'list' | 'board' | 'detail';

export interface HotkeyBinding {
  keys: string;
  handler: (event: KeyboardEvent) => void;
  enabled?: boolean;
  preventDefault?: boolean;
  allowInEditable?: boolean;
  allowInInteractive?: boolean;
}

export interface UseHotkeysOptions {
  context?: HotkeyContext;
  enabled?: boolean;
  ignoreInteractiveElements?: boolean;
  sequenceTimeout?: number;
}

interface ParsedStroke {
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  mod: boolean;
  shift: boolean;
}

interface SequenceCandidate {
  binding: HotkeyBinding;
  strokes: ParsedStroke[];
}

interface PendingSequence {
  candidates: SequenceCandidate[];
  index: number;
}

export const HotkeysContext = createContext<HotkeyContext>('global');

export function getHotkeyContext(pathname: string): HotkeyContext {
  if (/^\/issues\/[^/]+/.test(pathname)) return 'detail';
  if (/^\/projects\/[^/]+\/issues(?:\/|$)/.test(pathname)) return 'list';
  if (/^\/projects\/[^/]+\/(?:board|sprints)(?:\/|$)/.test(pathname)) return 'board';
  return 'global';
}

function normalizeKey(key: string): string {
  if (key === ' ') return 'space';
  return key.toLowerCase();
}

function parseStroke(value: string): ParsedStroke {
  const parts = value
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const key = parts.at(-1) ?? '';

  return {
    key: normalizeKey(key),
    alt: parts.includes('alt'),
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
  };
}

function parseBinding(binding: HotkeyBinding): SequenceCandidate {
  return {
    binding,
    strokes: binding.keys.split(/\s+/).filter(Boolean).map(parseStroke),
  };
}

function matchesStroke(event: KeyboardEvent, stroke: ParsedStroke): boolean {
  if (normalizeKey(event.key) !== stroke.key) return false;
  if (stroke.mod) {
    if (!event.ctrlKey && !event.metaKey) return false;
  } else if (event.ctrlKey !== stroke.ctrl || event.metaKey !== stroke.meta) {
    return false;
  }
  if (event.altKey !== stroke.alt) return false;
  if (stroke.shift && !event.shiftKey) return false;

  // Shift is inherent in punctuation such as "?", but an unmodified letter
  // shortcut should not also fire for Shift plus that letter.
  if (!stroke.shift && /^[a-z0-9]$/.test(stroke.key) && event.shiftKey) return false;
  return true;
}

function eventTargetElement(event: KeyboardEvent): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function isEditableTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function isInteractiveTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      'button, a[href], input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="button"], [role="checkbox"], [role="menuitem"], [role="option"], [role="textbox"]',
    ),
  );
}

export function useHotkeys(bindings: HotkeyBinding[], options: UseHotkeysOptions = {}) {
  const activeContext = useContext(HotkeysContext);
  const bindingsRef = useRef(bindings);
  const pendingRef = useRef<PendingSequence | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  bindingsRef.current = bindings;

  const context = options.context ?? 'global';
  const enabled = options.enabled ?? true;
  const ignoreInteractiveElements = options.ignoreInteractiveElements ?? false;
  const sequenceTimeout = options.sequenceTimeout ?? 500;
  const contextIsActive = context === 'global' || context === activeContext;

  useEffect(() => {
    if (!enabled || !contextIsActive) return;

    const clearPending = () => {
      pendingRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleExpiry = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(clearPending, sequenceTimeout);
    };

    const bindingCanHandleTarget = (binding: HotkeyBinding, target: Element | null) => {
      if (isEditableTarget(target) && !binding.allowInEditable) return false;
      if (ignoreInteractiveElements && isInteractiveTarget(target) && !binding.allowInInteractive) {
        return false;
      }
      return true;
    };

    const runBinding = (binding: HotkeyBinding, event: KeyboardEvent) => {
      if (binding.preventDefault !== false) event.preventDefault();
      binding.handler(event);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      const target = eventTargetElement(event);
      const candidates = bindingsRef.current
        .filter((binding) => binding.enabled !== false)
        .filter((binding) => bindingCanHandleTarget(binding, target))
        .map(parseBinding)
        .filter((candidate) => candidate.strokes.length > 0);

      const pending = pendingRef.current;
      if (pending) {
        const matches = pending.candidates.filter((candidate) =>
          matchesStroke(event, candidate.strokes[pending.index]),
        );
        clearPending();

        if (matches.length > 0) {
          const completed = matches.find(
            (candidate) => candidate.strokes.length === pending.index + 1,
          );
          if (completed) {
            runBinding(completed.binding, event);
          } else {
            pendingRef.current = { candidates: matches, index: pending.index + 1 };
            if (matches.some(({ binding }) => binding.preventDefault !== false)) {
              event.preventDefault();
            }
            scheduleExpiry();
          }
          return;
        }
      }

      const single = candidates.find(
        (candidate) => candidate.strokes.length === 1 && matchesStroke(event, candidate.strokes[0]),
      );
      if (single) {
        runBinding(single.binding, event);
        return;
      }

      const sequenceStarts = candidates.filter(
        (candidate) => candidate.strokes.length > 1 && matchesStroke(event, candidate.strokes[0]),
      );
      if (sequenceStarts.length > 0) {
        pendingRef.current = { candidates: sequenceStarts, index: 1 };
        if (sequenceStarts.some(({ binding }) => binding.preventDefault !== false)) {
          event.preventDefault();
        }
        scheduleExpiry();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearPending();
    };
  }, [contextIsActive, enabled, ignoreInteractiveElements, sequenceTimeout]);
}
