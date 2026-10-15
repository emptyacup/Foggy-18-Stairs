// 日夜按钮、雨水诊断和实际浏览器控制验收；沿用 shot.mjs 的 GPU 启动方式。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createServer } from './serve.mjs';

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const server = createServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
const errors = [];
try {
  browser = await puppeteer.launch({ executablePath: exe, headless: true, protocolTimeout: 300000,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-first-run', '--disable-extensions'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(base + '?q=high&t=50');
  await page.waitForFunction('document.querySelector("#loading")?.classList.contains("done")', { timeout: 280000 });
  const before = await page.evaluate(() => ({ fog: window.__ctx.scene.fog.color.getHex(), day: window.__ctx.shared.uDaylight.value, pos: window.__ctx.playerObj.pos.toArray(), fly: window.__ctx.playerObj.fly }));
  assert.equal(before.day, 0);
  assert.equal(before.fly, false, '进入场景默认步行，可用 F 切换飞行');
  await page.click('#daylight');
  const day = await page.evaluate(() => ({ fog: window.__ctx.scene.fog.color.getHex(), day: window.__ctx.shared.uDaylight.value, pos: window.__ctx.playerObj.pos.toArray(), label: document.querySelector('#daylight').textContent,
    density: window.__ctx.scene.fog.density, haloDensity: window.__ctx.halos.mesh.material.uniforms.fogDensity.value }));
  assert.equal(day.day, 1); assert.notEqual(day.fog, before.fog); assert.deepEqual(day.pos, before.pos); assert.equal(day.label, '切换夜景');
  assert.equal(day.haloDensity, day.density);
  await page.click('#daylight');
  assert.equal(await page.evaluate(() => window.__ctx.scene.fog.color.getHex()), before.fog);
  await page.click('#explore');
  assert.equal(await page.evaluate(() => document.querySelector('#routes').hidden), false);
  await page.click('#explore');
  assert.equal(await page.evaluate(() => document.querySelector('#routes').hidden), true);
  console.log('Browser day/night and route controls OK');

  if (!process.argv.includes('--controls-only')) {
  await page.goto(base + '?shot=1&day=1&cam=backstreet&t=50&nan=1');
  await page.waitForFunction('window.__ready', { timeout: 280000 });
  fs.mkdirSync('shots/codex', { recursive: true });
  await page.screenshot({ path: 'shots/codex/rain-nan.png' });
  await page.evaluate(() => { window.__ctx.scene.getObjectByName('rain').visible = false; window.__setCam('backstreet'); });
  await page.screenshot({ path: 'shots/codex/rain-hidden.png' });
  await page.evaluate(() => { window.__ctx.scene.getObjectByName('rain').visible = true; window.__pipeline.params.ssr = 0; window.__pipeline.params.bloom = 0; window.__setCam('backstreet'); });
  await page.screenshot({ path: 'shots/codex/rain-no-effects.png' });
  const rainPixels = await page.evaluate(async () => {
    const { DataUtils } = await import('three');
    const c = window.__ctx, p = window.__pipeline, rain = c.scene.getObjectByName('rain');
    const width = p.rtScene.width, height = Math.min(360, p.rtScene.height), y = p.rtScene.height - height;
    const withRain = new Uint16Array(width * height * 4), withoutRain = new Uint16Array(withRain.length);
    c.renderer.readRenderTargetPixels(p.rtScene, 0, y, width, height, withRain);
    rain.visible = false; window.__setCam('backstreet');
    c.renderer.readRenderTargetPixels(p.rtScene, 0, y, width, height, withoutRain);
    let darker = 0, minimum = 0;
    for (let i = 0; i < withRain.length; i += 4) {
      const delta = DataUtils.fromHalfFloat(withRain[i]) - DataUtils.fromHalfFloat(withoutRain[i]);
      if (delta < -0.005) darker++; minimum = Math.min(minimum, delta);
    }
    rain.visible = true;
    window.__setCam('backstreet');
    return { darker, minimum };
  });
  console.log('HDR rain pixel comparison:', rainPixels);
  assert.equal(rainPixels.darker, 0, '加法雨丝不能降低 HDR 背景亮度');
  await page.screenshot({ path: 'shots/codex/rain-clamped.png' });
  await page.goto(base + '?shot=1&day=1&cam=backstreet&t=50&post=0');
  await page.waitForFunction('window.__ready', { timeout: 280000 });
  await page.screenshot({ path: 'shots/codex/rain-direct.png' });
  }
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('Browser shader errors: 0');
} finally {
  await browser?.close();
  server.close();
}
