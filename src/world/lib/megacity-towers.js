// 江对岸巨构塔楼：手工摆放的屏幕宿主塔 + 雾都塔 + 随机巨构群（退台 / 收分棱柱 / 斜切顶 / 腰部平台 / 双塔连廊 / 蜂巢簇）
import * as THREE from 'three';
import { MEGA } from '../layout.js';
import { MegaGeo, ColorGeo, ST, LAND_Y } from './megacity-gl.js';
import { SCREENS, VIEW, screenYaw } from './megacity-plan.js';
import { NEON } from '../../core/palette.js';

const HUE = { cyan: 0, magenta: 1, violet: 2, hotpot: 3, amber: 4, teal: 5, pink: 6, blue: 7 };
const hueV = k => (HUE[k] + 0.5) / 8;

// 返回：{ geo: MegaGeo, emit: ColorGeo, tops: [{x,y,z,h}], mounts: Map(screenId → {x,y,z,ry,frontZ}) }
export function buildTowers(ctx, glows) {
  const rng = ctx.rng('towers');
  const G = new MegaGeo();
  const E = new ColorGeo();
  const tops = [];
  const mounts = new Map();
  const occupied = [];   // {x, z, r}
  const info = (style, hue, lit = 0.3, seed = rng()) => [seed, style, lit, hue];

  const beacon = (x, y, z, big = false) => glows.add([x, y, z], NEON.hotpot, big ? 9 : 5, big ? 5 : 3, [2.2, 0.14, rng()]);

  // -------------------------------------------------- 天线束 / 尖塔 / 停机坪 等塔冠
  function crown(x, y, z, w, d, ry, hue, kind = rng.weighted([['antenna', 3], ['spire', 2], ['pad', 1.5], ['none', 1.5]])) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const loc = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let topY = y;
    if (kind === 'antenna') {
      const n = rng.int(2, 5);
      for (let i = 0; i < n; i++) {
        const [ax, az] = loc(rng.range(-w * 0.3, w * 0.3), rng.range(-d * 0.3, d * 0.3));
        const h = rng.range(15, 55);
        G.box(ax, y, az, rng.range(1.2, 2.4), h, rng.range(1.2, 2.4), ry, info(ST.DARK, hue, 0));
        beacon(ax, y + h + 1, az);
        topY = Math.max(topY, y + h);
      }
    } else if (kind === 'spire') {
      const h = rng.range(40, 110);
      G.prism({ cx: x, cz: z, y0: y, y1: y + h, rx: Math.min(w, d) * 0.18, rz: Math.min(w, d) * 0.18, taper: 0.06, sides: 4, rot: ry, info: info(ST.DARK | ST.EDGE, hue, 0) });
      beacon(x, y + h + 2, z, true);
      topY = y + h;
    } else if (kind === 'pad') {
      G.prism({ cx: x, cz: z, y0: y, y1: y + 3, rx: w * 0.62, rz: d * 0.62, sides: 8, rot: ry, info: info(ST.DARK | ST.TOP, hue, 0) });
      for (let k = 0; k < 4; k++) {
        const [ax, az] = loc(Math.cos(k * 1.57) * w * 0.5, Math.sin(k * 1.57) * d * 0.5);
        glows.add([ax, y + 4, az], NEON.white, 4, 2.5, [1.2, 0.5, k * 0.25]);
      }
      topY = y + 3;
    }
    return topY;
  }

  // -------------------------------------------------- 造型
  const FORMS = {
    // 退台：2–4 级逐级收进；最上一级可能斜切
    setback(t) {
      let y = LAND_Y, w = t.w, d = t.d;
      const tiers = rng.int(2, 4);
      const fr = [];
      for (let k = 0; k < tiers; k++) fr.push(k === 0 ? rng.range(0.4, 0.6) : rng.range(0.5, 1));
      const sum = fr.reduce((a, b) => a + b, 0);
      for (let k = 0; k < tiers; k++) {
        const h = (t.h - LAND_Y) * fr[k] / sum;
        const last = k === tiers - 1;
        const slant = last && rng.chance(0.4) ? rng.range(0.15, 0.35) * Math.min(h, w) : 0;
        const style = t.style | (k < tiers - 1 ? ST.TOP : 0) | (t.edge ? ST.EDGE : 0);
        G.box(t.x, y, t.z, w, h - Math.max(0, slant), d, t.ry, info(style, t.hue, t.lit, t.seed + k * 0.1), { slant, slantDir: rng.range(0, 6.28) });
        y += h - Math.max(0, slant);
        if (!last) { w *= rng.range(0.66, 0.86); d *= rng.range(0.66, 0.86); }
      }
      return crown(t.x, y, t.z, w, d, t.ry, t.hue);
    },
    // 收分棱柱（六角 / 八角），顶部尖塔或斜切
    taper(t) {
      const sides = rng.pick([6, 8, 8]);
      const r = Math.max(t.w, t.d) * 0.55;
      const h1 = (t.h - LAND_Y) * rng.range(0.55, 0.75);
      const tp = rng.range(0.7, 0.9);
      G.prism({ cx: t.x, cz: t.z, y0: LAND_Y, y1: LAND_Y + h1, rx: r, rz: r, taper: tp, sides, rot: t.ry, info: info(t.style | ST.TOP, t.hue, t.lit, t.seed) });
      const r2 = r * tp * rng.range(0.8, 0.95);
      const h2 = t.h - LAND_Y - h1;
      const slant = rng.chance(0.5) ? h2 * rng.range(0.15, 0.3) : 0;
      G.prism({ cx: t.x, cz: t.z, y0: LAND_Y + h1, y1: t.h - slant, rx: r2, rz: r2, taper: rng.range(0.55, 0.85), sides, rot: t.ry,
        info: info(t.style | (t.edge ? ST.EDGE : 0), t.hue, t.lit, t.seed + 0.3), slant, slantDir: rng.range(0, 6.28) });
      return crown(t.x, t.h, t.z, r2, r2, t.ry, t.hue, slant ? 'none' : rng.pick(['spire', 'antenna']));
    },
    // 厚板楼 + 腰部外挑平台
    waist(t) {
      const levels = rng.int(1, 3);
      let y = LAND_Y;
      const seg = (t.h - LAND_Y) / (levels + 1);
      for (let k = 0; k <= levels; k++) {
        const top = k === levels ? t.h : y + seg;
        const sh = k === levels ? rng.range(0.8, 0.95) : 1;
        G.box(t.x, y, t.z, t.w * (k === levels ? 0.85 : 1), top - y, t.d, t.ry, info(t.style | (t.edge ? ST.EDGE : 0), t.hue, t.lit, t.seed + k * 0.2), { taper: sh });
        if (k < levels) {
          G.prism({ cx: t.x, cz: t.z, y0: top, y1: top + rng.range(4, 7), rx: t.w * rng.range(0.7, 0.95), rz: t.d * rng.range(0.8, 1.1), sides: 8, rot: t.ry + Math.PI / 8,
            info: info(ST.DARK | ST.TOP | ST.EDGE, (t.hue + 0.375) % 1, 0.1) });
          y = top + 5;
        }
      }
      return crown(t.x, t.h, t.z, t.w * 0.8, t.d * 0.8, t.ry, t.hue);
    },
    // 双塔 + 空中连廊
    twin(t) {
      const off = t.w * 0.42, c = Math.cos(t.ry), s = Math.sin(t.ry);
      const hA = t.h, hB = t.h * rng.range(0.7, 0.92);
      const ww = t.w * 0.42;
      const A = [t.x - off * c, t.z + off * s], B = [t.x + off * c, t.z - off * s];
      G.box(A[0], LAND_Y, A[1], ww, hA - LAND_Y, t.d, t.ry, info(t.style | ST.EDGE, t.hue, t.lit, t.seed), { taper: 0.9 });
      G.box(B[0], LAND_Y, B[1], ww, hB - LAND_Y, t.d * 0.9, t.ry, info(t.style | ST.EDGE, t.hue, t.lit, t.seed + 0.5), { taper: 0.9 });
      const nb = rng.int(1, 3);
      for (let k = 0; k < nb; k++) {
        const y = hB * rng.range(0.35, 0.85);
        G.box(t.x, y, t.z, off * 2, rng.range(6, 12), t.d * 0.35, t.ry, info(ST.OFFICE | ST.EDGE | ST.TOP, (t.hue + 0.25) % 1, 0.6));
      }
      crown(A[0], hA, A[1], ww, t.d, t.ry, t.hue, 'spire');
      return crown(B[0], hB, B[1], ww, t.d * 0.9, t.ry, t.hue, 'antenna');
    },
    // 蜂巢簇：几根不同高度的六角筒
    cluster(t) {
      const n = rng.int(3, 4);
      let top = 0;
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.28 + t.ry;
        const rr = k === 0 ? 0 : Math.max(t.w, t.d) * 0.32;
        const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
        const h = k === 0 ? t.h : t.h * rng.range(0.5, 0.85);
        const r = Math.max(t.w, t.d) * (k === 0 ? 0.3 : 0.22);
        G.prism({ cx: x, cz: z, y0: LAND_Y, y1: h, rx: r, rz: r, sides: 6, rot: t.ry, taper: rng.range(0.85, 1),
          info: info((k === 0 ? t.style : ST.RESI) | ST.TOP | (k === 0 && t.edge ? ST.EDGE : 0), t.hue, t.lit, t.seed + k * 0.17) });
        if (k === 0) top = crown(x, h, z, r, r, t.ry, t.hue, 'antenna');
      }
      return top;
    },
  };

  // -------------------------------------------------- 雾都塔
  {
    const { x, z, h } = MEGA.hero;
    const rot = Math.PI / 8;   // 让八角形有一个正南立面
    G.prism({ cx: x, cz: z, y0: LAND_Y, y1: 46, rx: 78, rz: 64, sides: 8, rot, info: info(ST.OFFICE | ST.TOP, hueV('amber'), 0.55) });
    const steps = [[46, 130, 50], [130, 220, 47], [220, 310, 44], [310, 400, 41], [400, 480, 38]];
    for (const [y0, y1, r] of steps) {
      G.prism({ cx: x, cz: z, y0, y1, rx: r, rz: r, sides: 8, rot, info: info(ST.MONO | ST.EDGE, hueV('cyan'), 0.25) });
      // 光环平台
      G.prism({ cx: x, cz: z, y0: y1, y1: y1 + 5, rx: r * 1.32, rz: r * 1.32, sides: 8, rot, info: info(ST.DARK | ST.TOP, hueV('cyan'), 0) });
      const ring = new THREE.CylinderGeometry(r * 1.34, r * 1.34, 1.6, 48, 1, true);
      E.add(ring, NEON.cyan, 4.0, new THREE.Matrix4().makeTranslation(x, y1 + 3.4, z));
      const ring2 = new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.8, 48, 1, true);
      E.add(ring2, NEON.white, 2.0, new THREE.Matrix4().makeTranslation(x, y1 - 6, z));
    }
    // 四片竖向刀片（对角线），品红边缘
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const bx = x + Math.cos(a) * 48, bz = z + Math.sin(a) * 48;
      G.box(bx, 46, bz, 3, 430, 22, Math.PI / 2 - a, info(ST.DARK | ST.EDGE, hueV('magenta'), 0), { taper: 0.8 });
    }
    // 上部：媒体立面细腰 + 外翻塔冠 + 尖塔
    G.prism({ cx: x, cz: z, y0: 485, y1: 650, rx: 31, rz: 31, sides: 8, rot, taper: 0.78, info: info(ST.MEDIA | ST.EDGE, hueV('magenta'), 0.2) });
    for (const y of [560, 650]) {
      const r = y === 560 ? 30 : 26;
      E.add(new THREE.CylinderGeometry(r, r, 1.4, 40, 1, true), NEON.magenta, 4.0, new THREE.Matrix4().makeTranslation(x, y, z));
    }
    G.prism({ cx: x, cz: z, y0: 650, y1: 735, rx: 24, rz: 24, sides: 8, rot, taper: 1.45, info: info(ST.DARK | ST.EDGE | ST.TOP, hueV('cyan'), 0) });
    G.prism({ cx: x, cz: z, y0: 735, y1: h, rx: 12, rz: 12, sides: 4, rot: 0, taper: 0.05, info: info(ST.DARK | ST.EDGE, hueV('cyan'), 0) });
    E.add(new THREE.CylinderGeometry(34.5, 34.5, 2, 40, 1, true), NEON.white, 5.0, new THREE.Matrix4().makeTranslation(x, 733, z));
    glows.add([x, h + 2, z], NEON.white, 26, 4, [1.6, 0.08, 0]);
    for (const y of [480, 650, 735]) for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, r = y === 480 ? 52 : 34;
      glows.add([x + Math.cos(a) * r, y + 6, z + Math.sin(a) * r], NEON.hotpot, 8, 4, [2.2, 0.14, 0.5]);
    }
    // 竖排字幕屏的挂点：正南立面
    const sc = SCREENS.find(s => s.id === 'subHero');
    // 光环平台外缘 ≈ 61 m，屏幕挂在 68 m 处的竖向桅杆上
    G.box(x, sc.y - sc.h / 2 - 8, z + 51, sc.w + 6, sc.h + 16, 34, 0, info(ST.DARK | ST.EDGE, hueV('magenta'), 0));
    mounts.set('subHero', { x, y: sc.y, z: z + 68.6, ry: 0 });
    occupied.push({ x, z, r: 95 });
    tops.push({ x, y: h, z, hero: true });
  }

  // -------------------------------------------------- 屏幕宿主塔
  for (const sc of SCREENS) {
    if (!sc.host) continue;
    const H = sc.host;
    const ry = screenYaw(H.x, H.z);
    const c = Math.cos(ry), s = Math.sin(ry);
    const hue = rng.pick([hueV('cyan'), hueV('magenta'), hueV('violet'), hueV('amber')]);
    // 主体：暗色 + 边缘霓虹，正面为平面以挂屏
    G.box(H.x, LAND_Y, H.z, H.w, H.h - LAND_Y, H.d, ry, info(ST.OFFICE | ST.EDGE, hue, 0.22));
    // 退台 + 塔冠
    const w2 = H.w * rng.range(0.55, 0.75), d2 = H.d * 0.7;
    const h2 = rng.range(40, 120);
    G.box(H.x - s * H.d * 0.1, H.h, H.z - c * H.d * 0.1, w2, h2, d2, ry, info(ST.MONO | ST.EDGE | ST.TOP, hue, 0.2), { slant: rng.chance(0.5) ? rng.range(8, 25) : 0, slantDir: rng.range(0, 6.28) });
    crown(H.x, H.h + h2, H.z, w2, d2, ry, hue, 'antenna');
    // 屏幕背框（向外凸出 3 m）
    const fz = H.d / 2;
    const bx = H.x + s * (fz + 1.5), bz = H.z + c * (fz + 1.5);
    G.box(bx, sc.y - sc.h / 2 - 3, bz, sc.w + 6, sc.h + 6, 3, ry, info(ST.DARK | ST.EDGE, hue, 0));
    mounts.set(sc.id, { x: H.x + s * (fz + 3.2), y: sc.y, z: H.z + c * (fz + 3.2), ry });
    occupied.push({ x: H.x, z: H.z, r: Math.hypot(H.w, H.d) * 0.5 });
    tops.push({ x: H.x, y: H.h + h2, z: H.z });
  }

  // -------------------------------------------------- 遮挡检查：随机塔楼不得挡住屏幕 / 雾都塔
  const targets = SCREENS.map(sc => {
    const m = sc.host ? { x: sc.host.x, z: sc.host.z } : { x: sc.x, z: sc.z };
    return { x: m.x, z: m.z + 30, hw: sc.w / 2 + 6, y0: sc.y - sc.h / 2 };
  });
  targets.push({ x: MEGA.hero.x, z: MEGA.hero.z + 50, hw: 45, y0: 120 });
  const blocks = (x, z, r, h) => {
    for (const v of VIEW.slice(0, 2)) {
      const dist = Math.hypot(x - v.x, z - v.z);
      const az = Math.atan2(x - v.x, v.z - z), half = Math.atan(r / dist);
      const el = Math.atan2(h - v.y, dist);
      for (const tg of targets) {
        const dt = Math.hypot(tg.x - v.x, tg.z - v.z);
        if (dist > dt - 20) continue;
        const azT = Math.atan2(tg.x - v.x, v.z - tg.z), halfT = Math.atan(tg.hw / dt);
        if (Math.abs(az - azT) > half + halfT) continue;
        if (el > Math.atan2(tg.y0 - v.y, dt)) return true;
      }
    }
    return false;
  };

  // -------------------------------------------------- 随机巨构群
  const placed = [];
  const tryPlace = (x, z) => {
    const depth = (MEGA.zNear - z) / (MEGA.zNear - MEGA.zFar);     // 0 近 .. 1 远
    const axis = Math.exp(-Math.pow(x / 380, 2));
    const s = (26 + 34 * depth) * rng.range(0.75, 1.3);
    const w = s * rng.range(0.8, 1.4), d = s * rng.range(0.7, 1.1);
    const r = Math.hypot(w, d) * 0.5;
    for (const o of occupied) if (Math.hypot(o.x - x, o.z - z) < o.r + r + 8) return false;
    let h = (120 + 330 * Math.pow(depth, 0.85)) * rng.range(0.6, 1.3) * (1 + 0.45 * axis);
    if (rng.chance(0.08)) h *= 1.35;
    if (Math.hypot(x - MEGA.hero.x, z - MEGA.hero.z) < 260) h = Math.min(h, 360);
    h = Math.min(h, 690);
    if (blocks(x, z, r, h)) {
      h = Math.min(h, 120 + 200 * depth);
      if (blocks(x, z, r, h)) return false;
    }
    const style = rng.weighted([[ST.OFFICE, 4], [ST.RESI, 2.5], [ST.MONO, 2], [ST.MEDIA, 0.8], [ST.BANDS, 1.5], [ST.DARK, 0.8]]);
    const t = { x, z, w, d, h, ry: rng.range(-0.35, 0.35), style, edge: rng.chance(0.45), hue: rng(), lit: rng.range(0.18, 0.5), seed: rng() };
    const form = rng.weighted([['setback', 4], ['taper', 2.5], ['waist', 2], ['twin', 1], ['cluster', 1.2]]);
    const top = FORMS[form](t);
    occupied.push({ x, z, r });
    placed.push({ ...t, form });
    tops.push({ x, y: top, z, h });
    return true;
  };
  for (let z = MEGA.zNear - 25; z > MEGA.zFar + 20; z -= rng.range(48, 70)) {
    const depth = (MEGA.zNear - z) / (MEGA.zNear - MEGA.zFar);
    const span = 520 + 700 * depth;
    for (let x = -span; x < span; x += rng.range(55, 85)) {
      const axis = Math.exp(-Math.pow(x / 420, 2));
      if (!rng.chance(0.3 + 0.5 * axis)) continue;
      tryPlace(x + rng.range(-20, 20), z + rng.range(-15, 15));
    }
  }

  // -------------------------------------------------- 空中连廊：相邻高塔之间
  let nBridge = 0;
  for (let i = 0; i < placed.length && nBridge < 14; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const dd = Math.hypot(a.x - b.x, a.z - b.z);
      if (dd > 140 || dd < 50 || Math.min(a.h, b.h) < 180) continue;
      if (blocks((a.x + b.x) / 2, (a.z + b.z) / 2, dd / 2, Math.min(a.h, b.h) * 0.7)) continue;
      const y = Math.min(a.h, b.h) * rng.range(0.45, 0.75);
      const ry = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      G.box((a.x + b.x) / 2, y, (a.z + b.z) / 2, dd, rng.range(5, 9), rng.range(8, 14), ry, info(ST.OFFICE | ST.EDGE, (a.hue + 0.5) % 1, 0.7));
      nBridge++;
      break;
    }
  }

  return { geo: G, emit: E, tops, mounts, placed };
}
