import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
// 性能剖析：各模块 update 的 CPU 耗时 + 逐组隐藏场景对象看 GPU 节省。用法：node tools/profile.mjs [cam]
import { createServer } from './serve.mjs';
const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, protocolTimeout: 600000,
  defaultViewport: { width: 1920, height: 1080 }, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--disable-gpu-sandbox','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?shot=1&w=1920&h=1080&t=30&cam=${process.argv[2] || 'hero'}`);
await page.waitForFunction('window.__ready === true', { timeout: 300000 });
await page.evaluate(c => { window.__camName = c; }, process.argv[2] || 'hero');
const r = await page.evaluate(() => {
  const ctx = window.__ctx, R = ctx.renderer, gl = R.getContext(), px = new Uint8Array(4), cam = ctx.camera, scene = ctx.scene;
  window.__setCam(window.__camName);
  const T = (fn, n = 30) => { for (let i = 0; i < 3; i++) fn(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); const t0 = performance.now(); for (let i = 0; i < n; i++) { fn(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); } return +((performance.now() - t0) / n).toFixed(2); };
  // 每个模块 update 的耗时
  const per = {};
  for (const fn of ctx._updates) { const m = fn._module || '?'; const t0 = performance.now(); for (let i = 0; i < 30; i++) fn(1/60, 30 + i/60); per[m] = (per[m] || 0) + (performance.now() - t0) / 30; }
  for (const k in per) per[k] = +per[k].toFixed(2);
  const rt = window.__pipeline.rtScene;
  const sceneOnly = T(() => { R.setRenderTarget(rt); R.clear(); R.render(scene, cam); });
  // 按场景顶层子节点逐个隐藏，看 GPU 节省
  const groups = {};
  const tops = [];
  scene.traverse(o => { if (o.parent && (o.parent === ctx.staticRoot || o.parent === ctx.dynamicRoot || o.parent === scene) && (o.isMesh || o.isGroup || o.isPoints)) tops.push(o); });
  const byName = {};
  for (const o of tops) { const k = (o.name || o.material?.type || o.type).split(/[-_:]/)[0]; (byName[k] ||= []).push(o); }
  for (const [k, list] of Object.entries(byName)) {
    if (list.length && list.every(o => o === ctx.staticRoot || o === ctx.dynamicRoot)) continue;
    const vis = list.map(o => o.visible); list.forEach(o => { if (o !== ctx.staticRoot && o !== ctx.dynamicRoot) o.visible = false; });
    const t = T(() => { R.setRenderTarget(rt); R.clear(); R.render(scene, cam); }, 15);
    list.forEach((o, i) => o.visible = vis[i]);
    groups[k] = +(sceneOnly - t).toFixed(2);
  }
  return { sceneOnly, per, groups };
});
console.log('scene pass only (ms):', r.sceneOnly);
console.log('update per module (ms):', JSON.stringify(r.per));
const g = Object.entries(r.groups).sort((a,b)=>b[1]-a[1]).slice(0,25);
console.log('hide -> saved ms:'); for (const [k,v] of g) console.log('  ', k.padEnd(28), v);
await browser.close(); server.close();
