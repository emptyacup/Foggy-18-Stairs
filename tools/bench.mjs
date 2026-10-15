// GPU 帧时间基准：真实显卡、headless Edge。每个机位跑 N 帧，再逐项关闭后处理看各 pass 开销。
// 用法：node tools/bench.mjs [--cams hero,terrace,vista] [--w 1920 --h 1080] [--n 60] [--q high] [--qs "day=1"]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from './serve.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const v = process.argv[i + 1]; if (!v || v.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = v; i++; } }
}
const W = +(args.w || 1920), H = +(args.h || 1080), N = +(args.n || 60);
const cams = String(args.cams || 'hero,terrace,vista').split(',');
const exe = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));

const server = createServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({
  executablePath: exe, headless: true, protocolTimeout: 600000,
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: [`--window-size=${W},${H}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--no-first-run', '--disable-extensions'],
});
try {
  const page = await browser.newPage();
  const p = new URLSearchParams({ shot: '1', w: W, h: H, t: 30, q: args.q || 'high' });
  if (args.qs) for (const [k, v] of new URLSearchParams(args.qs)) p.set(k, v);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?${p}`);
  await page.waitForFunction('window.__ready === true', { timeout: 300000, polling: 250 });
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
  });
  console.log(`GPU: ${gpu}   ${W}x${H}  q=${args.q || 'high'}  ${N} 帧/项`);
  const variants = [
    ['完整', {}],
    ['关 SSR', { ssr: false }],
    ['关 Bloom', { bloom: 0 }],
  ];
  for (const cam of cams) {
    const lf = await page.evaluate(async c => { window.__setCam(c); return await window.__loopFps(4); }, cam);
    console.log(`${cam.padEnd(9)} 真实循环  ${lf.fps} fps  avg ${lf.avg} ms  p95 ${lf.p95} ms  (${lf.frames} 帧)`);
    for (const [label, over] of variants) {
      const r = await page.evaluate((cam, over, n) => {
        const P = window.__pipeline.params, saved = { ...P };
        Object.assign(P, over);
        window.__setCam(cam);
        const res = window.__bench(n);
        Object.assign(P, saved);
        return res;
      }, cam, over, N);
      console.log(`${cam.padEnd(9)} ${label.padEnd(8)} avg ${String(r.avg).padStart(6)} ms  p95 ${String(r.p95).padStart(6)} ms  ≈${Math.round(1000 / r.avg)} fps   draws ${r.draws}  tris ${(r.tris / 1e6).toFixed(2)}M`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
