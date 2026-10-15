// 启动：渲染器 → 天空 → ctx → 按 layout.MODULES 顺序构建模块 → 合批 → 主循环
import * as THREE from 'three';
import * as L from './world/layout.js';
import { createContext, QUALITY } from './core/ctx.js';
import { createSky } from './core/sky.js';
import { Pipeline } from './core/post.js';
import { Player } from './core/player.js';
import { batchStatic } from './core/batch.js';
import { Ambience } from './core/audio.js';
import { LIGHTING } from './core/palette.js';

const qs = new URLSearchParams(location.search);
const SHOT = qs.has('shot');
const qName = qs.get('q') || (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
const quality = { name: qName, ...(QUALITY[qName] || QUALITY.high) };
const errors = (window.__errors = []);
const stats = (window.__stats = { modules: {} });

const $ = s => document.querySelector(s);
const setProgress = (k, label) => {
  const bar = $('#bar'); if (bar) bar.style.width = (k * 100).toFixed(0) + '%';
  const lb = $('#label'); if (lb) lb.textContent = label;
};

// ------------------------------------------------------------ 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const W = SHOT ? +(qs.get('w') || 1280) : innerWidth;
const H = SHOT ? +(qs.get('h') || 720) : innerHeight;
renderer.setPixelRatio(SHOT ? 1 : Math.min(devicePixelRatio, quality.pixelRatio));
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, W / H, 0.2, 2200);
const audio = new Ambience();
const ctx = createContext({ scene, camera, renderer, quality, audio });
window.__ctx = ctx;
ctx.shared.uDaylight.value = qs.get('day') === '1' ? 1 : 0;
if (qs.has('rain')) ctx.shared.uRain.value = +qs.get('rain');
const sky = createSky(scene, ctx.shared);
ctx.sky = sky;
const pipeline = new Pipeline(renderer, quality, ctx.shared);
window.__pipeline = pipeline;
const lightingKeys = ['exposure', 'bloom', 'ca', 'grain', 'vignette'];
const initialLight = ctx.shared.uDaylight.value ? LIGHTING.day : LIGHTING.night;
for (const key of lightingKeys) pipeline.params[key] = initialLight[key];
if (!qs.has('rain')) ctx.shared.uRain.value = initialLight.rain;
for (const k of Object.keys(pipeline.params)) if (qs.has(k)) pipeline.params[k] = +qs.get(k);   // 调参：?bloom=0&exposure=1.2
function setDaylight(day) {
  const p = sky.setDaylight(day);
  for (const key of lightingKeys) pipeline.params[key] = p[key];
  if (!qs.has('rain')) ctx.shared.uRain.value = p.rain;
  const button = $('#daylight');
  if (button) { button.textContent = day ? '切换夜景' : '阴雨白天'; button.setAttribute('aria-pressed', String(!!day)); }
  const url = new URL(location.href);
  if (day) url.searchParams.set('day', '1'); else url.searchParams.delete('day');
  history.replaceState(null, '', url);
  if (window.__ready) { step(0); renderOnce(); }
}
window.__setDaylight = setDaylight;
$('#daylight')?.addEventListener('click', () => setDaylight(!ctx.shared.uDaylight.value));
$('#explore')?.addEventListener('click', () => {
  const routes = $('#routes');
  routes.hidden = !routes.hidden;
  $('#explore').setAttribute('aria-expanded', String(!routes.hidden));
});
if ($('#daylight')) {
  $('#daylight').textContent = ctx.shared.uDaylight.value ? '切换夜景' : '阴雨白天';
  $('#daylight').setAttribute('aria-pressed', String(!!ctx.shared.uDaylight.value));
}
// 动态分辨率：只缩放后处理管线的内部渲染尺寸（画布不变，最后一步放大到屏幕）。?dynres=0 关闭
let resScale = 1;
const DYNRES = !SHOT && qs.get('dynres') !== '0';
window.__resScale = () => resScale;
const resize = () => {
  const w = SHOT ? W : innerWidth, h = SHOT ? H : innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio() * resScale;
  pipeline.setSize(Math.floor(w * pr), Math.floor(h * pr));
};
resize();
if (!SHOT) addEventListener('resize', resize);

const player = new Player(camera, renderer.domElement, ctx.physics, { eye: L.EYE, enabled: !SHOT });
ctx.playerObj = player;

// ------------------------------------------------------------ 构建模块
function countTris(root) {
  let t = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    t += n * (o.isInstancedMesh ? o.count : 1);
  });
  return t;
}

async function buildWorld() {
  const only = qs.get('only');
  const list = only ? only.split(',').filter(Boolean) : L.MODULES;
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    setProgress(i / (list.length + 1), `正在搭建 ${name} …`);
    await new Promise(r => setTimeout(r, 0));
    const t0 = performance.now();
    const tri0 = countTris(ctx.staticRoot) + countTris(ctx.dynamicRoot);
    ctx._module = name;
    try {
      const mod = await import(`./world/${name}.js`);
      if (typeof mod.build !== 'function') throw new Error('module has no build(ctx) export');
      await mod.build(ctx);
    } catch (e) {
      console.error(`[module ${name}]`, e);
      errors.push(`${name}: ${e.message}`);
    }
    ctx._module = null;
    stats.modules[name] = {
      ms: Math.round(performance.now() - t0),
      tris: countTris(ctx.staticRoot) + countTris(ctx.dynamicRoot) - tri0,
    };
  }
  setProgress(0.95, '合并几何体 …');
  await new Promise(r => setTimeout(r, 0));
  const wm = ctx.wires.build(); if (wm) ctx.staticRoot.add(wm);
  const hm = ctx.halos.build();
  if (hm) { hm.material.uniforms.fogDensity.value = scene.fog.density; scene.add(hm); }
  stats.batch = batchStatic(ctx.staticRoot, { mat: ctx.mat });
  stats.lights = ctx.lights.list.length;
  stats.halos = ctx.halos.items.length;
  stats.texPixels = ctx.tex.pixels;
  const shelters = (ctx.use('rainShelters') || []).slice(0, ctx.shared.uDryAreas.value.length);
  ctx.shared.uDryCount.value = shelters.length;
  shelters.forEach((s, i) => ctx.shared.uDryAreas.value[i].set(s.x0, Math.min(s.z0, s.z1), s.x1, Math.max(s.z0, s.z1)));
  sky.setDaylight(ctx.shared.uDaylight.value > 0.5);
  renderer.compile(scene, camera);
}

// ------------------------------------------------------------ 相机
function setCam(spec) {
  let a = spec;
  if (typeof spec === 'string') a = L.CAMS[spec] || spec.split(',').map(Number);
  if (a.length === 4) a = [a[0], 0, a[1], a[2], a[3]];
  const [x, y, z, yaw, pitch] = a;
  if (!y) player.place(x, null, z, yaw, pitch); else player.place(x, y, z, yaw, pitch);
  camera.updateMatrixWorld();
}
window.__setCam = (...a) => { setCam(a.length === 1 ? a[0] : a); step(0); renderOnce(); };   // step(0)：让依赖相机的 update 重新计算

// 真实循环测速：用 rAF 连续跑 sec 秒（CPU/GPU 流水并行，与真实体验一致），返回平均 fps 与帧时间分位
window.__loopFps = (sec = 4) => new Promise(res => {
  const ts = []; let last = performance.now(); const end = last + sec * 1000;
  const tick = now => { step(Math.min(0.1, (now - last) / 1000)); draw(); ts.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else { ts.shift(); ts.sort((a, b) => a - b); const avg = ts.reduce((s, x) => s + x, 0) / ts.length; res({ fps: +(1000 / avg).toFixed(1), avg: +avg.toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2), frames: ts.length }); } };
  requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
});

// 基准测试：连续渲染 n 帧（含 update），每帧读 1 像素强制 GPU 同步，返回毫秒统计
window.__bench = (n = 60) => {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const times = [];
  for (let i = 0; i < n + 5; i++) {
    const t0 = performance.now();
    step(1 / 60);
    draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (i >= 5) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  return { avg: +avg.toFixed(2), p50: +times[n >> 1].toFixed(2), p95: +times[Math.floor(n * 0.95)].toFixed(2), draws: pipeline.info.calls, tris: pipeline.info.triangles };
};

// ------------------------------------------------------------ 主循环
let simT = SHOT ? +(qs.get('t') || 30) : +(qs.get('t') || 0);
let last = performance.now();
const fpsEl = $('#fps');
let fpsAcc = 0, fpsN = 0;

function step(dt) {
  simT += dt;
  ctx.time = simT;
  ctx.shared.uTime.value = simT;
  player.update(dt);
  ctx.player.copy(camera.position);
  for (const fn of ctx._updates) {
    try { fn(dt, simT); } catch (e) {
      if (!fn._failed) { fn._failed = true; console.error(`[update ${fn._module}]`, e); errors.push(`${fn._module} update: ${e.message}`); }
    }
  }
  ctx.lights.update(camera.position);
  ctx.halos.writeColors();
  sky.update(simT, camera);
}
const NOPOST = qs.get('post') === '0';   // 调试：绕过后处理直接出图
function draw() {
  if (!NOPOST) return pipeline.render(scene, camera);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  pipeline.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
function renderOnce() {
  camera.updateMatrixWorld();
  ctx.lights.update(camera.position, true);
  draw();
}
let dynAcc = 0, dynN = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  step(dt);
  draw();
  if (DYNRES) {
    // 每 1.5 s 评估一次：平均帧时间 > 18 ms 降 10%（下限 0.6）；< 12 ms 且距上次降级 ≥ 6 s 才升 10%（滞回，避免清晰度来回跳）
    dynAcc += now - (frame._prev || now); frame._prev = now; dynN++;
    if (dynAcc > 1500) {
      const avg = dynAcc / dynN;
      let next = resScale;
      if (avg > 18) { next = Math.max(0.6, resScale - 0.1); frame._down = now; }
      else if (avg < 12 && now - (frame._down || 0) > 6000) next = Math.min(1, resScale + 0.1);
      if (Math.abs(next - resScale) > 1e-3) { resScale = +next.toFixed(2); resize(); }
      dynAcc = 0; dynN = 0;
    }
  }
  if (fpsEl) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps · ${Math.round(resScale * 100)}% res · ${pipeline.info.calls} draws · ${(pipeline.info.triangles / 1e6).toFixed(2)}M tris · ${ctx.lights.active} lights`;
      fpsAcc = 0; fpsN = 0;
    }
  }
  requestAnimationFrame(frame);
}

(async () => {
  await buildWorld();
  setCam(qs.get('cam') || 'hero');
  if (!SHOT && (!qs.has('cam') || qs.get('cam') === 'hero')) player.fly = false;
  if (SHOT) {
    $('#loading')?.remove(); $('#hint')?.remove();
    $('#controls')?.remove();
    $('#routes')?.remove();
    // 固定时刻：先让动画推进到 t，再渲染几帧
    for (let i = 0; i < 3; i++) step(0);
    renderOnce(); renderOnce();
    stats.draws = pipeline.info.calls;
    stats.tris = pipeline.info.triangles;
    window.__ready = true;
    return;
  }
  $('#loading')?.classList.add('done');
  renderer.domElement.addEventListener('click', () => audio.start(), { once: true });
  if (qs.has('stats')) $('#fps').style.display = 'block';
  requestAnimationFrame(t => { last = t; frame(t); });
})();
