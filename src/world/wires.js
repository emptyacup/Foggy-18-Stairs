// wires —— 头顶层：两侧纵向电线束、沿墙电缆、墙角下行线束 + 电表箱、水泥电线杆（横担/变压器/盘线）、
// 晾衣绳与竹竿晾衣、暖色灯串。读取 'facades'（buildings 发布），缺失时用 layout.LOTS 兜底。
// 密度不是均匀的：沿梯坎设几个"乱点"（hub），机位附近与乱点处最密，其余地方稀疏。
import * as THREE from 'three';
import { NEON, WINDOW } from '../core/palette.js';
import { makeParts } from './lib/wires-parts.js';

function fallbackFacades(L) {
  return L.LOTS.map(l => {
    const ry = l.side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const t = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const zs = l.side === 'W' ? l.z0 : l.z1;
    const origin = new THREE.Vector3(l.front, 0, zs);
    const podiumTop = Math.max(L.stairHeightAt(l.z0), L.stairHeightAt(l.z1)) + 4.2;
    return { id: l.id, face: l.side === 'W' ? 'E' : 'W', ry, normal: n, tangent: t, origin, length: Math.abs(l.z0 - l.z1),
      ground: l.ground, podiumTop, top: l.ground + l.height, floors: Math.round((l.height - 4.2) / 3), floorH: 3,
      frontPlane: l.front, point: (u, y, out = 0) => origin.clone().addScaledVector(t, u).addScaledVector(n, out).setY(y) };
  });
}

export function build(ctx) {
  const { L } = ctx;
  const rng = ctx.rng('wires');
  const published = ctx.use('facades') || [];
  const all = fallbackFacades(L).map(f => published.find(p => p.id === f.id) || f);
  const lots = all.filter(f => /^[WE]\d$/.test(f.id));
  if (!lots.length) return;
  const P = makeParts(ctx);
  const G = z => L.stairHeightAt(z);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------------------------------------------------------------- 立面查询
  for (const f of lots) {
    const a = f.point(0, 0, 0), b = f.point(f.length, 0, 0);
    f._zMin = Math.min(a.z, b.z); f._zMax = Math.max(a.z, b.z);
    f._side = f.id[0];
  }
  const facadeAt = (side, z) => {
    const c = lots.filter(f => f._side === side);
    return c.find(f => z >= f._zMin && z <= f._zMax)
      || c.reduce((best, f) => (Math.abs((f._zMin + f._zMax) / 2 - z) < Math.abs((best._zMin + best._zMax) / 2 - z) ? f : best));
  };
  const uAt = (f, z) => {
    const o = f.point(0, 0, 0), t = f.point(1, 0, 0).sub(o);
    return THREE.MathUtils.clamp((z - o.z) / (Math.abs(t.z) > 1e-3 ? t.z : 1), 0.25, f.length - 0.25);
  };
  const yMin = f => f.podiumTop + 0.35;
  const yMax = f => f.top - 1.2;
  // 墙面落点：side='W'|'E'，y 被夹在 [基座顶 + 0.35, 楼顶 - 1.2]
  const wall = (side, z, y, out = 0.3) => {
    const f = facadeAt(side, z);
    const u = uAt(f, z);
    const yy = THREE.MathUtils.clamp(y, yMin(f), Math.max(yMin(f), yMax(f)));
    return { f, u, y: yy, p: f.point(u, yy, out) };
  };

  // 线：保证最低点在地面 clear 米以上（按中点估算）
  const span = (a, b, sag, r, clear = 4.0) => {
    const midY = (a.y + b.y) / 2;
    const g = Math.max(G(a.z), G(b.z), G((a.z + b.z) / 2));
    const s = Math.max(0.03, Math.min(sag, midY - g - clear));
    ctx.wires.add(a, b, { sag: s, r });
    return s;
  };
  const rWire = () => rng.weighted([[0.008, 3], [0.011, 4], [0.015, 3], [0.02, 2], [0.03, 1]]);
  const jit = (p, dz, dy) => p.clone().add(V(0, rng.range(-dy, dy), rng.range(-dz, dz)));

  // 记录各立面上的线束落点，之后给它们加下行线束
  const drops = [];

  // ---------------------------------------------------------------- 1. 两侧纵向电线束
  // 每个地块沿同侧立面设置线束，近处较密；两端都在 |x| > 6。
  const sideBundle = (side, z, { lo = 5, hi = 10, n = [3, 6], tight = false } = {}) => {
    const zA = THREE.MathUtils.clamp(z + rng.range(1, 3), L.STAIR.zBottom + 0.5, L.STAIR.zTop - 0.5);
    const zB = THREE.MathUtils.clamp(z - rng.range(2, 5), L.STAIR.zBottom + 0.5, L.STAIR.zTop - 0.5);
    const A = wall(side, zA, G(zA) + rng.range(lo, hi), rng.range(0.25, 0.55));
    const B = wall(side, zB, G(zB) + rng.range(lo, hi), rng.range(0.25, 0.55));
    const kA = P.wallBracket(A.f, A.u, A.y, 0.55, 3);
    const kB = P.wallBracket(B.f, B.u, B.y, 0.55, 3);
    for (let i = 0, count = rng.int(...n); i < count; i++) {
      const a = jit(tight ? A.p : rng.pick(kA), 0.08, 0.06);
      const b = jit(tight ? B.p : rng.pick(kB), 0.08, 0.06);
      span(a, b, rng.range(0.3, 1.1), tight ? 0.018 : rWire());
    }
    drops.push(A, B);
  };
  for (const f of lots) {
    const z = (f._zMin + f._zMax) / 2;
    const n = f.id.endsWith('1') || f.id.endsWith('2') ? 3 : 2;
    for (let i = 0; i < n; i++) sideBundle(f._side, z + rng.range(-3, 3));
    sideBundle(f._side, z, { n: [5, 7], tight: true });
    // 同一立面的余缆，以大下垂打破整齐的走线。
    const A = wall(f._side, z, G(z) + rng.range(6, 10), 0.15);
    const b = f.point(THREE.MathUtils.clamp(A.u + rng.range(1, 2.2), 0.2, f.length - 0.2), A.y, 0.15);
    ctx.wires.add(A.p, b, { sag: rng.range(0.6, 1.1), r: 0.02 });
  }

  // ---------------------------------------------------------------- 2. 同侧屋顶之间的长线
  for (const side of ['W', 'E']) {
    const fs = lots.filter(f => f._side === side).sort((a, b) => b._zMax - a._zMax);
    for (let i = 0; i < fs.length - 1; i++) {
      const a = fs[i], b = fs[i + 1];
      const A = wall(side, (a._zMin + a._zMax) / 2, a.top - 0.7, 0.2).p;
      const B = wall(side, (b._zMin + b._zMax) / 2, b.top - 1.0, 0.2).p;
      for (let k = 0; k < 2; k++) span(jit(A, 0.1, 0.1), jit(B, 0.1, 0.1), rng.range(0.8, 1.6), rWire(), 5);
    }
  }

  // ---------------------------------------------------------------- 3. 平台两侧电线杆
  // 6 m 平台选择首末两个，偏离平台中心，避开 terrain 的 x=±8.6 路灯。
  const broad = L.FLIGHTS.filter(f => f.type === 'landing' && f.z0 - f.z1 >= 5);
  const poleLandings = broad.length > 1 ? [broad[0], broad[broad.length - 1]] : broad;
  const poles = [];
  for (const s of [-1, 1]) {
    for (const f of poleLandings) {
      poles.push(P.pole(s * (L.STAIR.x1 - 2.6), (f.z0 + f.z1) / 2 + 1.4, 9.5, -s, rng));
    }
  }
  ctx.provide('wirePoles', poles.map(p => ({ x: p.x, z: p.z })));
  // 同侧电杆间的纵向架空线。
  for (const s of [-1, 1]) {
    const ps = poles.filter(p => Math.sign(p.x) === s);
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i], b = ps[i + 1];
      for (let k = 0; k < 4; k++) span(a.tops[k], b.tops[k], rng.range(0.9, 1.6), 0.015);
    }
  }
  for (const pl of poles) {
    const side = pl.x < 0 ? 'W' : 'E';
    for (let k = 0; k < pl.bush.length; k++) span(pl.bush[k], pl.tops[4 + k], 0.12, 0.012, 0.5);
    // 杆顶只连接所在一侧的立面。
    for (let k = 0; k < 8; k++) {
      const from = rng.pick(pl.tops);
      const T = wall(side, pl.z + rng.range(-7, 7), from.y + rng.range(-3, 1.5), rng.range(0.1, 0.4));
      span(jit(from, 0.02, 0.01), T.p, rng.range(0.2, 0.9), rWire());
      if (k % 4 === 0) drops.push(T);
    }
    for (let k = 0; k < 4; k++) {
      ctx.wires.add(rng.pick(pl.tops), V(pl.x + pl.side * 0.2, pl.base + 3.0, pl.z), { sag: 0.05, r: 0.012 });
    }
    for (let k = 0; k < 3; k++) {
      const z = pl.z + rng.range(-3, 3), f = facadeAt(side, z);
      const t = f.point(uAt(f, z), f.podiumTop - 0.2, 0.2);
      ctx.wires.add(V(pl.x + pl.side * 0.2, pl.base + 3.1, pl.z), t, { sag: rng.range(0.1, 0.4), r: 0.011 });
    }
  }

  // ---------------------------------------------------------------- 4. 立面：水平走线 + 墙角下行线束 + 电表箱
  for (const f of lots) {
    const fr = ctx.rng('facade-' + f.id);
    // 4a. 水平电缆：每 1.5–2.5 m 一个线卡，卡间微微下垂
    const runs = fr.int(1, 3);
    for (let r = 0; r < runs; r++) {
      const y = f.podiumTop + fr.range(0.5, Math.min(7, Math.max(1, f.top - f.podiumTop - 2)));
      const out = fr.range(0.06, 0.14);
      const u0 = fr.range(0.3, 2), u1 = f.length - fr.range(0.3, 2);
      const nc = fr.int(2, 4);
      let u = u0;
      while (u < u1 - 0.3) {
        const un = Math.min(u1, u + fr.range(1.5, 2.6));
        for (let c = 0; c < nc; c++) {
          ctx.wires.add(f.point(u, y + c * 0.045, out + c * 0.02), f.point(un, y + c * 0.045, out + c * 0.02),
            { sag: fr.range(0.03, 0.12), r: c === 0 ? 0.016 : 0.01 });
        }
        P.box(0.05, 0.05 * nc + 0.05, 0.05, P.M.steel, f.point(un, y - 0.04, out / 2), f.ry);
        u = un;
      }
    }
    // 4b. 墙角下行线束：从高处汇集下来，落到电表箱
    const nRise = fr.int(1, 2);
    for (let r = 0; r < nRise; r++) {
      const u = r === 0 ? fr.pick([0.35, f.length - 0.35]) : fr.range(2, f.length - 2);
      const yBox = f.podiumTop + 0.4;
      const boxTop = P.meterCluster(f, u, yBox, fr);
      const yTop = Math.min(f.top - 1.5, f.podiumTop + fr.range(5, 12));
      const n = fr.int(4, 9);
      for (let k = 0; k < n; k++) {
        const du = (k - n / 2) * 0.035;
        const a = f.point(u + du + fr.range(-0.3, 0.3), yTop - fr.range(0, 3), 0.1 + fr.range(0, 0.08));
        const b = boxTop.clone().add(f.point(du, 0, 0).sub(f.point(0, 0, 0)));
        ctx.wires.add(a, b, { sag: fr.range(0.02, 0.08), r: fr.pick([0.01, 0.013, 0.018]) });
      }
      // 竖向线槽
      P.box(0.12, yTop - boxTop.y - 1.5, 0.06, P.M.boxPale, f.point(u + 0.25, boxTop.y + 0.2, 0.04), f.ry);
      // 电表箱 → 绕过挑檐 → 底商（入户线）
      for (let k = 0; k < fr.int(2, 4); k++) {
        const t = f.point(u + fr.range(-1.5, 1.5), f.podiumTop - fr.range(0.6, 1.1), 1.0 + fr.range(0, 0.2));
        ctx.wires.add(boxTop.clone().add(V(0, -0.3, 0)).addScaledVector(f.normal, 0.1), t, { sag: fr.range(0.05, 0.25), r: 0.01 });
      }
      if (fr.chance(0.6)) P.coil(f.point(u + fr.range(-0.6, 0.6), yBox + fr.range(1.4, 2.4), 0.2), fr, fr.int(2, 3));
    }
  }
  // 纵向线束的落点 → 沿墙垂下几根到下方（"汇集"的感觉）
  for (const d of drops) {
    if (!rng.chance(0.55)) continue;
    const yb = Math.max(d.f.podiumTop + 0.3, d.y - rng.range(2, 6));
    for (let k = 0, n = rng.int(2, 4); k < n; k++) {
      const a = d.p.clone().add(V(0, rng.range(-0.05, 0.05), 0));
      const b = d.f.point(d.u + rng.range(-0.5, 0.5), yb, 0.12);
      ctx.wires.add(a, b, { sag: rng.range(0.05, 0.3), r: 0.01 });
    }
  }

  // ---------------------------------------------------------------- 5. 晾衣
  const KINDS = [['shirt', 5], ['pants', 3], ['towel', 3], ['small', 2], ['dress', 1]];
  const hangAlong = (a, b, sag, { from = 0.12, to = 0.88, minGap = 0.35, maxGap = 0.8, clear = 2.45, kinds = KINDS, scale = 1 } = {}) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const ry = Math.atan2(-d.z, d.x);
    let k = from + rng.range(0, 0.06);
    while (k < to) {
      const p = a.clone().lerp(b, k);
      p.y -= sag * 4 * k * (1 - k) + 0.01;
      const x = p.x;
      const kind = rng.weighted(kinds);
      const h = { shirt: 0.62, pants: 0.86, towel: 0.55, small: 0.24, dress: 0.85, sheet: 1.12 }[kind] * scale;
      const g = L.heightAt(x, p.z);
      // 梯坎中线 2.4 m 净空；其它地方也别拖到地上
      const lim = Math.abs(x) < 1.6 ? clear : 1.0;
      if (p.y - h - g >= lim) P.cloth(kind, p, ry, rng, scale);
      else if (rng.chance(0.5)) P.cloth('small', p, ry, rng, scale);
      k += rng.range(minGap, maxGap) / len;
    }
  };
  // 5a. 平台旁同侧立面之间的晾衣绳。
  for (const f of broad) {
    const z = (f.z0 + f.z1) / 2;
    for (const side of ['W', 'E']) {
      const A = wall(side, z + 1.6, -Infinity, 0.7);
      const B = wall(side, z - 1.6, -Infinity, 0.7);
      P.wallBracket(A.f, A.u, A.y, 0.7, 1);
      P.wallBracket(B.f, B.u, B.y, 0.7, 1);
      const sag = span(A.p, B.p, 0.3, 0.007, 3.4);
      hangAlong(A.p, B.p, sag, { scale: 0.85, minGap: 0.45, maxGap: 0.9 });
    }
  }
  // 5b. 立面上：竹竿伸出窗外晾衣 + 阳台间短晾衣绳
  for (const f of lots) {
    const fr = ctx.rng('laundry-' + f.id);
    const fh = f.floorH || 3;
    const nf = Math.max(1, Math.floor((f.top - f.podiumTop) / fh) - 1);
    for (let i = 0, n = fr.int(1, 3); i < n; i++) {
      const fl = fr.int(0, Math.min(nf - 1, 4));
      const y = f.podiumTop + fl * fh + fr.range(1.7, 2.2);
      if (y > f.top - 1.5) continue;
      const u = fr.range(0.8, f.length - 0.8);
      const len = fr.range(1.4, 2.4);
      const a = f.point(u, y, 0.05);
      const b = f.point(u + fr.range(-0.4, 0.4), y + len * fr.range(0.08, 0.22), len);
      P.rod(a, b, 0.022, P.M.bamboo);
      hangAlong(a, b, 0, { from: 0.3, to: 0.95, minGap: 0.3, maxGap: 0.5, kinds: [['shirt', 4], ['towel', 3], ['small', 3], ['pants', 2]] });
    }
    if (fr.chance(0.7)) {
      const fl = fr.int(0, Math.min(nf - 1, 3));
      const y = f.podiumTop + fl * fh + fr.range(2.0, 2.4);
      const u = fr.range(0.5, Math.max(0.6, f.length - 5));
      const a = f.point(u, y, fr.range(0.7, 1.0)), b = f.point(u + fr.range(2.5, 4.5), y, fr.range(0.7, 1.0));
      ctx.wires.add(a, b, { sag: 0.12, r: 0.006 });
      hangAlong(a, b, 0.12, { kinds: [['shirt', 3], ['pants', 2], ['sheet', 1], ['towel', 2]], minGap: 0.4, maxGap: 0.7 });
    }
  }

  // ---------------------------------------------------------------- 6. 暖色灯串（沿同侧街面）
  const halosLeft = { n: 40 };
  const BULB = [[NEON.amber, 5], [WINDOW.warm, 4], [NEON.orange, 2]];
  let flickerBulb = null;
  const festoon = (pts, { sag = 0.35, gap = 0.42, haloEvery = 4 } = {}) => {
    let count = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const s = span(a, b, sag, 0.007, 3.2);
      const len = a.distanceTo(b);
      const n = Math.max(2, Math.floor(len / gap));
      for (let j = 0; j < n; j++) {
        const k = (j + 0.5) / n;
        const p = a.clone().lerp(b, k);
        p.y -= s * 4 * k * (1 - k);
        P.add(P.G.socket, P.M.cable, p);
        const bp = p.clone().setY(p.y - 0.09);
        const col = rng.weighted(BULB);
        const dead = rng.chance(0.06);
        let m = dead ? P.M.porcelain : ctx.mat.neon(col, 4.5);
        if (!dead && !flickerBulb && i === 1 && j === 3) { m = ctx.mat.neon(col, 4.5, { uid: 'wires-flicker' }); flickerBulb = { m, col }; }
        P.add(P.G.bulb, m, bp);
        if (!dead && count++ % haloEvery === 0 && halosLeft.n > 0) {
          halosLeft.n--;
          const h = ctx.halos.add({ position: bp, color: col, size: 0.9, intensity: 0.28 });
          if (flickerBulb && flickerBulb.m === m) flickerBulb.halo = h;
        }
      }
    }
  };
  // 顶段两侧和宽平台各一串，随立面高差下降，留出中央远景。
  for (const side of ['W', 'E']) {
    const first = lots.find(f => f._side === side && f.id.endsWith('1'));
    if (!first) continue;
    const zs = [0.15, 0.35, 0.55, 0.75].map(k => first._zMax + (first._zMin - first._zMax) * k);
    festoon(zs.map(z => wall(side, z, -Infinity, 0.65).p), { sag: 0.35, haloEvery: 5 });
    for (const f of broad) {
      const z = (f.z0 + f.z1) / 2;
      festoon([wall(side, z + 2, -Infinity, 0.8).p, wall(side, z - 2, -Infinity, 0.8).p], { sag: 0.3, haloEvery: 5 });
    }
  }
  // 一颗接触不良的灯泡
  if (flickerBulb) {
    const base = flickerBulb.m.color.clone();
    ctx.onUpdate((dt, t) => {
      const s = Math.sin(t * 17.3) + Math.sin(t * 5.1 + 1.3) + Math.sin(t * 41.0 + 0.7);
      const k = s > 1.5 ? 0.05 : 1;
      flickerBulb.m.color.copy(base).multiplyScalar(k);
      if (flickerBulb.halo) flickerBulb.halo.intensity = 0.28 * k;
    });
  }
}
