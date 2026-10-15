// shops —— 底商店面：梯坎两侧 W1–W5 / E1–E5 + 上半城街南侧 S 街区的底层。
// 每个立面切成 2.5–4.5 m 开间：错层门前平台、门框、"假室内"（interior mapping）、卷帘门、雨棚、门口货物、店内灯光。
// 发布服务 'shopfronts'。招牌归 signs 模块，本模块只做 podiumTop-1.0 以下。
import * as THREE from 'three';
import { NEON, WINDOW, BASE } from '../core/palette.js';
import { createInteriors } from './shops/interior.js';
import { buildRoom } from './lib/rooms.js';
import { LOT_ROOM_DEPTH } from './lib/side.js';
import { fixtureBounds, overlapsFixtures } from './lib/shops-signs-fixtures.js';
import { region, paintBack, paintMid, shutterCanvas, fridgeCanvas, rentCanvas, boardCanvas, poleCanvas, stripeCanvas, tileCanvas, corrCanvas, crateCanvas } from './shops/paint.js';

// 店铺类型：room = 假室内参数；light = 门口光场颜色/强度；awn = 雨棚概率；glass = 玻璃门面概率
const KINDS = {
  hotpot:   { wt: 3.0, room: { wall: '#7a2a1e', floor: '#3a2622', ceil: '#4a2418', lamp: WINDOW.warm, intensity: 1.5 }, light: [NEON.orange, 2.2], awn: 0.85, glass: 0 },
  noodle:   { wt: 2.0, room: { wall: '#c8c4b4', floor: '#4a4644', ceil: '#d0d0c8', lamp: 0xfff0d0, intensity: 1.35, tubes: 1 }, light: [WINDOW.warm, 2.0], awn: 0.8, glass: 0 },
  store:    { wt: 2.0, room: { wall: '#b4c0c0', floor: '#6a6e70', ceil: '#c8d0d0', lamp: WINDOW.fluor, intensity: 1.35, tubes: 1, shelves: 1 }, light: [WINDOW.fluor, 2.0], awn: 0.6, glass: 0.2 },
  tea:      { wt: 1.5, room: { wall: '#8a6232', floor: '#3a2c22', ceil: '#5a4228', lamp: NEON.amber, intensity: 1.35 }, light: [NEON.amber, 1.8], awn: 0.6, glass: 0.4 },
  barber:   { wt: 1.0, room: { wall: '#9cc4d0', floor: '#80888c', ceil: '#b8dce8', lamp: 0xc0f0ff, intensity: 1.4, tubes: 1 }, light: [NEON.cyan, 1.6], awn: 0.35, glass: 1 },
  pharmacy: { wt: 1.0, room: { wall: '#b0ccc0', floor: '#7a8a80', ceil: '#c8e0d4', lamp: 0xd0ffe0, intensity: 1.4, tubes: 1, shelves: 1 }, light: [NEON.teal, 1.6], awn: 0.3, glass: 1 },
  hardware: { wt: 1.5, room: { wall: '#6a6250', floor: '#3a3632', ceil: '#5a5448', lamp: 0xfff0c0, intensity: 1.1, tubes: 1, shelves: 1 }, light: [WINDOW.warm, 1.6], awn: 0.8, glass: 0 },
  closed:   { wt: 3.0, awn: 0.5 },
  empty:    { wt: 1.5, room: { wall: '#3a3a3c', floor: '#2a2a2a', ceil: '#303030', lamp: WINDOW.warm, intensity: 0.35 }, awn: 0.3, glass: 1 },
};
const OPEN_KINDS = ['hotpot', 'noodle', 'store', 'tea', 'barber', 'pharmacy', 'hardware'];

export function build(ctx) {
  const { L, make, mat, tex } = ctx;
  const rng = ctx.rng('shops');
  const S = ctx.staticRoot;
  const facades = ctx.use('facades') || [];

  // ------------------------------------------------------------ 立面（以基座正面为准）
  const fronts = [];
  const mkFront = (id, ry, origin, len, podTop, opt = {}) => {
    const N = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const T = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const P = (u, y, out = 0) => origin.clone().addScaledVector(T, u).addScaledVector(N, out).setY(y);
    const H = u => { const p = P(u, 0, 0.1); return L.heightAt(p.x, p.z); };
    const fixtures = fixtureBounds(opt.facade, origin);
    fronts.push({ id, ry, N, T, origin, len, podTop, P, H, fixtures, ...opt });
  };
  for (const l of L.LOTS) {
    const ry = l.side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    const fac = facades.find(f => f.id === l.id);
    const podTop = fac?.podiumTop ?? Math.max(L.stairHeightAt(l.z0), L.stairHeightAt(l.z1)) + 4.2;
    mkFront(l.id, ry, new THREE.Vector3(l.front, 0, l.side === 'W' ? l.z0 : l.z1), Math.abs(l.z0 - l.z1), podTop, { maxOut: 1.25, facade: fac });
  }
  // 上半城街南侧：只做所有权区域内（|x| ≤ 20）的那段
  for (const b of L.BLOCKS.filter(b => b.faces === 'N')) {
    const x0 = Math.max(b.x0, -20), x1 = Math.min(b.x1, 20);
    if (x1 - x0 < 3) continue;
    const fac = facades.find(f => f.id.startsWith(b.id + '-'));
    const podTop = fac?.podiumTop ?? b.ground + 4.5;
    const origin = new THREE.Vector3(x1, 0, b.z0);
    const fixtures = facades.filter(f => f.id.startsWith(b.id + '-')).flatMap(f => fixtureBounds(f, origin));
    mkFront(b.id, Math.PI, origin, x1 - x0, podTop, { maxOut: 0.55, street: true, fixtures });
  }

  // 路灯位置（terrain 的逻辑复刻），门口货物避让
  const lamps = [];
  for (const f of L.FLIGHTS) {
    if (f.type !== 'landing' || f.z0 - f.z1 < 3) continue;
    for (const side of [-1, 1]) lamps.push({ x: side * 8.6, z: (f.z0 + f.z1) / 2 });
  }
  const nearLamp = p => lamps.some(l => Math.abs(l.x - p.x) < 0.7 && Math.abs(l.z - p.z) < 0.7);

  // ------------------------------------------------------------ 材质
  const canTex = (c, repeat) => {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const tileMat = k => mat.std({ map: canTex(tileCanvas(tex, k), true), color: 0xffffff, roughness: 0.4 });
  const crateTex = canTex(crateCanvas(tex));
  const tiles = { white: tileMat('white'), pink: tileMat('pink'), green: tileMat('green'), blue: tileMat('blue') };
  const M = {
    stone: mat.std({ map: tex.paving('step'), color: 0xd8d4d0, roughness: 0.7 }),
    curb: mat.surface('concrete', { roughness: 0.8 }),
    pil: [tiles.white, tiles.pink, mat.surface('concreteDk'), mat.surface('grime'), tiles.green],
    fascia: [[tiles.white, 2], [tiles.blue, 1.5], [tiles.pink, 1], [tiles.green, 1], [mat.surface('metalDk'), 2], [mat.surface('concreteDk'), 2], [mat.surface('grime'), 2],
      [mat.std({ color: 0x3a4550, roughness: 0.4, metalness: 0.5 }), 1.5], [mat.surface('rust'), 1]],
    metal: mat.surface('metal', { wet: 0.6 }),
    metalDk: mat.surface('metalDk', { wet: 0.7 }),
    alu: mat.std({ color: 0x8a9096, roughness: 0.35, metalness: 0.7, wet: 0.4 }),
    white: mat.std({ color: 0x7c8084, roughness: 0.5, wet: 0.5 }),
    wood: mat.surface('wood', { wet: 0.4 }),
    plasticR: mat.std({ color: 0x8a2020, roughness: 0.5, wet: 0.6 }),
    plasticB: mat.std({ color: 0x2a5a8a, roughness: 0.5, wet: 0.6 }),
    plasticG: mat.std({ color: 0x2a6a3a, roughness: 0.5, wet: 0.6 }),
    plasticY: mat.std({ color: 0x9a7a20, roughness: 0.5, wet: 0.6 }),
    crateR: mat.std({ map: crateTex, color: 0x8a2020, roughness: 0.5, wet: 0.6 }),
    crateB: mat.std({ map: crateTex, color: 0x2a5a8a, roughness: 0.5, wet: 0.6 }),
    crateG: mat.std({ map: crateTex, color: 0x2a6a3a, roughness: 0.5, wet: 0.6 }),
    crateY: mat.std({ map: crateTex, color: 0x9a7a20, roughness: 0.5, wet: 0.6 }),
    foam: mat.std({ color: 0xb0b0aa, roughness: 0.9, wet: 0.6 }),
    card: mat.std({ color: 0x6a5034, roughness: 0.95, wet: 0.5 }),
    strip: mat.glow(0x9ab8b8, 0.07),
    dark: mat.std({ color: 0x141418, roughness: 0.6, wet: 0.3 }),
    ac: mat.std({ color: 0x8a8d92, roughness: 0.6, wet: 0.6 }),
    grille: mat.std({ map: tex.grille({ bars: 8, rails: 3, thick: 4 }), color: 0x3a3d42, roughness: 0.5, metalness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide, wet: 0.5 }),
    bulb: mat.neon(WINDOW.warm, 5),
    lantern: mat.neon(NEON.hotpot, 1.25),
    leak: mat.neon(WINDOW.warm, 1.8),
    cross: mat.neon(NEON.green, 2.6),
    freezerTop: mat.neon(0xdfeeff, 1.4),
  };
  const shutterMat = mat.std({ map: canTex(shutterCanvas(tex), true), color: 0x9a9ea4, roughness: 0.45, metalness: 0.5, wet: 0.8 });
  const fridgeMat = mat.emissiveMap(canTex(fridgeCanvas(tex)), 1.5);
  const rentMat = mat.std({ map: canTex(rentCanvas(tex)), color: 0xa0a0a0, roughness: 0.9, wet: 0 });
  const boardMats = { hotpot: mat.emissiveMap(canTex(boardCanvas(tex, 'hotpot')), 0.9), noodle: mat.emissiveMap(canTex(boardCanvas(tex, 'noodle')), 0.9) };
  const poleTex = canTex(poleCanvas(tex), true);
  const poleMat = mat.emissiveMap(poleTex, 1.6);
  const corr = canTex(corrCanvas(tex), true);
  const awnMats = [
    [mat.std({ map: corr, color: BASE.plastic, roughness: 0.45, wet: 0.7 }), 3], [mat.std({ map: corr, color: BASE.tarpRed, roughness: 0.55, wet: 0.7 }), 3],
    [mat.std({ map: corr, color: BASE.rust, roughness: 0.75, metalness: 0.3, wet: 0.8 }), 2],
    [mat.std({ map: corr, color: 0x2f5a3a, roughness: 0.5, wet: 0.7 }), 1.5], [mat.std({ map: corr, color: 0x8a8e94, roughness: 0.4, metalness: 0.5, wet: 0.8 }), 1.2],
    [mat.std({ map: canTex(stripeCanvas(tex, '#8a2424', '#a8a49a'), true), roughness: 0.6, wet: 0.7 }), 1.5],
    [mat.std({ map: canTex(stripeCanvas(tex, '#2a4a7a', '#a8a49a'), true), roughness: 0.6, wet: 0.7 }), 1],
  ];

  // ------------------------------------------------------------ 假室内图集
  const I = createInteriors(ctx);
  const paintCell = (kind, w, h, seed) => {
    const a = I.alloc();
    if (a.fresh) {
      const r = ctx.rng('paint-' + seed);
      paintBack(region(I.g, a.x, a.y, 384, 192, w, h), kind, r);
      paintMid(region(I.g, a.x, a.y + 192, 384, 192, w, h), kind, r);
    }
    return a.cell;
  };
  // 阁楼窗共用 3 格
  const winCells = [0, 1, 2].map(i => {
    const c = paintCell('window', 1.3, 0.95, 'win' + i);
    I.setRoom(c, { w: 1.3, h: 0.95, depth: 2.4, intensity: 1.0, wall: i === 1 ? '#6a7a9a' : '#b08a60', floor: '#4a3a30', ceil: '#c0a080', lamp: i === 1 ? WINDOW.tv : WINDOW.warm, mid: 0.25, glass: 1 });
    return c;
  });
  const winDark = paintCell('empty', 1.3, 0.95, 'windark');
  I.setRoom(winDark, { w: 1.3, h: 0.95, depth: 2.4, intensity: 0.12, wall: '#303030', floor: '#202020', ceil: '#282828', lamp: WINDOW.warm, mid: 0, glass: 1 });

  // ------------------------------------------------------------ 小工具
  const blk = (F, w, h, d, m, u, y, out, ry = 0) => {
    const p = F.P(u, y, out);
    return make.block(w, h, d, m, { x: p.x, y: p.y, z: p.z, ry: F.ry + ry });
  };
  const cyl = (F, r, h, m, u, y, out, seg = 10, r2 = r) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m);
    mesh.position.copy(F.P(u, y + h / 2, out));
    S.add(mesh);
    return mesh;
  };
  const flick = [];      // { cell, light, base, seed, amt }
  const drips = [];      // 雨棚滴水线 { a: Vector3(顶), len, color }
  const shopfronts = [];
  let litCount = 0, haloCount = 0;

  // ------------------------------------------------------------ 逐立面切开间
  for (const F of fronts) {
    const fr = ctx.rng('front-' + F.id);
    const pilMat = fr.pick(M.pil);
    const n = Math.max(1, Math.round(F.len / fr.range(3.0, 3.6)));
    const ws = Array.from({ length: n }, () => fr.range(0.8, 1.2));
    const sum = ws.reduce((a, b) => a + b, 0);
    let cuts = [0];
    ws.forEach(w => cuts.push(cuts[cuts.length - 1] + w / sum * F.len));
    cuts[cuts.length - 1] = F.len;
    // 可进入店铺：开间边界对齐基座挖洞（side.js 的 LOT_ROOMS），洞两侧剩余过窄的开间并入邻间
    const rooms = (F.facade?.podiumHoles || []).map(h => {
      const us = [[h.x0, h.z0], [h.x1, h.z1], [h.x0, h.z1], [h.x1, h.z0]].map(([x, z]) => (x - F.origin.x) * F.T.x + (z - F.origin.z) * F.T.z);
      return { u0: Math.max(0, Math.min(...us)), u1: Math.min(F.len, Math.max(...us)), kind: h.kind };
    });
    for (const rm of rooms) {
      cuts = cuts.filter(c => c <= rm.u0 - 1.2 || c >= rm.u1 + 1.2 || c === 0 || c === F.len);
      cuts = cuts.filter(c => !(c > rm.u0 && c < rm.u1));
      if (rm.u0 > 0.05) cuts.push(rm.u0);
      if (rm.u1 < F.len - 0.05) cuts.push(rm.u1);
      cuts.sort((a, b) => a - b);
    }
    const n2 = cuts.length - 1;
    const topLimit = F.podTop - 1.12;

    // 开间之间的壁柱
    for (let i = 0; i <= n2; i++) {
      const u = i === 0 ? 0.15 : i === n2 ? F.len - 0.15 : cuts[i];
      const g0 = Math.min(F.H(u - 0.2), F.H(u + 0.2)) - 0.3;
      const pm = blk(F, 0.3, topLimit - g0, 0.3, pilMat, u, g0, 0.15);
      if (pilMat.map) uvMeters(pm, 0.3, topLimit - g0, 0.3, 1.0);
      if (fr() < 0.35 && !overlapsFixtures(F, u - 0.12, u + 0.12, g0, topLimit + 0.9, 0.3)) blk(F, 0.07, topLimit - g0 + 0.9, 0.07, M.metalDk, u + fr.range(-0.08, 0.08), g0, 0.34);   // 立管
      if (fr() < 0.25) blk(F, 0.28, 0.38, 0.14, M.white, u, F.H(u) + fr.range(1.4, 1.9), 0.37);                   // 电表箱
    }

    let prev = '';
    for (let i = 0; i < n2; i++) {
      let kind = rng.weighted(Object.entries(KINDS).map(([k, v]) => [k, v.wt]));
      if (kind === prev && kind !== 'hotpot') kind = rng.weighted(Object.entries(KINDS).filter(([k]) => k !== prev && k !== 'closed').map(([k, v]) => [k, v.wt]));
      const room = rooms.find(rm => Math.abs(rm.u0 - cuts[i]) < 0.01 && Math.abs(rm.u1 - cuts[i + 1]) < 0.01);
      if (room) kind = room.kind;
      else if (cuts[i + 1] - cuts[i] < 1.6) continue;      // 对齐房间后剩下的窄条：只留基座墙面
      prev = kind;
      buildBay(F, cuts[i], cuts[i + 1], kind, i === 0, i === n2 - 1, topLimit, pilMat, !!room);
    }
  }

  function buildBay(F, u0, u1, kind, firstBay, lastBay, topLimit, pilMat, enter = false) {
    const r = ctx.rng(`bay-${F.id}-${u0.toFixed(2)}`);
    if (!enter && kind !== 'closed' && I.full()) kind = 'closed';    // 图集格子用完：兜底成关门的店
    const K = KINDS[kind];
    const bw = u1 - u0, uc = (u0 + u1) / 2;
    let Hmax = -1e9, Hmin = 1e9;
    for (let u = u0 + 0.05; u <= u1 - 0.05; u += 0.15) { const h = F.H(u); Hmax = Math.max(Hmax, h); Hmin = Math.min(Hmin, h); }
    const slope = Hmax - Hmin > 0.2;
    const floorY = F.street ? Hmax + 0.12 : slope ? Hmax + 0.03 : Hmax + 0.16;
    const pd = F.street ? 0.3 : slope ? r.range(0.85, 1.2) : r.range(0.45, 0.7);
    const padL = firstBay ? 0.3 : 0.15, padR = lastBay ? 0.3 : 0.15;
    const ou0 = u0 + padL, ou1 = u1 - padR, ow = ou1 - ou0, ouc = (ou0 + ou1) / 2;
    const oh = Math.max(2.1, Math.min(r.range(2.45, 2.85), topLimit - 0.35 - floorY));
    const oy0 = floorY, oy1 = floorY + oh;
    const open = kind !== 'closed' && kind !== 'empty';
    const ground = (u, out) => (out < pd ? floorY : F.H(u));

    // -------- 门前平台 / 门槛（错层）
    const pBase = Hmin - 0.35;
    blk(F, bw, floorY - pBase, pd, M.stone, uc, pBase, pd / 2);
    blk(F, bw, 0.05, 0.08, M.curb, uc, floorY - 0.04, pd - 0.04);
    if (slope) {
      // 平台前沿栏杆：只在高出梯坎 0.45 m 以上的那段
      const posts = [];
      for (let u = u0 + 0.12; u <= u1 - 0.1; u += 0.85) if (floorY - F.H(u) > 0.45) posts.push(u);
      if (posts.length >= 2) {
        for (const u of posts) blk(F, 0.04, 0.95, 0.04, M.metalDk, u, floorY, pd - 0.06);
        const a = posts[0], b = posts[posts.length - 1];
        for (const hy of [0.5, 0.93]) blk(F, b - a + 0.04, 0.04, 0.04, M.metalDk, (a + b) / 2, floorY + hy, pd - 0.06);
      }
    }

    // -------- 门头（门洞上方的墙面）
    const facMat = r.weighted(M.fascia);
    const fm = blk(F, bw, topLimit - oy1, 0.22, facMat, uc, oy1, 0.11);
    if (facMat.map) uvMeters(fm, bw, topLimit - oy1, 0.22, 1.0);
    blk(F, bw, 0.06, 0.26, M.metalDk, uc, oy1 - 0.02, 0.13);
    const gap = topLimit - oy1;
    if (gap > 2.0) {           // 高处：阁楼窗（错层店面上面住人）
      const wy = oy1 + Math.min(gap / 2, 1.4) + 0.2;
      const wu = ouc + r.range(-0.4, 0.4) * Math.max(0, ow - 1.6);
      const cell = r() < 0.65 ? r.pick(winCells) : winDark;
      I.quad(cell, 1.3, 0.95, F.P(wu, wy, 0.225), F.ry);
      blk(F, 1.45, 0.07, 0.3, M.curb, wu, wy - 0.55, 0.3);
      const gq = make.quad(1.42, 1.05, M.grille, { ...xyz(F.P(wu, wy, 0.42)), ry: F.ry });
      gq.geometry.attributes.uv.array.forEach((v, k, a) => { a[k] = v * (k % 2 ? 1.2 : 1.6); });
      if (r() < 0.5) blk(F, 0.8, 0.55, 0.32, M.ac, wu + (r() < 0.5 ? -1.2 : 1.2), wy - 0.5, 0.38);
    } else if (r() < 0.3 && gap > 0.8) {
      blk(F, 0.8, 0.55, 0.32, M.ac, uc + r.range(-0.5, 0.5) * (bw - 1), oy1 + 0.15, 0.38);
    }

    // -------- 门洞
    const glass = !enter && r() < (K.glass ?? 0);
    let shutterDown = enter ? 0 : kind === 'closed' ? 1 : kind === 'empty' ? (r() < 0.5 ? r.range(0.4, 0.8) : 0) : (r() < 0.2 ? r.range(0.12, 0.3) : 0);
    let peek = false;          // 关门但卷帘没拉到底，底下漏出室内
    if (kind === 'closed' && r() < 0.45 && !I.full()) { shutterDown = r.range(0.72, 0.86); peek = true; }

    const roomKind = kind === 'closed' ? r.pick(['hotpot', 'store', 'hardware', 'tea']) : kind;
    const R = KINDS[roomKind].room;
    let cell = -1;
    if (enter) {
      // 可进入：真实房间（基座已在 side.js 挖空），门洞即开口
      buildRoom(ctx, F, { u0, u1, floorY, depth: LOT_ROOM_DEPTH, height: Math.min(3.1, topLimit - floorY - 0.1), topY: F.podTop,
        baseY: pBase, door: [ou0, ou1], doorH: oh, kind, seed: `${F.id}-${u0.toFixed(1)}` });
    } else if (kind !== 'closed' || peek) {
      cell = paintCell(roomKind, ow, oh, `${F.id}-${u0.toFixed(1)}`);
      const intensity = (kind === 'closed' ? 0.55 : R.intensity) * r.range(0.85, 1.15);
      I.setRoom(cell, { ...R, w: ow, h: oh, depth: r.range(2.4, 4.2), intensity, mid: r.range(0.35, 0.55), glass: glass || kind === 'empty' ? 1 : 0, shelves: R.shelves || 0, tubes: R.tubes || 0 });
      I.quad(cell, ow, oh, F.P(ouc, oy0 + oh / 2, 0.004), F.ry);
    }
    // 卷帘箱 + 导轨
    blk(F, ow + 0.06, 0.3, 0.24, M.metalDk, ouc, oy1 - 0.3, 0.12);
    for (const s of [-1, 1]) blk(F, 0.05, oh - 0.3, 0.07, M.metal, ouc + s * (ow / 2 - 0.025), oy0, 0.04);
    if (shutterDown > 0) {
      const sh = (oh - 0.3) * shutterDown;
      const q = make.quad(ow - 0.1, sh, shutterMat, { ...xyz(F.P(ouc, oy1 - 0.3 - sh / 2, 0.035)), ry: F.ry });
      q.geometry.attributes.uv.array.forEach((v, k, a) => { a[k] = v * (k % 2 ? sh / 2 : (ow - 0.1) / 2); });
      blk(F, ow - 0.1, 0.05, 0.05, M.metalDk, ouc, oy1 - 0.3 - sh - 0.02, 0.04);
      if (kind === 'closed' && !peek && r() < 0.6) {
        make.quad(ow - 0.16, 0.035, M.leak, { ...xyz(F.P(ouc, oy0 + 0.02, 0.04)), ry: F.ry });
        ctx.lights.add({ position: F.P(ouc, oy0 + 0.1, 0.5), color: WINDOW.warm, intensity: 0.35, radius: 3 });
      }
    }
    // 玻璃门面：竖梃、横档、门框、踢脚板
    if (glass || kind === 'empty') {
      const doorW = Math.min(1.0, ow * 0.4), doorLeft = r() < 0.5;
      const du = doorLeft ? ou0 + doorW : ou1 - doorW;
      blk(F, 0.06, oh - 0.3, 0.09, M.alu, du, oy0, 0.06);
      blk(F, ow, 0.06, 0.09, M.alu, ouc, oy0 + 2.05, 0.06);
      const wu0 = doorLeft ? du : ou0, wu1 = doorLeft ? ou1 : du;
      blk(F, wu1 - wu0, 0.4, 0.07, M.metalDk, (wu0 + wu1) / 2, oy0, 0.05);
      const nm = Math.floor((wu1 - wu0) / 1.1);
      for (let k = 1; k <= nm; k++) blk(F, 0.05, oh - 0.3, 0.08, M.alu, wu0 + k * (wu1 - wu0) / (nm + 1), oy0, 0.06);
      if (kind === 'empty') {
        make.quad(0.42, 0.52, rentMat, { ...xyz(F.P((wu0 + wu1) / 2 + r.range(-0.3, 0.3), oy0 + 1.35, 0.03)), ry: F.ry });
      }
    }

    // -------- 塑料门帘
    if (open && !glass && ['hotpot', 'noodle', 'tea'].includes(kind) && r() < 0.45) {
      const cw = Math.min(1.3, ow * 0.5), cu = r() < 0.5 ? ou0 + cw / 2 + 0.1 : ou1 - cw / 2 - 0.1;
      const sh = oh - 0.32;
      for (let x = -cw / 2; x < cw / 2; x += 0.11) {
        const hh = sh * r.range(0.9, 1);
        make.quad(0.1, hh, M.strip, { ...xyz(F.P(cu + x + 0.05, oy1 - 0.3 - hh / 2, 0.07 + r.range(0, 0.03))), ry: F.ry + r.range(-0.15, 0.15) });
      }
    }

    // -------- 雨棚
    const hasAwn = r() < K.awn && !overlapsFixtures(F, u0, u1, floorY + 2.0, topLimit + 0.05, 0.2);
    let awn = null;
    if (hasAwn) {
      const yh = Math.min(topLimit - 0.1, oy1 + r.range(0.05, 0.45));
      const len = Math.min(F.maxOut + 0.6, r.range(0.9, 1.6));
      const tilt = r.range(0.17, 0.38);
      const am = r.weighted(awnMats);
      const hinge = new THREE.Group();
      hinge.position.copy(F.P(uc, yh, 0.25));
      hinge.rotation.set(tilt, F.ry, 0, 'YXZ');
      S.add(hinge);
      const aw = bw - 0.04;
      const sheet = make.block(aw, 0.035, len, am, { x: 0, y: 0, z: len / 2, uv: 0, parent: hinge });
      if (am.map) uvMeters(sheet, aw, 0.035, len, 0.5);
      const val = make.block(aw, 0.22, 0.03, am, { x: 0, y: -0.2, z: len, parent: hinge });
      val.rotation.x = -tilt;
      if (am.map) uvMeters(val, aw, 0.22, 0.03, 0.5);
      for (const s of [-1, 1]) make.block(0.03, 0.03, len, M.metalDk, { x: s * (aw / 2 - 0.08), y: -0.03, z: len / 2, parent: hinge });
      awn = { yh, len, tilt };
      // 雨棚前沿滴水线
      const ex = 0.25 + len * Math.cos(tilt) + 0.01, ey = yh - len * Math.sin(tilt) - 0.4;
      const dc = open ? K.light[0] : WINDOW.warm;
      for (let k = 0, nd = Math.round(aw / 0.22); k < nd; k++) {
        if (r() < 0.7) continue;
        const du = uc - aw / 2 + (k + r.range(0.2, 0.8)) * aw / nd;
        const gy = ground(du, ex);
        if (ey - gy > 0.6) drips.push({ a: F.P(du, ey, ex), len: ey - gy, color: dc, T: F.T, N: F.N, k: open ? 1 : 0.4 });
      }
      // 红灯笼（火锅 / 茶馆）
      if (open && (kind === 'hotpot' || (kind === 'tea' && r() < 0.5)) && haloCount < 104) {
        for (const s of [-1, 1]) {
          const lu = uc + s * (aw / 2 - 0.3);
          const ly = ey - 0.05;
          blk(F, 0.012, 0.3, 0.012, M.dark, lu, ly - 0.05, ex - 0.12);
          const lb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), M.lantern);
          lb.scale.set(1, 0.82, 1); lb.position.copy(F.P(lu, ly - 0.2, ex - 0.12)); S.add(lb);
          cyl(F, 0.08, 0.05, M.plasticY, lu, ly - 0.08, ex - 0.12, 8);
          cyl(F, 0.08, 0.05, M.plasticY, lu, ly - 0.37, ex - 0.12, 8);
          blk(F, 0.04, 0.16, 0.04, M.lantern, lu, ly - 0.54, ex - 0.12);
          ctx.halos.add({ position: F.P(lu, ly - 0.22, ex - 0.12), color: NEON.hotpot, size: 1.1, intensity: 0.4 });
          haloCount++;
        }
      }
      // 小卖部：雨棚下挂零食条
      if (kind === 'store') {
        for (let k = 0; k < r.int(3, 6); k++) {
          const su = uc + r.range(-aw / 2 + 0.15, aw / 2 - 0.15);
          const so = 0.35 + r.range(0, len * 0.5);
          blk(F, 0.13, 0.7, 0.02, r.pick([M.plasticR, M.plasticY, M.plasticB, M.plasticG]), su, yh - 0.85 - so * Math.tan(tilt) * 0.3, so, r.range(-0.3, 0.3));
        }
      }
      // 雨棚下挂灯泡（大排档味）
      if (open && ['hotpot', 'noodle', 'hardware', 'store'].includes(kind) && r() < 0.6 && haloCount < 100) {
        const nb = Math.max(1, Math.round(bw / 1.6));
        for (let k = 0; k < nb; k++) {
          const bu = u0 + (k + 0.5) * bw / nb;
          const out = 0.25 + len * 0.55 * Math.cos(tilt);
          const by = yh - len * 0.55 * Math.sin(tilt) - 0.3;
          blk(F, 0.01, 0.25, 0.01, M.dark, bu, by + 0.05, out);
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M.bulb);
          b.position.copy(F.P(bu, by, out)); S.add(b);
          ctx.halos.add({ position: F.P(bu, by, out), color: WINDOW.warm, size: 0.9, intensity: 0.5 });
          const bp = F.P(bu, by - 0.04, out);
          make.lightCone({ pos: [bp.x, bp.y, bp.z], length: Math.max(0.8, by - ground(bu, out) - 0.1), radius: 0.75, color: WINDOW.warm, intensity: 0.07 });
          haloCount++;
        }
      }
    }

    // -------- 门口光场：街面主光源
    let light = null;
    if (open) {
      const [lc, li] = K.light;
      light = ctx.lights.add({ position: F.P(ouc, floorY + 1.9, 1.0), color: lc, intensity: li * r.range(0.85, 1.15), radius: r.range(5.5, 7.5) });
      litCount++;
      if (haloCount < 112) { ctx.halos.add({ position: F.P(ouc, floorY + 1.6, 0.45), color: lc, size: Math.min(3.2, ow * 0.9), intensity: 0.1 }); haloCount++; }
      if (cell >= 0 && r() < 0.12) flick.push({ cell, light, base: light.intensity, kbase: I.uniforms.uSize.value[cell].w, seed: r.range(0, 100) });
    } else if (peek) {
      ctx.lights.add({ position: F.P(ouc, floorY + 0.3, 0.5), color: WINDOW.warm, intensity: 0.5, radius: 3.5 });
    }

    // -------- 门口货物（可进入的店门口保持通畅）
    if (!enter) dressDoor(F, r, kind, { u0, u1, ou0, ou1, ouc, ow, floorY, oy1, pd, ground, open, awn });

    shopfronts.push({ facadeId: F.id, u0, u1, floorY, top: oy1, kind, open,
      a: F.P(u0, floorY, 0), b: F.P(u1, floorY, 0), depth: pd, normal: F.N.clone() });
  }

  function xyz(p) { return { x: p.x, y: p.y, z: p.z }; }
  // 盒子 UV 改成"每 s 米重复一次"（boxGeo 的面顺序：+x -x +y -y +z -z）
  function uvMeters(mesh, w, h, d, s) {
    const uv = mesh.geometry.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s); }
  }

  function dressDoor(F, r, kind, B) {
    const { ou0, ou1, ow, floorY, oy1, pd, ground, open } = B;
    const maxOut = Math.min(F.maxOut, Math.max(pd, 0.6));
    const ok = (u, out) => !nearLamp(F.P(u, 0, out)) && out <= F.maxOut + 0.1;
    const side = r() < 0.5 ? -1 : 1;
    const edgeU = side < 0 ? ou0 + 0.4 : ou1 - 0.4;
    switch (kind) {
      case 'store': {
        const fu = edgeU, fo = Math.min(0.45, maxOut - 0.3);
        if (ok(fu, fo)) {        // 饮料冰柜（发光门）
          const gy = ground(fu, fo);
          blk(F, 0.66, 1.3, 0.6, M.white, fu, gy, fo, 0);
          make.quad(0.6, 1.24, fridgeMat, { ...xyz(F.P(fu, gy + 0.66, fo + 0.305)), ry: F.ry });
          blk(F, 0.68, 0.1, 0.62, M.plasticR, fu, gy + 1.3, fo);
        }
        const iu = ouc(B) - side * 0.5;
        if (ok(iu, 0.45) && ow > 2.2) {     // 冰淇淋柜
          const gy = ground(iu, 0.45);
          blk(F, 0.9, 0.82, 0.55, M.white, iu, gy, 0.45);
          blk(F, 0.84, 0.03, 0.5, M.freezerTop, iu, gy + 0.82, 0.45);
        }
        rack(F, r, ouc(B) + side * 0.35, B);
        crates(F, r, edgeU - side * 0.9, 0.3, B, [M.crateB, M.crateR], 3);
        break;
      }
      case 'hotpot': {
        board(F, r, edgeU, B, boardMats.hotpot);
        crates(F, r, ouc(B) + side * 0.6, 0.3, B, [M.crateG, M.crateY], 4);
        const gu = edgeU - side * 0.45;
        if (ok(gu, 0.25)) cyl(F, 0.15, 0.6, M.plasticR, gu, ground(gu, 0.25), 0.25, 10);   // 液化气罐
        stockPot(F, r, ouc(B) - side * 0.6, B);
        break;
      }
      case 'noodle': {
        const cu = edgeU - side * 0.2;
        if (ok(cu, 0.45)) {      // 不锈钢煮面台
          const gy = ground(cu, 0.45);
          blk(F, 1.0, 0.85, 0.55, M.alu, cu, gy, 0.45);
          cyl(F, 0.24, 0.35, M.metal, cu - 0.2, gy + 0.85, 0.45, 12);
          cyl(F, 0.2, 0.3, M.metal, cu + 0.25, gy + 0.85, 0.45, 12);
          for (let k = 0; k < 4; k++) cyl(F, 0.08, 0.04, M.white, cu + 0.3 + (k % 2) * 0.05, gy + 0.85 + 0.3 + k * 0.045, 0.45, 8, 0.06);
          ctx.halos.add({ position: F.P(cu, gy + 1.4, 0.45), color: 0xffffff, size: 1.2, intensity: 0.12 });   // 热气
          haloCount++;
        }
        board(F, r, ouc(B) - side * 0.6, B, boardMats.noodle);
        crates(F, r, ouc(B) - side * 1.0, 0.3, B, [M.foam], 3);
        break;
      }
      case 'tea': {
        const bu = ouc(B) + side * 0.3;
        if (ok(bu, 0.35)) {      // 竹凳 + 暖水瓶
          const gy = ground(bu, 0.35);
          blk(F, 1.1, 0.42, 0.32, M.wood, bu, gy, 0.35);
          for (let k = 0; k < r.int(1, 3); k++) cyl(F, 0.06, 0.34, r.pick([M.plasticR, M.plasticG]), bu - 0.35 + k * 0.16, gy + 0.42, 0.35, 8);
        }
        break;
      }
      case 'barber': {
        const pu = side < 0 ? ou0 - 0.05 : ou1 + 0.05;
        const p = cyl(F, 0.09, 0.75, poleMat, pu, floorY + 1.45, 0.42, 14);
        void p;
        cyl(F, 0.11, 0.06, M.metal, pu, floorY + 1.39, 0.42, 14);
        cyl(F, 0.11, 0.06, M.metal, pu, floorY + 2.2, 0.42, 14);
        blk(F, 0.05, 0.05, 0.3, M.metal, pu, floorY + 1.8, 0.2);
        break;
      }
      case 'pharmacy': {
        const pu = side < 0 ? ou0 - 0.05 : ou1 + 0.05, y = Math.min(oy1 + 0.2, floorY + 2.6);
        blk(F, 0.05, 0.05, 0.3, M.metal, pu, y + 0.25, 0.18);
        blk(F, 0.5, 0.16, 0.08, M.cross, pu, y + 0.17, 0.4);
        blk(F, 0.16, 0.5, 0.08, M.cross, pu, y, 0.4);
        ctx.lights.add({ position: F.P(pu, y + 0.25, 0.9), color: NEON.green, intensity: 0.7, radius: 4 });
        ctx.halos.add({ position: F.P(pu, y + 0.25, 0.45), color: NEON.green, size: 1.4, intensity: 0.3 });
        haloCount++;
        break;
      }
      case 'hardware': {
        for (let k = 0; k < r.int(3, 6); k++) {     // 货物堆到门口
          const u = r.range(ou0 + 0.2, ou1 - 0.2), out = r.range(0.25, maxOut - 0.2);
          if (!ok(u, out)) continue;
          const gy = ground(u, out), t = r();
          if (t < 0.3) for (let j = 0; j < r.int(2, 5); j++) cyl(F, 0.16, 0.06, r.pick([M.plasticR, M.plasticB, M.plasticY]), u, gy + j * 0.05, out, 12, 0.2);   // 叠盆
          else if (t < 0.55) { cyl(F, 0.13, 0.3, r.pick([M.plasticB, M.plasticR, M.plasticG]), u, gy, out, 10, 0.15); }   // 桶
          else if (t < 0.8) { let y = gy; for (let j = 0; j < r.int(1, 3); j++) { const h = r.range(0.25, 0.4); blk(F, r.range(0.35, 0.55), h, r.range(0.3, 0.4), M.card, u, y, out, r.range(-0.2, 0.2)); y += h; } }
          else for (let j = 0; j < 3; j++) blk(F, 0.025, 1.2, 0.025, M.wood, u + j * 0.06, gy, out, 0);  // 扫把
        }
        const lu = r() < 0.5 ? ou0 + 0.3 : ou1 - 0.3;     // 靠墙的梯子
        if (ok(lu, 0.3)) {
          const g = new THREE.Group(); g.position.copy(F.P(lu, ground(lu, 0.3), 0.32)); g.rotation.set(-0.2, F.ry, 0, 'YXZ'); S.add(g);
          for (const s of [-0.2, 0.2]) make.block(0.04, 2.0, 0.04, M.metal, { x: s, parent: g });
          for (let y = 0.3; y < 2.0; y += 0.3) make.block(0.4, 0.03, 0.03, M.metal, { y, parent: g });
        }
        break;
      }
      case 'closed': {
        if (r() < 0.5) crates(F, r, ouc(B) + r.range(-0.8, 0.8), 0.3, B, [M.foam, M.card], 3);
        break;
      }
      case 'empty': {
        if (r() < 0.6) crates(F, r, ouc(B), 0.3, B, [M.card], 2);
        break;
      }
    }
    void oy1; void open;
  }
  function ouc(B) { return B.ouc; }

  // 价目牌（A 字架）
  function board(F, r, u, B, m) {
    const out = Math.min(F.maxOut - 0.05, Math.max(0.55, B.pd - 0.25));
    if (nearLamp(F.P(u, 0, out))) return;
    const gy = B.ground(u, out);
    const g = new THREE.Group(); g.position.copy(F.P(u, gy, out)); g.rotation.y = F.ry + r.range(-0.4, 0.4); S.add(g);
    for (const s of [1, -1]) {
      const leaf = new THREE.Group(); leaf.position.z = 0.14 * s; leaf.rotation.x = -0.17 * s; g.add(leaf);
      make.block(0.5, 0.92, 0.03, M.wood, { parent: leaf });
      if (s > 0) make.quad(0.42, 0.66, m, { y: 0.5, z: 0.017, parent: leaf });
    }
  }
  // 塑料筐 / 泡沫箱 / 纸箱堆
  function crates(F, r, u, out, B, mats, maxN) {
    if (u < B.ou0 + 0.2 || u > B.ou1 - 0.2 || nearLamp(F.P(u, 0, out))) return;
    let y = B.ground(u, out);
    const m = r.pick(mats);
    for (let k = 0; k < r.int(1, maxN); k++) {
      const h = m === M.foam ? 0.3 : m === M.card ? 0.35 : 0.28;
      if (m.map) {   // 周转筐：上沿露出一排瓶盖
        blk(F, 0.44, 0.03, 0.32, M.dark, u, y + h, out + 0.1);
      }
      blk(F, 0.5, h, 0.38, m, u + r.range(-0.03, 0.03), y, out + 0.1, r.range(-0.08, 0.08));
      y += h;
    }
  }
  // 货架（门口外摆）
  function rack(F, r, u, B) {
    const out = 0.3;
    if (u < B.ou0 + 0.4 || u > B.ou1 - 0.4 || nearLamp(F.P(u, 0, out))) return;
    const gy = B.ground(u, out);
    for (const s of [-0.4, 0.4]) blk(F, 0.03, 1.4, 0.35, M.metalDk, u + s, gy, out);
    const goods = [M.plasticR, M.plasticB, M.plasticY, M.plasticG, M.white, M.card];
    for (let y = 0.15; y < 1.4; y += 0.4) {
      blk(F, 0.83, 0.025, 0.36, M.metal, u, gy + y, out);
      for (let x = -0.36; x < 0.34; x += r.range(0.1, 0.18)) blk(F, r.range(0.07, 0.14), r.range(0.1, 0.28), 0.22, r.pick(goods), u + x + 0.05, gy + y + 0.025, out);
    }
  }
  // 门口熬汤大锅（火锅店）
  function stockPot(F, r, u, B) {
    const out = 0.35;
    if (u < B.ou0 + 0.3 || u > B.ou1 - 0.3 || nearLamp(F.P(u, 0, out))) return;
    const gy = B.ground(u, out);
    blk(F, 0.42, 0.55, 0.42, M.metalDk, u, gy, out);
    cyl(F, 0.19, 0.28, M.metal, u, gy + 0.55, out, 14);
    ctx.halos.add({ position: F.P(u, gy + 1.15, out), color: 0xffd0b0, size: 1.2, intensity: 0.12 });
    haloCount++;
  }

  I.flush();
  buildDrips();

  // 滴水线：一个加法混合 shader，按时间往下流的虚线（全部合成一个几何体）
  function buildDrips() {
    if (!drips.length) return;
    const pos = [], uv = [], col = [], idx = [];
    const W = 0.012;
    const c = new THREE.Color();
    for (const d of drips) {
      c.set(d.color).multiplyScalar(0.16 * d.k);
      const phase = (d.a.x * 3.1 + d.a.z * 7.7) % 5;
      for (const ax of [d.T, d.N]) {
        const b = pos.length / 3;
        for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
          pos.push(d.a.x + ax.x * W * sx, d.a.y - d.len * sy, d.a.z + ax.z * W * sx);
          uv.push(sy, d.len * sy + phase);
          col.push(c.r, c.g, c.b);
        }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    const m = mat.custom(new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.shared.uTime, uRain: ctx.shared.uRain },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vCol; varying float vD;
        void main(){
          vUv = uv; vCol = color;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vD = length(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uRain;
        varying vec2 vUv; varying vec3 vCol; varying float vD;
        void main(){
          float s = fract(vUv.y * 1.3 - uTime * 3.1);
          float dash = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.12, 0.45, s));
          float t = clamp(vUv.x, 0.0, 1.0);
          float fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.75, 1.0, t));
          float far = (1.0 - smoothstep(12.0, 40.0, vD)) * smoothstep(1.0, 4.0, vD);
          gl_FragColor = vec4(vCol * (0.06 + dash) * fade * far * uRain, 1.0);
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'shop-drips';
    S.add(mesh);
  }

  // ------------------------------------------------------------ 动画：日光灯接触不良 + 理发店灯柱 + 雾参数同步
  ctx.onUpdate((dt, t) => {
    if (ctx.scene.fog) I.uniforms.uFogDensity.value = ctx.scene.fog.density;
    poleTex.offset.y = -(t * 0.6) % 1;
    for (const f of flick) {
      const s = Math.sin(t * 17.3 + f.seed) + Math.sin(t * 41.1 + f.seed * 1.7) + Math.sin(t * 3.1 + f.seed * 0.3);
      const k = s > 2.2 ? 0.25 : 1;
      if (f.light) f.light.intensity = f.base * k;
      if (f.cell >= 0) I.uniforms.uSize.value[f.cell].w = f.kbase * (0.4 + 0.6 * k);
    }
  });

  ctx.provide('shopfronts', shopfronts);
  void litCount; void BASE;
}
