// 无头截图：用真实 GPU 渲染，存 PNG 供 Claude 用 Read 工具查看。
// 用法：
//   node tools/shot.mjs                         # 默认机位 hero
//   node tools/shot.mjs --cams hero,mid,up      # 多个预设机位（layout.CAMS）
//   node tools/shot.mjs --cams "0,30,-20,0,-0.3" # 自定义 x,y,z,yaw,pitch（y=0 贴地）
//   node tools/shot.mjs --only terrain,signs    # 只构建部分模块（隔离调试）
//   node tools/shot.mjs --out shots/signs --t 40 --w 1600 --h 900 --q high --rain 1
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer, ROOT } from './serve.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1]; if (!v || v.startsWith('--')) args[k] = true; else { args[k] = v; i++; } }
}
const W = +(args.w || 1280), H = +(args.h || 720);
const cams = String(args.cams || 'hero').split(/[;|]/).flatMap(s => (/^[a-z]/i.test(s) ? s.split(',') : [s])).filter(Boolean);
const out = args.out || 'shots/shot';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = process.env.BROWSER || BROWSERS.find(p => fs.existsSync(p));
if (!exe) { console.error('找不到 Edge/Chrome，可用环境变量 BROWSER 指定'); process.exit(1); }

const server = createServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const logs = [];
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: exe, headless: true, protocolTimeout: 300000,
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    args: [`--window-size=${W},${H}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
      '--disable-gpu-sandbox', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url()}`));
  const p = new URLSearchParams({ shot: '1', w: W, h: H, t: args.t || 30, q: args.q || 'high', cam: cams[0] });
  if (args.only) p.set('only', args.only);
  if (args.rain) p.set('rain', args.rain);
  if (args.post) p.set('post', args.post);
  if (args.qs) for (const [k, v] of new URLSearchParams(args.qs)) p.set(k, v);   // 任意额外参数：--qs "bloom=0&exposure=1.2"
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html?${p}`);
  await page.waitForFunction('window.__ready === true || (window.__errors && window.__errors.fatal)', { timeout: 280000, polling: 250 });
  const info = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', stats: window.__stats, errors: window.__errors };
  });
  console.log(`GPU: ${info.gpu}`);
  console.log(`build ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  fs.mkdirSync(path.dirname(path.resolve(ROOT, out)), { recursive: true });
  for (let i = 0; i < cams.length; i++) {
    const c = cams[i];
    const spec = /^[a-z]/i.test(c) ? c : c.split(',').map(Number);
    const r = await page.evaluate(s => {
      window.__setCam(s);
      const ri = window.__pipeline.info;
      return { draws: ri.calls, tris: ri.triangles };
    }, spec);
    // 再等两帧，确保 GPU 完成
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const name = cams.length > 1 ? `${out}_${/^[a-z]/i.test(c) ? c : i}.png` : `${out}.png`;
    const file = path.resolve(ROOT, name);
    await page.screenshot({ path: file });
    console.log(`saved ${path.relative(ROOT, file)}  cam=${c}  draws=${r.draws}  tris=${(r.tris / 1e6).toFixed(2)}M`);
  }
  const s = info.stats;
  console.log('modules:', Object.entries(s.modules).map(([k, v]) => `${k} ${v.ms}ms ${(v.tris / 1000).toFixed(0)}k`).join(' | '));
  console.log(`batch: ${JSON.stringify(s.batch)}  lights=${s.lights} halos=${s.halos} texMpx=${(s.texPixels / 1e6).toFixed(1)}`);
  if (info.errors.length) { console.log('MODULE ERRORS:'); info.errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
} catch (e) {
  console.error('SHOT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (logs.length) { console.log(`page logs (${logs.length}):`); logs.slice(0, 60).forEach(l => console.log('  ' + l)); }
  if (logs.some(l => /^\[(error|pageerror|requestfailed)\]/.test(l))) process.exitCode = 1;
  await browser?.close();
  server.close();
}
