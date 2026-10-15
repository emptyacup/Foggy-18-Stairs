// props —— 街面道具：火锅外摆（矮圆桌 + 塑料凳 + 遮阳伞 + 灯泡 + 蒸汽）、电瓶车（雨披 / 外卖箱 / 挡风被 / 尾灯）、
// 塑料筐、泡沫箱种葱、煤气罐、垃圾桶、纸箱、盆栽、伞、扁担、落叶、井盖、铁箅子；滨江路停车排；江边长椅 / 望远镜 / 路牌 / 报刊亭。
// 读取 'shopfronts'（shops 发布，可能缺失）→ 决定平台两侧摆火锅桌还是冰柜；发布 'walkways'（道具占用矩形）。
import * as THREE from 'three';
import { NEON, WINDOW, BASE } from '../core/palette.js';
import { Kit } from './props/kit.js';
import { makeMaterials, defineModels } from './props/models.js';
import { addSteam } from './props/steam.js';
import { CN_FONT } from '../core/tex.js';

// 实例色（全部由 palette 基色派生，非发光表面亮度 ≤ 0.55）
const STOOL = [0x8a1e1e, 0x8a1e1e, 0x8a1e1e, 0x7a2a2a, 0x2a5a8a, 0x9a3a1a];
const CRATE = [0x2a5a8a, 0x2a5a8a, 0x3c6f8a, 0x1e4a7a, 0x8a1e1e, 0x2f5a3a, 0x8a6a1a];
const BODY = [BASE.tileWhite, 0x9aa0a8, BASE.tarpRed, 0x2a5a8a, BASE.grime, 0x14161a, BASE.tilePink, BASE.tileGreen, 0x8a1e1e];
const COVER = [0x1e2a44, 0x2a3a2a, 0x3c6f8a, 0x5a1a22, 0x2a2a30, 0x6a5a2a];
const DELIV = [0x8a6a1a, 0x8a6a1a, 0x2a5a8a, 0x9a3a1a];
const UMB = [0x7a2a2a, 0x1e2a44, 0x14161a, 0x2f5a3a, 0x8a1e5a, 0x3c6f8a];
const LEAF = [0x4a3a14, 0x5a3a10, 0x3a3a18, 0x6a4a18, 0x2e3018, 0x5a2a10];

export function build(ctx) {
  const { L, mat, make, lights, halos } = ctx;
  const rng = ctx.rng('props');
  const S = ctx.staticRoot;
  const kit = new Kit(ctx);
  const M = makeMaterials(ctx, kit);
  defineModels(ctx, kit, M);

  // ================================================================ 读取 shopfronts（可缺失）
  const sfAll = ctx.use('shopfronts');
  const facades = ctx.use('facades');
  const HX = L.STAIR.x1;
  const sfZ = (sf) => {
    if (sf.a && sf.b && Number.isFinite(sf.a.z) && Number.isFinite(sf.b.z)) return [sf.a.z, sf.b.z];
    const lot = L.LOTS.find(l => l.id === sf.facadeId);
    const f = facades && facades.find(ff => ff.id === sf.facadeId);
    if (f && f.point) return [f.point(sf.u0, 0).z, f.point(sf.u1, 0).z];
    if (!lot) return null;
    return lot.side === 'W' ? [lot.z0 - sf.u0, lot.z0 - sf.u1] : [lot.z1 + sf.u0, lot.z1 + sf.u1];
  };
  const shopAt = (s, z) => {
    if (!Array.isArray(sfAll)) return null;
    for (const sf of sfAll) {
      if (!sf || typeof sf.facadeId !== 'string') continue;
      if ((sf.facadeId[0] === 'W' ? -1 : 1) !== s || !/^[WE]\d$/.test(sf.facadeId)) continue;
      const zz = sfZ(sf);
      if (!zz) continue;
      if (z <= Math.max(...zz) && z >= Math.min(...zz)) return sf;
    }
    return null;
  };
  const kindOf = (sf) => {
    if (!sf || sf.open === false) return null;
    const k = String(sf.kind || '');
    if (/hot|pot|noodle|food|eat|rest|bbq|火锅|面|串|烧烤|餐/i.test(k)) return 'dine';
    if (/store|shop|mart|groc|kiosk|convenience|超市|小卖|副食|烟酒/i.test(k)) return 'store';
    return null;
  };

  // 店门口错层平台（shops 发布 depth / floorY）：道具要么放在平台外的梯坎上，要么放到平台面上
  const plats = [];
  if (Array.isArray(sfAll)) {
    for (const sf of sfAll) {
      if (!sf || typeof sf.facadeId !== 'string' || !/^[WE]\d$/.test(sf.facadeId)) continue;
      const zz = sfZ(sf);
      if (!zz || !Number.isFinite(sf.floorY)) continue;
      const depth = Number.isFinite(sf.depth) ? sf.depth : 0.6;
      plats.push({ s: sf.facadeId[0] === 'W' ? -1 : 1, zMin: Math.min(...zz), zMax: Math.max(...zz), depth, floorY: sf.floorY });
    }
  }
  const platAt = (s, z) => plats.find(p => p.s === s && z <= p.zMax + 0.02 && z >= p.zMin - 0.02);
  // 梯坎一侧可用带的外沿 |x|（平台前沿）
  const xOut = (s, z) => {
    let d = 0;
    for (const dz of [-0.3, 0, 0.3]) { const p = platAt(s, z + dz); if (p) d = Math.max(d, p.depth); }
    return HX - d;
  };
  // v2 铺装顶面：广场与阶梯按 layout，人行道和江堤比道路高 0.15 m。
  const groundAt = (x, z) => {
    const h = L.heightAt(x, z);
    const R = L.ROAD;
    if ((z <= R.z0 && z >= R.z0 - R.sidewalkS)
      || (z <= R.z1 + R.sidewalkN && z > L.RIVER.zEdge)) return R.y + 0.15;
    if (z > L.STAIR.zTop || z < L.STAIR.zBottom || Math.abs(x) < 1.0) return h;
    const p = platAt(Math.sign(x), z);
    return p && Math.abs(x) > HX - p.depth - 0.02 ? Math.max(h, p.floorY) : h;
  };

  const walk = [];             // walkways 服务：{x0,z0,x1,z1}
  const occ = [];              // 摆放避让（圆）：{x,z,r}
  const steam = [];
  const gy = groundAt;
  const free = (x, z, r) => occ.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r);
  const claim = (x, z, r) => {
    occ.push({ x, z, r });
    if (r >= 0.3) walk.push({ x0: x - r, z0: z - r, x1: x + r, z1: z + r });   // 小件堆也给 characters 避让
  };
  const rect = (x, z, hw, hd, top = 0) => {
    walk.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
    if (top > 0) ctx.physics.addBox(x - hw, z - hd, x + hw, z + hd, gy(x, z) + top, gy(x, z) - 0.2);
  };
  const P = (type, x, y, z, ry = 0, o) => kit.place(type, x, y, z, ry, o);

  // terrain 平台两侧路灯与 wires 电杆预先占位。
  for (const f of L.FLIGHTS) {
    if (f.type !== 'landing' || f.z0 - f.z1 < 2.5) continue;
    for (const side of [-1, 1]) claim(side * (HX - 1.4), (f.z0 + f.z1) / 2, 0.4);
  }
  for (const p of ctx.use('wirePoles') || []) claim(p.x, p.z, 0.45);

  // 台阶：返回 z 所在踏面的北沿与踏面高度（道具贴北沿放，向南"埋"进上一级）
  const tread = (z) => {
    for (const f of L.FLIGHTS) {
      if (f.type !== 'flight' || z > f.z0 || z < f.z1) continue;
      const k = Math.min(f.steps - 1, Math.floor((f.z0 - z) / f.run));
      return { zN: f.z0 - (k + 1) * f.run, y: f.y0 - (k + 1) * f.rise, run: f.run };
    }
    return { zN: z - 0.2, y: gy(0, z), run: 0 };
  };

  // 梯坎一侧选 x：优先平台外的梯坎带；带太窄就放到门口平台面上
  const bandX = (s, z, r = 0.3) => {
    const xo = xOut(s, z);
    const lo = 5 + r, hi = Math.min(HX - 0.5, xo) - r - 0.02;
    if (hi >= lo && (xo >= HX - 0.05 || rng.chance(0.8))) return s * rng.range(lo, hi);
    if (HX - xo >= 0.55) return s * Math.min(HX - 0.5 - r, (xo + HX) / 2);
    return null;
  };

  // ================================================================ 小件组合（vignette）
  const V = {
    crates(x, z, s) {
      const n = rng.weighted([[1, 2], [2, 3], [3, 2], [4, 0.7]]);
      const ry = Math.PI / 2 + rng.range(-0.12, 0.12);
      const c = rng.pick(CRATE);
      let y = gy(x, z);
      for (let i = 0; i < n; i++) {
        P('crate', x + rng.range(-0.03, 0.03), y, z + rng.range(-0.03, 0.03), ry + rng.range(-0.08, 0.08), { color: rng.chance(0.75) ? c : rng.pick(CRATE) });
        if (i === n - 1 && rng.chance(0.5)) P('bottles', x, y + 0.02, z, ry);
        y += 0.31;
      }
      claim(x, z, 0.32);
      return 0.32;
    },
    foam(x, z, s) {
      const n = rng.int(1, 3);
      const ry = Math.PI / 2 + rng.range(-0.15, 0.15);
      let y = gy(x, z);
      for (let i = 0; i < n; i++) {
        P('foam', x + rng.range(-0.04, 0.04), y, z, ry + rng.range(-0.1, 0.1));
        y += 0.28;
      }
      if (rng.chance(0.65)) P('scallion', x, y - 0.28, z, ry);
      else P('foamLid', x + rng.range(-0.05, 0.05), y, z, ry + rng.range(-0.2, 0.2));
      claim(x, z, 0.33);
      return 0.33;
    },
    gas(x, z) {
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) P('gas', x + i * 0.32 * rng.sign(), gy(x, z), z + rng.range(-0.05, 0.05), rng.range(0, 6.28), { color: rng.pick([0x3c5a7a, 0x3c5a7a, 0x6a4a2a, 0x5a5a5a]) });
      claim(x, z, 0.25 + (n - 1) * 0.16);
      return 0.25;
    },
    bin(x, z, s) {
      const ry = -s * Math.PI / 2 + rng.range(-0.25, 0.25);
      P('bin', x, gy(x, z), z, ry, { rz: 0, color: rng.pick([0x2f5a3a, 0x2f5a3a, 0x24483a, 0x3c4048]) });
      claim(x, z, 0.42);
      rect(x, z, 0.36, 0.36, 1.0);
      return 0.42;
    },
    plant(x, z) {
      const t = rng.weighted([['potBush', 3], ['potSpiky', 2], ['potTall', 1.2]]);
      P(t, x, gy(x, z), z, rng.range(0, 6.28), { s: rng.range(0.85, 1.15) });
      if (rng.chance(0.4)) {
        const dx = rng.range(-0.15, 0.15);
        P(rng.pick(['potBush', 'potSpiky']), x + dx, gy(x, z), z - 0.42 * rng.sign(), rng.range(0, 6.28), { s: rng.range(0.6, 0.85) });
      }
      claim(x, z, 0.35);
      return 0.35;
    },
    cartons(x, z) {
      const n = rng.int(1, 3);
      let y = gy(x, z);
      const ry = Math.PI / 2 + rng.range(-0.3, 0.3);
      for (let i = 0; i < n; i++) {
        const sc = [rng.range(0.7, 1.2), rng.range(0.6, 1.1), rng.range(0.7, 1.1)];
        P('carton', x + rng.range(-0.05, 0.05), y, z + rng.range(-0.04, 0.04), ry + rng.range(-0.25, 0.25), { s: sc });
        y += 0.36 * sc[1];
      }
      claim(x, z, 0.3);
      return 0.3;
    },
    lean(x, z, s, type) {
      // 靠墙：扫帚 / 扁担 / 收起的伞 —— 底部离墙 ~0.3 m，顶部靠墙
      const xo = xOut(s, z);
      const xw = s * Math.min(HX - 0.5, xo < HX - 0.3 ? xo - 0.03 : HX - 0.5);   // 有门口平台就靠平台前沿
      const h = type === 'pole' ? 1.75 : type === 'broom' ? 1.45 : 0.95;
      const ang = Math.asin(Math.min(0.5, 0.3 / h));
      const xb = xw - s * h * Math.sin(ang);
      P(type, xb, gy(xb, z), z, rng.range(-0.3, 0.3), { rz: -s * ang, color: type === 'umbrellaShut' ? rng.pick(UMB) : undefined });
      return 0.15;
    },
    umbrella(x, z) {
      // 撑开倒放在地上晾着的伞：伞面朝上斜躺
      const ry = rng.range(0, 6.28);
      P('umbrella', x, gy(x, z) + 0.18, z, ry, { rx: rng.range(1.0, 1.25), color: rng.pick(UMB) });
      claim(x, z, 0.45);
      return 0.45;
    },
    stoolStack(x, z) {
      const n = rng.int(3, 7);
      const c = rng.pick(STOOL);
      let y = gy(x, z);
      for (let i = 0; i < n; i++) { P('stool', x + rng.range(-0.01, 0.01), y, z, rng.range(-0.06, 0.06) + 0.3, { color: c }); y += 0.075; }
      claim(x, z, 0.24);
      return 0.24;
    },
  };
  const pickVignette = (onStair) => rng.weighted([
    ['crates', 3], ['foam', 2.5], ['plant', 2.4], ['gas', onStair ? 0.6 : 1], ['cartons', 1.4], ['bin', onStair ? 0.3 : 0.9],
    ['broom', 0.7], ['pole', 0.6], ['umbrellaShut', 0.6], ['umbrella', 0.6], ['stoolStack', 0.6],
  ]);
  const runVignette = (k, x, z, s) => (['broom', 'pole', 'umbrellaShut'].includes(k) ? V.lean(x, z, s, k) : V[k](x, z, s));

  // ================================================================ 火锅外摆
  const lamps = [];
  function dine(zc, s, { parasol = true } = {}) {
    const xo = xOut(s, zc);
    const xc = s * Math.max(6.3, Math.min(HX - 1.5, xo - 1.0));
    if (!free(xc, zc, 0.95)) return;
    const y = gy(xc, zc);
    P('table', xc, y, zc, rng.range(0, 6.28));
    steam.push({ x: xc, y: y + 0.82, z: zc, k: 1, rise: 1.2, n: 10 });
    const n = rng.int(3, 5);
    const a0 = rng.range(0, 6.28);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = rng.range(0.56, 0.74);
      const x = xc + Math.cos(a) * r, z = zc + Math.sin(a) * r;
      if (Math.abs(x) < 5.2 || Math.abs(x) > HX - 0.7) continue;
      if (Math.abs(Math.abs(x) - xOut(s, z)) < 0.2) continue;          // 不骑在平台边沿上
      const c = rng.pick(STOOL), ys = gy(x, z);
      if (rng.chance(0.12)) P('stool', x, ys + 0.165, z, rng.range(0, 6.28), { rz: Math.PI / 2, color: c });   // 被踢倒的凳子
      else P('stool', x, ys, z, rng.range(0, 6.28), { color: c });
    }
    claim(xc, zc, 0.95);
    rect(xc, zc, 0.8, 0.8, 0.75);
    // 墙边 / 平台上一摞凳子
    const sz = zc + rng.range(-1.1, 1.1), xo2 = xOut(s, sz);
    const sx = s * Math.min(HX - 0.75, (xo2 + HX) / 2);
    if (rng.chance(0.7) && free(sx, sz, 0.2)) V.stoolStack(sx, sz);
    // 遮阳伞 or 墙上拉线挂灯泡
    let by = y + 1.95;
    const bx = xc + rng.range(-0.1, 0.1), bz = zc + rng.range(-0.1, 0.1);
    if (parasol) {
      const px = xc, pz = zc + rng.sign() * rng.range(0.5, 0.7);
      P('parasol', px, y, pz, rng.range(0, 6.28), { color: rng.pick([0x7a2a2a, 0x8a1e1e, 0x2a5a8a, 0x2f5a3a]) });
      claim(px, pz, 0.3);
      // 伞面在 bx 处的高度：顶 2.78，边缘 2.42（半径 0.9）
      const d = Math.hypot(bx - px, bz - pz);
      const top = y + 2.78 - (0.36 * Math.min(1, d / 0.9));
      by = Math.min(by, top - 0.45);
      P('cord', bx, by + 0.05, bz, 0, { s: [1, top - by - 0.05, 1] });
    } else {
      const top = y + 3.1;
      P('cord', bx, by + 0.05, bz, 0, { s: [1, top - by - 0.05, 1] });
      ctx.wires.add(new THREE.Vector3(bx, top, bz), new THREE.Vector3(s * L.STAIR.x1, top + 0.25, bz + rng.range(-0.6, 0.6)), { sag: 0.06, r: 0.008 });
      ctx.wires.add(new THREE.Vector3(bx, top, bz), new THREE.Vector3(s * (HX - 0.9), top + 0.6, bz + rng.range(-1.5, 1.5)), { sag: 0.15, r: 0.008 });
    }
    P('bulb', bx, by, bz);
    lamps.push({ x: bx, y: by, z: bz });
  }

  // ================================================================ 电瓶车
  let tailLit = 0;
  function scooter(x, z, ry, { lit, cover } = {}) {
    const y = gy(x, z);
    const o = { rz: rng.range(0.05, 0.09) };   // 脚撑在左，车身左倾
    P('scooter', x, y, z, ry, { ...o, color: rng.pick(BODY) });
    const deliv = cover ? cover === 'delivery' : rng.chance(0.35);
    if (deliv) P('delivery', x, y, z, ry, { ...o, color: rng.pick(DELIV) });
    if (cover === 'rain' || (!cover && !deliv && rng.chance(0.45))) P('raincover', x, y, z, ry, { ...o, color: rng.pick(COVER) });
    else if (rng.chance(0.3)) P('quilt', x, y, z, ry, { ...o, color: rng.pick([0x6a1a22, 0x2a3a5a, 0x4a2a4a, 0x5a4a2a]) });
    lit = lit ?? (tailLit < 6 && rng.chance(0.3));
    P(lit ? 'tailOn' : 'tailOff', x, y, z, ry, o);
    if (lit) {
      tailLit++;
      const p = new THREE.Vector3(0, 0.6, -1.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, y, z));
      lights.add({ position: p, color: NEON.hotpot, intensity: 0.5, radius: 2.4 });
      halos.add({ position: p, color: NEON.hotpot, size: 0.45, intensity: 0.35 });
    }
    claim(x, z, 0.7);
    const sw = Math.abs(Math.sin(ry)), cw = Math.abs(Math.cos(ry));
    rect(x, z, 0.85 * sw + 0.33 * cw, 0.85 * cw + 0.33 * sw, 1.1);
    return { x, y, z, ry };
  }

  // ================================================================ 冰柜（立式饮料柜，前脸发光）
  const fridgeTex = (() => {
    const c = ctx.tex.canvas(128, 320);
    const g = c.getContext('2d');
    g.fillStyle = '#0a1418'; g.fillRect(0, 0, 128, 320);
    const grd = g.createLinearGradient(0, 0, 0, 320);
    grd.addColorStop(0, 'rgba(220,255,240,0.55)'); grd.addColorStop(1, 'rgba(120,200,220,0.15)');
    g.fillStyle = grd; g.fillRect(6, 6, 116, 308);
    const r2 = ctx.rng('fridge');
    const cols = ['#c83030', '#e8a020', '#30a050', '#3070d0', '#e0e0e0', '#d05090', '#f0d040'];
    for (let row = 0; row < 5; row++) {
      const y0 = 20 + row * 60;
      g.fillStyle = 'rgba(30,40,45,0.9)'; g.fillRect(6, y0 + 46, 116, 5);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = r2.pick(cols);
        const bw = 12, bh = r2.range(28, 42);
        g.fillRect(10 + i * 16, y0 + 46 - bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(12 + i * 16, y0 + 46 - bh + 3, 2, bh - 6);
      }
    }
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 6); g.fillRect(0, 314, 128, 6); g.fillRect(0, 0, 6, 320); g.fillRect(122, 0, 6, 320);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const fridgeFace = mat.emissiveMap(fridgeTex, 1.25);
  const vendFace = (() => {
    const c = ctx.tex.canvas(128, 224), g = c.getContext('2d');
    const r2 = ctx.rng('vend');
    g.fillStyle = '#0c1620'; g.fillRect(0, 0, 128, 224);
    const cols = ['#d84040', '#f0b030', '#40b060', '#4080e0', '#f0f0f0', '#e060a0', '#40d0d0'];
    for (let row = 0; row < 6; row++) for (let i = 0; i < 6; i++) {
      const x = 6 + i * 20, y = 8 + row * 36;
      g.fillStyle = 'rgba(200,240,255,0.25)'; g.fillRect(x - 2, y - 2, 20, 32);
      g.fillStyle = r2.pick(cols); g.fillRect(x + 2, y + 4, 12, 22);
      g.fillStyle = '#e8ffe0'; g.fillRect(x + 4, y + 28, 8, 3);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const vendMat = mat.emissiveMap(vendFace, 1.4);
  function fridge(x, z, s) {
    const y = gy(x, z);
    const ry = -s * Math.PI / 2;            // 正面朝梯坎中线
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; S.add(g);
    make.block(0.64, 1.85, 0.62, M.metalDk, { parent: g });
    make.block(0.66, 0.08, 0.64, mat.std({ color: 0x7a2a2a, roughness: 0.4 }), { y: 1.85, parent: g });
    make.quad(0.52, 1.5, fridgeFace, { y: 0.98, z: 0.315, parent: g });
    make.block(0.6, 0.22, 0.04, mat.neon(NEON.hotpot, 1.6), { y: 1.62, z: 0.3, parent: g });
    make.block(0.03, 0.4, 0.04, M.chrome, { x: 0.22, y: 0.9, z: 0.33, parent: g });
    const p = new THREE.Vector3(0, 1.2, 0.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(g.position);
    lights.add({ position: p, color: WINDOW.fluor, intensity: 1.1, radius: 4.5 });
    claim(x, z, 0.45);
    rect(x, z, 0.36, 0.36, 1.9);
  }
  // 卧式冰柜（白壳 + 发光玻璃盖）
  function chest(x, z, s) {
    const y = gy(x, z);
    const ry = -s * Math.PI / 2 + Math.PI / 2;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; S.add(g);
    make.block(0.6, 0.8, 1.0, mat.std({ color: BASE.tileWhite, roughness: 0.35 }), { parent: g });
    make.block(0.5, 0.02, 0.9, mat.neon(0x9fe8ff, 0.7), { y: 0.8, parent: g });
    make.block(0.62, 0.05, 0.12, M.metal, { y: 0.8, z: 0.0, parent: g });
    lights.add({ position: new THREE.Vector3(x, y + 1.1, z), color: 0x9fe8ff, intensity: 0.45, radius: 2.6 });
    claim(x, z, 0.55);
    rect(x, z, 0.5, 0.5, 0.85);
  }
  // 蒸笼摊（小推车 + 一摞竹蒸笼 + 大团蒸汽）
  function steamer(x, z, s) {
    const y = gy(x, z);
    make.block(0.9, 0.72, 0.6, M.metalDk, { x, y, z, ry: Math.PI / 2 });
    make.block(0.96, 0.03, 0.66, M.chrome, { x, y: y + 0.72, z, ry: Math.PI / 2 });
    for (const dz of [-0.2, 0.22]) {
      const h = rng.int(3, 5);
      for (let i = 0; i < h; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 14), M.bamboo);
        m.position.set(x + rng.range(-0.02, 0.02), y + 0.8 + i * 0.095, z + dz); S.add(m);
      }
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 0.07, 14), M.bamboo);
      lid.position.set(x, y + 0.8 + h * 0.095 + 0.03, z + dz); S.add(lid);
      steam.push({ x, y: y + 0.85 + h * 0.095, z: z + dz, k: 1.5, rise: 1.8, n: 10 });
    }
    claim(x, z, 0.6);
    rect(x, z, 0.35, 0.5, 1.0);
    const by = y + 2.1;
    P('bulb', x - s * 0.15, by, z);
    P('cord', x - s * 0.15, by + 0.05, z, 0, { s: [1, 0.9, 1] });
    ctx.wires.add(new THREE.Vector3(x - s * 0.15, by + 0.95, z), new THREE.Vector3(s * L.STAIR.x1, by + 1.1, z + 0.4), { sag: 0.04, r: 0.008 });
    lamps.push({ x: x - s * 0.15, y: by, z });
  }

  // ================================================================ 梯坎平台
  // 兜底规划：每个平台两侧的主题（W = -1, E = +1）
  const PLAN = [
    { W: 'clutter', E: 'scooter' },
    { W: 'dine', E: 'scooter2' },
    { W: 'store', E: 'dine' },
    { W: 'dine', E: 'dineP' },
    { W: 'scooter2', E: 'steamer' },
    { W: 'dineP', E: 'store' },
  ];
  const landings = L.FLIGHTS.filter(f => f.type === 'landing' && f.z0 - f.z1 >= 1.9);
  landings.forEach((f, i) => {
    const zc = (f.z0 + f.z1) / 2, len = f.z0 - f.z1;
    const plan = PLAN[i] || { W: 'clutter', E: 'clutter' };
    for (const s of [-1, 1]) {
      let theme = plan[s < 0 ? 'W' : 'E'];
      const k = kindOf(shopAt(s, zc));
      if (k === 'dine' && !theme.startsWith('dine')) theme = len >= 3.5 ? 'dineP' : 'dine';
      if (k === 'store' && theme.startsWith('dine')) theme = 'store';
      // 主体
      if (theme === 'dine' || theme === 'dineP') {
        const zt = zc + rng.range(-0.25, 0.25) * (len - 2);
        dine(len >= 3.6 && theme === 'dine' ? zt + 0.6 : zt, s, { parasol: theme === 'dineP' || (i === 1 && s < 0) });
        if (len >= 4.5) dine(zt - 1.75, s, { parasol: false });
      } else if (theme === 'scooter' || theme === 'scooter2') {
        // 在 [5, 9.5] 两侧街带内斜停：按带宽求最大斜角
        const fit = (z, want) => {
          const band = Math.min(HX - 0.5, xOut(s, z)) - 5;
          let th = want;
          while (th > 0.05 && 0.85 * Math.sin(th) + 0.33 * Math.cos(th) > band / 2) th -= 0.05;
          return { x: s * (5 + Math.max(band, 0.7) / 2), th };
        };
        if (i === 0) {
          // hero 前景留空：离镜头 3 m 内的大物件会压住构图（整合时移除）
        } else {
          const n = theme === 'scooter2' ? Math.min(3, Math.floor(len / 0.95)) : 1;
          for (let k2 = 0; k2 < n; k2++) {
            const z = f.z0 - 0.7 - k2 * 0.85 - rng.range(0, 0.15);
            const q = fit(z, rng.range(0.9, 1.25));
            if (!free(q.x, z, 0.4)) continue;
            scooter(q.x, z, s * q.th + (rng.chance(0.5) ? Math.PI : 0));
          }
        }
      } else if (theme === 'store') {
        const zf = zc + rng.range(-0.4, 0.4);
        const xo = xOut(s, zf);
        const xf = s * Math.min(HX - 0.9, Math.max(5.6, xo - 0.4));
        if (free(xf, zf, 0.45)) fridge(xf, zf, s);
        const zc2 = zf + (rng.chance(0.5) ? 1 : -1) * 1.05;
        const xc2 = s * Math.min(HX - 1.0, Math.max(5.6, xOut(s, zc2) - 0.55));
        if (free(xc2, zc2, 0.55)) chest(xc2, zc2, s);
      } else if (theme === 'steamer') {
        steamer(s * Math.max(6.3, Math.min(HX - 1.0, xOut(s, zc + 0.3) - 0.6)), zc + 0.3, s);
      }
      // 平台余下空间撒杂物
      const tries = Math.round(len * 2.2);
      for (let t = 0; t < tries; t++) {
        const z = rng.range(f.z1 + 0.35, f.z0 - 0.35);
        const x = bandX(s, z);
        const kname = pickVignette(false);
        const r = 0.4;
        if (x === null || !free(x, z, r)) continue;
        runVignette(kname, x, z, s);
      }
    }
  });

  // ================================================================ 梯段两侧：沿台阶的杂物（贴踏面）
  for (const f of L.FLIGHTS) {
    if (f.type !== 'flight') continue;
    for (const s of [-1, 1]) {
      let z = f.z0 - rng.range(0.2, 0.8);
      while (z > f.z1 + 0.4) {
        if (rng.chance(0.78)) {
          const t = tread(z);
          const k = pickVignette(true);
          const depth = ['crates', 'foam', 'cartons'].includes(k) ? 0.56 : 0.4;
          const zc = t.zN + Math.min(depth, 0.5) / 2 + 0.01;
          const x = bandX(s, zc);
          if (x !== null && free(x, zc, 0.33)) runVignette(k, x, zc, s);
        }
        z -= rng.range(0.7, 1.9);
      }
    }
  }

  // ================================================================ 上半城街（玩家出生点两侧）
  {
    for (const [x0, n] of [[-9.5, 4], [6.2, 3], [-22, 5], [18, 4]]) {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 0.8 + rng.range(-0.1, 0.1), z = L.STAIR.zTop + 3.8 + rng.range(-0.2, 0.2);
        if (free(x, z, 0.35)) scooter(x, z, Math.PI + rng.range(-0.35, 0.35));
      }
    }
    for (const x of [-5.8, 5.8, -14, 14.5, 28, -30]) {
      const z = L.STAIR.zTop + 2.6 + rng.range(-0.1, 0.1);
      const k = rng.pick(['bin', 'crates', 'foam', 'plant', 'cartons', 'plant']);
      if (free(x, z, 0.4)) runVignette(k, x, z, x < 0 ? -1 : 1);
    }
  }

  // ================================================================ 滨江路南人行道：成排电瓶车 + 垃圾桶 + 报刊亭
  const R = L.ROAD;
  const roadRow = [];
  {
    const zRow = R.z0 - R.sidewalkS / 2;
    const lampsX = [-30];
    const clusters = [[-34, 3], [-22.6, 3], [-8.4, 2], [4.6, 4], [9.6, 5], [16.5, 6], [26.8, 5]];
    for (const [x0, n] of clusters) {
      const base = (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.2, 0.2);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 0.78 + rng.range(-0.08, 0.08);
        if (lampsX.some(lx => Math.abs(lx - x) < 0.7)) continue;
        if (rng.chance(0.12)) continue;   // 空位
        roadRow.push(scooter(x, zRow + rng.range(-0.15, 0.15), base + rng.range(-0.25, 0.25) + (rng.chance(0.15) ? Math.PI : 0)));
      }
    }
    for (const x of [-33, -18.6, 3.8, 14.5, 32]) {
      if (free(x, R.z0 - 0.45, 0.4)) V.bin(x, R.z0 - 0.45, 1);
      for (let k = 0; k < 2; k++) {
        const xx = x + rng.range(0.7, 1.8) * rng.sign(), zz = R.z0 - rng.range(0.35, 0.6);
        if (free(xx, zz, 0.35)) runVignette(rng.pick(['cartons', 'crates', 'foam', 'plant']), xx, zz, 1);
      }
    }
    kiosk(22, R.z0 - 0.95, 0, '报刊');
    bbq(-13.2, L.PLAZA.z0 - 5);
    vending(8.2, R.z0 - 0.45, Math.PI);
    vending(-6.4, R.z0 - 0.45, Math.PI);
  }

  // ================================================================ 观景平台与江边人行道
  {
    const zB = R.z1 + R.sidewalkN / 2;
    for (const x of [-33, -21, -9, 9, 21, 33]) {
      P('bench', x, gy(x, zB), zB, Math.PI);
      rect(x, zB, 0.9, 0.35, 0.8);
      claim(x, zB, 0.9);
      if (rng.chance(0.6)) V.plant(x + 1.4, zB);
    }
    for (const x of [-21, -20.2, -8, 12.5, 13.3, 33]) {
      if (Math.abs(x % 30) < 1) continue; // terrain 北侧路灯位于 x=30 的倍数。
      scooter(x, zB, rng.range(-0.3, 0.3) + (rng.chance(0.5) ? Math.PI : 0));
    }
    kiosk(-23, L.PLAZA.z0 - 6, 0, '书报');
    vending(-20.8, L.PLAZA.z0 - 6.2, 0);
    // 平台北缘面向江的长椅和望远镜，留出中央观景通道。
    const zr = L.PLAZA.z1 + 2.0;
    for (const x of [-17.5, -14, 14, 17.5]) {
      P('scope', x, gy(x, zr), zr, Math.PI + rng.range(-0.2, 0.2), { color: rng.pick([0x3c6f8a, 0x8a6a1a]) });
      rect(x, zr, 0.25, 0.25, 1.2);
    }
    for (const x of [-27, -21, -10, 10, 21, 27]) {
      const z = zr + 1.6;
      P('bench', x, gy(x, z), z, Math.PI);
      rect(x, z, 0.9, 0.35, 0.8);
    }
    signpost(12.2, zr + 0.2);
    signpost(-12.2, zr + 0.2);
    for (const x of [-19, -12.6, 12.6, 19]) {
      const z = L.PLAZA.z1 + 5;
      P('potTall', x, gy(x, z), z, rng.range(0, 6.28), { s: 1.2 });
      claim(x, z, 0.4);
    }
  }

  // ================================================================ 三角梅：从底商挑檐垂下来
  {
    const fac = Array.isArray(facades) ? facades.filter(f => /^[WE]\d$/.test(f.id)) : null;
    for (const lot of L.LOTS) {
      if (!rng.chance(0.6)) continue;
      const s = lot.side === 'W' ? -1 : 1;
      const f = fac && fac.find(ff => ff.id === lot.id);
      const pTop = f?.podiumTop ?? Math.max(L.stairHeightAt(lot.z0), L.stairHeightAt(lot.z1)) + 4.2;
      const z = rng.chance(0.5) ? lot.z0 - 0.6 : lot.z1 + 0.6;
      const x = s * (HX - 0.5);              // 坐在基座挑檐上（挑檐外伸约 0.85 m，顶面 podiumTop + 0.25）
      P('bougain', x, pTop + 0.25, z, -s * Math.PI / 2 + rng.range(-0.1, 0.1), { s: [rng.range(0.9, 1.3), rng.range(0.9, 1.3), 1] });
    }
  }

  // ================================================================ 井盖、铁箅子
  {
    const mhTex = (() => {
      const c = ctx.tex.canvas(128, 128), g = c.getContext('2d');
      g.fillStyle = '#26282c'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#4a4e54'; g.lineWidth = 3;
      for (const r of [60, 46, 30]) { g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.stroke(); }
      g.lineWidth = 2;
      for (let i = -50; i <= 50; i += 10) { g.beginPath(); g.moveTo(64 + i, 20); g.lineTo(64 + i, 108); g.stroke(); }
      g.fillStyle = '#5a5e64'; g.font = `700 18px ${CN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillRect(36, 54, 56, 20); g.fillStyle = '#26282c'; g.fillText('雨 水', 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const mh = mat.std({ map: mhTex, color: 0xffffff, roughness: 0.45, metalness: 0.5 });
    const grate = mat.std({ map: ctx.tex.grille({ bars: 10, rails: 1, thick: 6 }), color: 0x8a8e96, roughness: 0.5, metalness: 0.6 });
    const disc = new THREE.CylinderGeometry(0.34, 0.34, 0.025, 18);
    for (const f of landings) {
      const z = rng.range(f.z1 + 0.6, f.z0 - 0.6), x = rng.range(-1.0, 1.0);
      const m = new THREE.Mesh(disc, mh); m.position.set(x, f.y0 + 0.012, z); m.rotation.y = rng.range(0, 6.28); S.add(m);
      for (const s of [-1, 1]) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.62), grate);
        g.position.set(s * (L.STAIR.x1 - 0.18), f.y0 + 0.04, rng.range(f.z1 + 0.4, f.z0 - 0.4)); S.add(g);
      }
    }
    for (const x of [-30, -8, 9, 31]) { const m = new THREE.Mesh(disc, mh); m.position.set(x, L.Y_UPPER + 0.012, L.STAIR.zTop + 5); S.add(m); }
  }

  // ================================================================ 落叶（被雨冲到台阶边、平台角落、排水沟旁）
  {
    const N = 900;
    for (let i = 0; i < N; i++) {
      let x, z;
      const r = rng();
      if (r < 0.78) {
        z = rng.range(L.STAIR.zBottom + 0.3, L.STAIR.zTop - 0.2);
        const s = rng.sign();
        const edge = Math.pow(rng(), 2.2);                 // 越靠墙越多
        x = s * (L.STAIR.x1 - 0.5 - edge * 3.0);
      } else if (r < 0.9) {
        x = rng.range(-30, 30); z = rng.range(L.STAIR.zTop + 2.1, L.STAIR.zTop + 7.7);
      } else {
        x = rng.range(-35, 35); z = R.z0 - rng.range(0.1, 2.5);
      }
      let y = gy(x, z);
      if (z < L.STAIR.zTop && z > L.STAIR.zBottom) {
        // 台阶上的叶子更愿意停在踏面里侧（踢面根部）
        const t = tread(z);
        if (t.run && L.FLIGHTS.some(f => f.type === 'flight' && z <= f.z0 && z >= f.z1)) { z = t.zN + 0.34 - Math.pow(rng(), 2) * 0.3; y = t.y; }
      }
      P('leaf', x, y, z, rng.range(0, 6.28), { rx: rng.range(-0.15, 0.15), s: rng.range(0.7, 1.4), color: rng.pick(LEAF) });
    }
  }

  // ================================================================ 报刊亭 / 路牌（独件，直接 make）
  function kiosk(x, z, ry, name) {
    const y = gy(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; S.add(g);
    const body = mat.std({ color: 0x24403a, roughness: 0.45, metalness: 0.3 });
    make.block(2.2, 2.3, 1.5, body, { parent: g });
    make.block(2.6, 0.1, 1.9, M.metalDk, { y: 2.3, parent: g });
    make.block(2.5, 0.14, 1.8, body, { y: 2.4, parent: g });
    // 卷帘（横条纹贴图）
    const shut = (() => {
      const c = ctx.tex.canvas(64, 128), q = c.getContext('2d');
      q.fillStyle = '#6a6e74'; q.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 128; i += 6) { q.fillStyle = 'rgba(0,0,0,0.45)'; q.fillRect(0, i, 64, 2); q.fillStyle = 'rgba(255,255,255,0.1)'; q.fillRect(0, i + 2, 64, 1); }
      q.fillStyle = 'rgba(30,20,20,0.5)'; q.font = `900 20px ${CN_FONT}`; q.textAlign = 'center'; q.fillText('转让', 32, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    make.quad(1.9, 1.8, mat.std({ map: shut, color: 0xffffff, roughness: 0.5, metalness: 0.4 }), { y: 1.0, z: 0.76, parent: g });
    // 侧面海报 + 卷帘下沿漏出的暖光
    make.quad(1.9, 0.04, mat.neon(WINDOW.warm, 2.2), { y: 0.1, z: 0.77, parent: g });
    const poster = (() => {
      const c = ctx.tex.canvas(128, 96), q = c.getContext('2d');
      const r2 = ctx.rng('poster' + name);
      q.fillStyle = '#2a2a2e'; q.fillRect(0, 0, 128, 96);
      const cols = ['#8a2a2a', '#2a4a7a', '#8a7a2a', '#3a6a4a', '#6a3a6a', '#9a5a2a'];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        q.fillStyle = r2.pick(cols); q.fillRect(4 + i * 31, 4 + j * 31, 28, 28);
        q.fillStyle = 'rgba(255,255,255,0.5)'; q.fillRect(7 + i * 31, 8 + j * 31, 20, 3);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const pm = mat.std({ map: poster, color: 0xffffff, roughness: 0.6 });
    make.quad(1.4, 1.05, pm, { x: 1.105, y: 1.3, ry: Math.PI / 2, parent: g });
    make.quad(1.4, 1.05, pm, { x: -1.105, y: 1.3, ry: -Math.PI / 2, parent: g });
    g.updateMatrixWorld(true);
    const top = new THREE.Vector3(0, 2.95, 0.6).applyMatrix4(g.matrixWorld);
    make.neonSign({ text: name, pos: [top.x, top.y, top.z], ry, style: 'box', color: NEON.green, size: 0.32, intensity: 1.8 });
    const lp = new THREE.Vector3(0, 0.3, 1.3).applyMatrix4(g.matrixWorld);
    lights.add({ position: lp, color: WINDOW.warm, intensity: 1.0, radius: 3.5 });
    claim(x, z, 1.4);
    const sw = Math.abs(Math.sin(ry)) > 0.7;
    rect(x, z, sw ? 0.75 : 1.1, sw ? 1.1 : 0.75, 2.4);
  }

  // 宵夜烧烤摊：炭火槽（发光）+ 烟 + 塑料棚 + 一串灯泡 + 两张桌子
  function bbq(x, z) {
    const y = gy(x, z);
    // 烤炉推车（贴着楼 / 挡墙，长边沿 x）
    make.block(1.5, 0.78, 0.5, M.metalDk, { x, y, z });
    make.block(1.4, 0.03, 0.38, mat.neon(NEON.orange, 2.6), { x, y: y + 0.78, z });
    make.block(1.56, 0.06, 0.04, M.chrome, { x, y: y + 0.78, z: z - 0.25 });
    make.block(1.56, 0.06, 0.04, M.chrome, { x, y: y + 0.78, z: z + 0.25 });
    for (let i = 0; i < 9; i++) make.block(0.012, 0.012, 0.5, M.chrome, { x: x - 0.6 + i * 0.15 + rng.range(-0.03, 0.03), y: y + 0.84, z: z - 0.05, ry: rng.range(-0.1, 0.1) });
    for (const dx of [-0.65, 0.65]) make.block(0.05, 0.6, 0.05, M.rubber, { x: x + dx, y: y + 0.81, z: z + 0.22 });
    make.block(1.6, 0.04, 0.3, M.metal, { x, y: y + 1.38, z: z + 0.22 });   // 搁板（放调料）
    for (let i = 0; i < 6; i++) make.block(0.08, rng.range(0.1, 0.2), 0.08, rng.pick([M.bottle, M.tailOff, M.ceramic]), { x: x - 0.6 + i * 0.22, y: y + 1.42, z: z + 0.22 });
    for (const dx of [-0.5, -0.1, 0.35]) steam.push({ x: x + dx, y: y + 0.9, z, k: 1.2, rise: 2.4, n: 12 });
    lights.add({ position: new THREE.Vector3(x, y + 1.0, z - 0.6), color: NEON.orange, intensity: 1.6, radius: 6 });
    halos.add({ position: new THREE.Vector3(x, y + 0.95, z - 0.1), color: NEON.orange, size: 1.6, intensity: 0.35 });
    // 塑料棚：四根杆 + 下垂的棚布
    const zf = z - 2.25, x0 = x - 2.4, x1 = x + 2.4;
    const tarp = mat.std({ color: 0x2a5a8a, roughness: 0.5, side: THREE.DoubleSide });
    for (const [px, pz] of [[x0, z + 0.2], [x1, z + 0.2], [x0, zf], [x1, zf]]) make.block(0.05, pz === zf ? 2.3 : 2.65, 0.05, M.metal, { x: px, y, z: pz });
    const tg = new THREE.PlaneGeometry(x1 - x0 + 0.2, z + 0.2 - zf + 0.2, 10, 4);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const u = tp.getX(i) / (x1 - x0 + 0.2) + 0.5, v = tp.getY(i) / (z + 0.4 - zf) + 0.5;
      tp.setZ(i, -Math.sin(u * Math.PI * 5) * 0.03 - Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.12);
    }
    tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, tarp);
    const slope = Math.atan2(0.35, z + 0.2 - zf);
    tm.rotation.set(-Math.PI / 2 - slope, 0, 0);
    tm.position.set(x, y + 2.5, (z + zf) / 2);
    S.add(tm);
    // 棚檐垂边（遮住了视线上方，形成"框"）
    make.block(x1 - x0 + 0.2, 0.18, 0.01, tarp, { x, y: y + 2.15, z: zf - 0.1 });
    // 一串灯泡
    for (let i = 0; i < 5; i++) {
      const bx = x0 + 0.5 + i * ((x1 - x0 - 1) / 4), bz = zf + 0.6, by = y + 2.05 - Math.sin((i / 4) * Math.PI) * 0.15;
      P('bulb', bx, by, bz); P('cord', bx, by + 0.05, bz, 0, { s: [1, 0.3, 1] });
      if (i === 1 || i === 3) lamps.push({ x: bx, y: by, z: bz });
      else halos.add({ position: new THREE.Vector3(bx, by, bz), color: WINDOW.warm, size: 0.6, intensity: 0.4 });
    }
    ctx.wires.add(new THREE.Vector3(x0, y + 2.3, zf + 0.6), new THREE.Vector3(x1, y + 2.3, zf + 0.6), { sag: 0.2, r: 0.008 });
    // 桌凳
    for (const [tx, tz] of [[x - 1.3, z - 1.3], [x + 1.15, z - 1.4]]) {
      P('table', tx, y, tz, rng.range(0, 6.28));
      const a0 = rng.range(0, 6.28);
      for (let i = 0; i < 4; i++) {
        const a = a0 + i * Math.PI / 2 + rng.range(-0.3, 0.3), r = rng.range(0.58, 0.72);
        P('stool', tx + Math.cos(a) * r, y, tz + Math.sin(a) * r, rng.range(0, 6.28), { color: rng.pick(STOOL) });
      }
    }
    V.crates(x + 2.0, z - 0.1, 1);
    V.gas(x - 1.95, z);
    claim(x, z - 1, 2.5);
    rect(x, z - 1.0, 2.5, 1.3, 0.8);
  }

  // 自动售货机：前脸发光（冷白），配一盏光场灯
  function vending(x, z, ry) {
    const y = gy(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; S.add(g);
    make.block(0.92, 1.9, 0.75, mat.std({ color: 0x1e2a44, roughness: 0.35, metalness: 0.3 }), { parent: g });
    make.quad(0.6, 1.05, vendMat, { x: -0.1, y: 1.22, z: 0.376, parent: g });
    make.block(0.18, 0.5, 0.02, mat.neon(NEON.white, 1.2), { x: 0.3, y: 1.1, z: 0.37, parent: g });
    make.block(0.6, 0.18, 0.06, M.rubber, { x: -0.1, y: 0.3, z: 0.38, parent: g });
    g.updateMatrixWorld(true);
    lights.add({ position: new THREE.Vector3(0, 1.2, 0.9).applyMatrix4(g.matrixWorld), color: NEON.white, intensity: 1.0, radius: 4.5 });
    claim(x, z, 0.55);
    rect(x, z, 0.5, 0.5, 1.9);
  }
  function signpost(x, z) {
    const y = gy(x, z);
    make.block(0.08, 2.9, 0.08, M.metalDk, { x, y, z });
    const rows = [['朝天门  2.4km →', 0.35], ['← 洪崖洞  1.1km', -0.25], ['↑ 十八梯', 0.05]];
    const c = ctx.tex.canvas(256, 192), q = c.getContext('2d');
    rows.forEach(([t], i) => {
      q.fillStyle = '#1a3a6a'; q.fillRect(0, i * 64, 256, 64);
      q.strokeStyle = '#d0d4dc'; q.lineWidth = 3; q.strokeRect(4, i * 64 + 4, 248, 56);
      q.fillStyle = '#e8ecf2'; q.font = `700 28px ${CN_FONT}`; q.textAlign = 'center'; q.textBaseline = 'middle';
      q.fillText(t, 128, i * 64 + 33);
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sm = mat.std({ map: tex, color: 0xffffff, roughness: 0.35, side: THREE.DoubleSide });
    rows.forEach(([, ry], i) => {
      const geo = new THREE.PlaneGeometry(0.95, 0.24);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / 3);
      const m = new THREE.Mesh(geo, sm);
      m.position.set(x + Math.cos(ry) * 0.45, y + 2.6 - i * 0.3, z - Math.sin(ry) * 0.45);
      m.rotation.y = ry;
      S.add(m);
    });
  }

  // ================================================================ 灯泡：光场 + 光晕
  for (const b of lamps) {
    lights.add({ position: new THREE.Vector3(b.x, b.y - 0.12, b.z), color: WINDOW.warm, intensity: 1.7, radius: 5.5 });
    halos.add({ position: new THREE.Vector3(b.x, b.y, b.z), color: WINDOW.warm, size: 0.9, intensity: 0.5 });
  }

  // 有一辆车打着双闪（橙色转向灯，t 决定）
  {
    const sc = roadRow.filter(v => v.x > 8 && v.x < 20)[1] || roadRow[0];
    if (sc) {
      const Y = new THREE.Vector3(0, 1, 0), base = new THREE.Vector3(sc.x, sc.y, sc.z);
      const pts = [[0.2, 0.6, -1.0], [-0.2, 0.6, -1.0], [0.2, 0.95, 0.47], [-0.2, 0.95, 0.47]]
        .map(([a, b, c]) => new THREE.Vector3(a, b, c).applyAxisAngle(Y, sc.ry).add(base));
      const bulbs = pts.map(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), mat.neon(NEON.amber, 5)); m.position.copy(p); ctx.dynamicRoot.add(m); return m; });
      const h = lights.add({ position: base.clone().setY(sc.y + 0.8), color: NEON.amber, intensity: 0.8, radius: 3.2 });
      const hl = [halos.add({ position: pts[0], color: NEON.amber, size: 0.5, intensity: 0.4 }), halos.add({ position: pts[2], color: NEON.amber, size: 0.5, intensity: 0.4 })];
      ctx.onUpdate((dt, t) => {
        const on = (t * 1.5) % 1 < 0.5 ? 1 : 0;
        h.intensity = 0.8 * on;
        for (const x of hl) x.intensity = 0.4 * on;
        for (const m of bulbs) m.visible = !!on;
      });
    }
  }

  addSteam(ctx, steam);
  kit.build(S);
  ctx.provide('walkways', walk);
}
