import { transferableAbortController } from 'node:util';

// jsdom supplies its own AbortSignal, while Node supplies Request. Bridge those
// realms so router navigation tests retain real cancellation on Node 24/26.
const NativeRequest = globalThis.Request;
if (NativeRequest) {
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (!init?.signal) {
        super(input, init);
        return;
      }
      const controller = transferableAbortController();
      if (init.signal.aborted) controller.abort(init.signal.reason);
      else
        init.signal.addEventListener('abort', () => controller.abort(init.signal?.reason), {
          once: true,
        });
      super(input, { ...init, signal: controller.signal });
    }
  };
}

if (!globalThis.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }

  Object.defineProperty(globalThis, 'PointerEvent', {
    configurable: true,
    value: PointerEventPolyfill,
  });
}

if (typeof window !== 'undefined' && !window.localStorage) {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}
