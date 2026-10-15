// Node 里没有 DOM / Canvas：给模块提供一个"什么都不画"的假 canvas，让 build(ctx) 能跑通。
const noop = () => {};
function fakeCtx2d(canvas) {
  const target = {
    canvas,
    measureText: s => ({ width: String(s).length * 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
export function installDomStub() {
  const mkCanvas = () => {
    const c = { width: 300, height: 150, style: {}, addEventListener: noop };
    c.getContext = () => fakeCtx2d(c);
    return c;
  };
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: tag => (tag === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, addEventListener: noop }),
    createElementNS: (ns, tag) => mkCanvas(),
    addEventListener: noop, body: { appendChild: noop },
  };
  globalThis.Image = class { constructor() { this.width = 1; this.height = 1; } };
  globalThis.requestAnimationFrame = noop;
  globalThis.addEventListener = noop;
}
