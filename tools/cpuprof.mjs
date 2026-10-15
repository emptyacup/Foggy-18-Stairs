// CPU 采样分析：真实 rAF 循环 5 秒，按函数自耗时排序前 30。用法：node tools/cpuprof.mjs
import puppeteer from 'puppeteer-core';
import { createServer } from './serve.mjs';
const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, protocolTimeout: 600000,
  defaultViewport: { width: 1920, height: 1080 }, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--disable-gpu-sandbox','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?shot=1&w=1920&h=1080&t=30&cam=hero`);
await page.waitForFunction('window.__ready === true', { timeout: 300000 });
await page.evaluate(() => window.__setCam('hero'));
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.evaluate(() => window.__loopFps(5));
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const counts = new Map();
profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
let total = 0;
for (const [id, t] of counts) { const n = byId.get(id); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'}  ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber}`; self.set(k, (self.get(k) || 0) + t); total += t; }
console.log('total sampled ms', (total / 1000).toFixed(0));
[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, t]) => console.log((t / 1000).toFixed(1).padStart(7), 'ms ', k));
await browser.close(); server.close();
