import { useState, useEffect, useRef, useCallback } from 'react';

type TimerStatus = 'idle' | 'running' | 'paused';

interface TimerState {
  status: TimerStatus;
  startedAt: number | null;
  accumulatedMs: number;
}

interface UseTimerReturn {
  status: TimerStatus;
  elapsedMs: number;
  start: () => void;
  pause: () => void;
  stop: () => number;
}

function storageKey(userId: string, issueKey: string) {
  return `weaver:timer:${userId}:${issueKey}`;
}

function loadState(userId: string, issueKey: string): TimerState {
  try {
    const raw = localStorage.getItem(storageKey(userId, issueKey));
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { status: 'idle', startedAt: null, accumulatedMs: 0 };
}

function saveState(userId: string, issueKey: string, state: TimerState) {
  localStorage.setItem(storageKey(userId, issueKey), JSON.stringify(state));
}

function clearState(userId: string, issueKey: string) {
  localStorage.removeItem(storageKey(userId, issueKey));
}

export function useTimerState(userId: string, issueKey: string): UseTimerReturn {
  const [state, setState] = useState<TimerState>(() => loadState(userId, issueKey));
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute elapsed ms
  const elapsedMs =
    state.status === 'running' && state.startedAt
      ? state.accumulatedMs + (now - state.startedAt)
      : state.accumulatedMs;

  // Persist state changes
  useEffect(() => {
    if (state.status === 'idle' && state.accumulatedMs === 0) {
      clearState(userId, issueKey);
    } else {
      saveState(userId, issueKey, state);
    }
  }, [state, userId, issueKey]);

  // Tick interval when running
  useEffect(() => {
    if (state.status === 'running') {
      intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.status]);

  const start = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'running',
      startedAt: Date.now(),
    }));
    setNow(Date.now());
  }, []);

  const pause = useCallback(() => {
    setState((prev) => {
      const elapsed = prev.startedAt ? Date.now() - prev.startedAt : 0;
      return {
        status: 'paused',
        startedAt: null,
        accumulatedMs: prev.accumulatedMs + elapsed,
      };
    });
  }, []);

  const stop = useCallback((): number => {
    let totalMs = 0;
    setState((prev) => {
      const elapsed = prev.status === 'running' && prev.startedAt ? Date.now() - prev.startedAt : 0;
      totalMs = prev.accumulatedMs + elapsed;
      return { status: 'idle', startedAt: null, accumulatedMs: 0 };
    });
    clearState(userId, issueKey);
    return totalMs;
  }, [userId, issueKey]);

  return { status: state.status, elapsedMs, start, pause, stop };
}
