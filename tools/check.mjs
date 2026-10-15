// 无头验收：在 Node 里构建模块（不需要 GPU），检查预算、越界、材质、数值与动画。
// 用法：
//   node tools/check.mjs signs            # 单独构建 signs（验证它在缺少依赖时也能跑）
//   node tools/check.mjs signs --deps     # 先构建 layout.MODULES 中排在它前面的模块，再检查 signs
//   node tools/check.mjs                  # 全部模块依次构建 + 合批检查
// 结尾打印 RESULT: OK / RESULT: FAIL（FAIL 时退出码 1）
import { installDomStub } from './dom-stub.mjs';
installDomStub();
const THREE = await import('three');
const L = await import('../src/world/layout.js');
const { createContext, QUALITY } = await import('../src/core/ctx.js');
const { batchStatic } = await import('../src/core/batch.js');

const argv = process.argv.slice(2);
const deps = argv.includes('--deps');
const names = argv.filter(a => !a.startsWith('--'));
const targets = names.length ? names : L.MODULES;
const buildList = deps ? [...new Set([...L.MODULES.slice(0, Math.max(...targets.map(t => L.MODULES.indexOf(t)))), ...targets])] : targets;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.01);
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 2000);
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
const ctx = createContext({ scene, camera, renderer, quality: { name: 'high', ...QUALITY.high }, audio: { start() {} } });
ctx.sky = { update() {} };

const report = {};
const warnings = [];
const errors = [];
const W = (m, s) => warnings.push(`[${m}] ${s}`);
const E = (m, s) => errors.push(`[${m}] ${s}`);

function snapshot() {
  const s = new Set();
  scene.traverse(o => s.add(o));
  return s;
}
const FORBIDDEN_LIGHTS = ['PointLight', 'SpotLight', 'RectAreaLight', 'DirectionalLight', 'HemisphereLight', 'AmbientLight'];
const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4();

function inZones(name, x, z, tol = 1.0) {
  const zs = L.ZONES[name];
  if (!zs) return true;
  return zs.some(Z => x >= Z.x0 - tol && x <= Z.x1 + tol && z <= Z.z0 + tol && z >= Z.z1 - tol);
}

for (const name of buildList) {
  const isTarget = targets.includes(name);
  const before = snapshot();
  const lights0 = ctx.lights.list.length, halos0 = ctx.halos.items.length, px0 = ctx.tex.pixels, upd0 = ctx._updates.length;
  const services0 = new Set(ctx._services.keys());
  const t0 = performance.now();
  ctx._module = name;
  try {
    const mod = await import(`../src/world/${name}.js`);
    if (typeof mod.build !== 'function') throw new Error('缺少 export function build(ctx)');
    await mod.build(ctx);
  } catch (e) {
    E(name, 'build 失败: ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
    ctx._module = null;
    continue;
  }
  ctx._module = null;
  const ms = performance.now() - t0;
  if (!isTarget) continue;

  // ---- 统计新增对象
  const r = { ms: Math.round(ms), tris: 0, meshes: 0, instanced: 0, instances: 0, materials: {}, outOfZone: 0,
    lights: ctx.lights.list.length - lights0, halos: ctx.halos.items.length - halos0,
    texMpx: +((ctx.tex.pixels - px0) / 1e6).toFixed(2), updates: ctx._updates.length - upd0,
    services: [...ctx._services.keys()].filter(k => !services0.has(k)), bounds: null };
  const bounds = new THREE.Box3();
  scene.updateMatrixWorld(true);
  const oozSamples = [];
  scene.traverse(o => {
    if (before.has(o)) return;
    if (FORBIDDEN_LIGHTS.includes(o.type)) E(name, `禁止使用 THREE.${o.type}，请用 ctx.lights.add()`);
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const g = o.geometry;
    const tri = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      r.materials[m.type] = (r.materials[m.type] || 0) + 1;
      if (!m.userData?.ctxMat) W(name, `非 ctx.mat 材质 ${m.type}（${o.name || 'unnamed'}）——请用 ctx.mat.*，自定义 shader 用 ctx.mat.custom()`);
    }
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += Math.max(1, pos.count >> 6)) {
      if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) { E(name, `几何体含 NaN/Infinity（${o.name || o.type}）`); break; }
    }
    if (o.isInstancedMesh) {
      r.instanced++; r.instances += o.count; r.tris += tri * o.count;
      if (!g.boundingBox) g.computeBoundingBox();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, tmpM);
        tmpV.setFromMatrixPosition(tmpM).applyMatrix4(o.matrixWorld);
        if (!Number.isFinite(tmpV.x + tmpV.y + tmpV.z)) { E(name, `实例矩阵含 NaN（${o.name}）`); break; }
        bounds.expandByPoint(tmpV);
        if (!o.userData.followsCamera && !inZones(name, tmpV.x, tmpV.z)) { r.outOfZone++; if (oozSamples.length < 3) oozSamples.push(`${o.name || 'inst'}@(${tmpV.x.toFixed(1)},${tmpV.z.toFixed(1)})`); }
      }
    } else {
      r.meshes++; r.tris += tri;
      if (!g.boundingBox) g.computeBoundingBox();
      tmpBox.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
      if (!tmpBox.isEmpty()) {
        bounds.union(tmpBox);
        tmpBox.getCenter(tmpV);
        if (!o.userData.followsCamera && !inZones(name, tmpV.x, tmpV.z)) { r.outOfZone++; if (oozSamples.length < 3) oozSamples.push(`${o.name || o.type}@(${tmpV.x.toFixed(1)},${tmpV.z.toFixed(1)})`); }
      }
    }
  });
  r.wireTris = ctx.wires.trisOf(name);      // ctx.wires 在全部模块后才生成网格，这里按登记数预估
  r.tris = Math.round(r.tris + r.wireTris);
  if (!bounds.isEmpty()) r.bounds = [bounds.min, bounds.max].map(v => [v.x, v.y, v.z].map(n => +n.toFixed(1)));
  if (r.outOfZone) W(name, `${r.outOfZone} 个对象中心超出所有权区域 ZONES.${name}，例：${oozSamples.join(', ')}`);

  // ---- 预算
  const B = L.BUDGET[name];
  if (!B) W(name, '在 layout.BUDGET 中没有预算');
  else {
    if (r.tris > B.tris) E(name, `三角面 ${(r.tris / 1e3).toFixed(0)}k 超预算 ${(B.tris / 1e3).toFixed(0)}k`);
    if (r.lights > B.lights) E(name, `光场 ${r.lights} 超预算 ${B.lights}`);
    if (r.halos > B.halos) E(name, `光晕 ${r.halos} 超预算 ${B.halos}`);
  }
  if (r.texMpx > 24) E(name, `Canvas 纹理 ${r.texMpx}M 像素，超过 24M`);
  if (!L.MODULES.includes(name)) W(name, '未在 layout.MODULES 中登记，浏览器不会加载它');

  // ---- 动画：dt 步进 30 s，再跳到若干固定时刻（截图模式 dt=0）
  const fns = ctx._updates.slice(upd0);
  let failed = 0;
  const run = (dt, t) => { for (const fn of fns) { try { fn(dt, t); } catch (e) { if (!fn._bad) { fn._bad = 1; failed++; E(name, `update 异常 t=${t.toFixed(1)}: ${e.message}`); } } } };
  let t = 0;
  for (let i = 0; i < 900; i++) { t += 1 / 30; ctx.time = t; ctx.shared.uTime.value = t; run(1 / 30, t); }
  for (const T of [60, 90, 120, 180, 300]) { ctx.time = T; run(0, T); }
  scene.updateMatrixWorld(true);
  ctx.dynamicRoot.traverse(o => {
    if (!before.has(o) && !Number.isFinite(o.matrixWorld.elements[12] + o.matrixWorld.elements[13] + o.matrixWorld.elements[14])) E(name, `动画后 ${o.name || o.type} 位置为 NaN`);
  });
  report[name] = r;
}

// ---- 全量时的合批检查
if (!names.length) {
  try {
    ctx.wires.build() && ctx.staticRoot.add(ctx.wires.mesh);
    ctx.halos.build();
    report._batch = batchStatic(ctx.staticRoot, { mat: ctx.mat });
  } catch (e) { E('batch', 'batchStatic 失败: ' + e.message); }
  report._totals = {
    tris: Object.values(report).reduce((s, r) => s + (r.tris || 0), 0),
    lights: ctx.lights.list.length, halos: ctx.halos.items.length, texMpx: +(ctx.tex.pixels / 1e6).toFixed(1),
  };
}

console.log(JSON.stringify(report, null, 1).replace(/\n\s+(?=[\d\-\]])/g, ' '));
if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.slice(0, 40).forEach(w => console.log('  ' + w)); }
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.slice(0, 40).forEach(e => console.log('  ' + e)); }
console.log(errors.length ? '\nRESULT: FAIL' : '\nRESULT: OK');
process.exit(errors.length ? 1 : 0);
