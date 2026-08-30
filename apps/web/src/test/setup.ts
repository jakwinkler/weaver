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
