// rooms —— 可进入的店铺房间（shops / districts 共用）。
// 立面坐标系 F：P(u, y, out) → 世界点；out > 0 在立面外，房间朝 out < 0 方向延伸 depth 米；ry = 立面朝向。
// 房间 = 地面（实心，顶面 floorY）+ 两侧墙 + 后墙 + 门洞两侧/上方的前墙 + 天花（填到 topY）+ 按店种摆的家具（带碰撞）。
// 宿主负责在建筑基座上挖洞（tower.js 的 podiumHoles），门楣招牌、门口光照由宿主照旧处理。
import * as THREE from 'three';
import { BASE, NEON, WINDOW } from '../../core/palette.js';
import { fridgeCanvas, boardCanvas } from '../shops/paint.js';

export const ROOM_KINDS = ['hotpot', 'noodle', 'store', 'tea', 'barber', 'pharmacy', 'hardware'];

const cache = new WeakMap();
function materials(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);
  const { mat, tex } = ctx;
  const can = (c, rep) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  // 室内瓷砖：干净的砖缝 + 轻微色差（室外 tileCanvas 带雨水流痕，不适合室内）
  const tileCan = (base, step, seed) => {
    const c = tex.canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    let q = seed;
    const rnd = () => (q = (q * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < 128; y += step) for (let x = 0; x < 128; x += step) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.05})`; g.fillRect(x + 1, y + 1, step - 2, step - 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i <= 128; i += step) { g.fillRect(0, i, 128, 1.2); g.fillRect(i, 0, 1.2, 128); }
    return c;
  };
  const TILE = { white: ['#b4b8ba', 16], green: ['#7e968c', 16], blue: ['#7c90a6', 8], pink: ['#a88a86', 16] };
  const tile = k => mat.std({ map: can(tileCan(TILE[k][0], TILE[k][1], k.length * 977 + 7), true), color: 0xffffff, roughness: 0.3, wet: 0 });
  const M = {
    tileW: tile('white'), tileG: tile('green'), tileB: tile('blue'), tileP: tile('pink'),
    floorStone: mat.std({ map: tex.paving('step'), color: 0xc8c4c0, roughness: 0.55, wet: 0 }),
    plaster: mat.surface('plaster', { wet: 0 }),
    ceil: mat.std({ color: 0x9a9890, roughness: 0.95, wet: 0 }),
    wood: mat.surface('wood', { wet: 0 }),
    woodLt: mat.std({ color: 0x7a5a3a, roughness: 0.7, wet: 0 }),
    metal: mat.surface('metal', { wet: 0 }),
    metalDk: mat.surface('metalDk', { wet: 0 }),
    white: mat.std({ color: 0xa4a8ac, roughness: 0.45, wet: 0 }),
    red: mat.std({ color: 0x8a1a1e, roughness: 0.45, wet: 0 }),
    blue: mat.std({ color: 0x1e3a7a, roughness: 0.45, wet: 0 }),
    green: mat.std({ color: 0x1f5a3a, roughness: 0.8, wet: 0 }),
    yellow: mat.std({ color: 0x9a7a20, roughness: 0.5, wet: 0 }),
    leather: mat.std({ color: 0x2a1c1a, roughness: 0.5, wet: 0 }),
    glass: mat.std({ color: 0x8aa4b0, roughness: 0.05, metalness: 0.1, opacity: 0.25, wet: 0 }),
    tube: mat.neon(0xf0fff4, 3.2),
    tubeWarm: mat.neon(WINDOW.warm, 3.0),
    mirror: mat.neon(0x7a90a8, 0.75),
    pot: mat.neon(0xb8401a, 0.9),
    kitchen: mat.neon(0xffd8a0, 1.4),
    cross: mat.neon(NEON.green, 2.6),
    scroll: mat.std({ color: 0xb8ac90, roughness: 0.9, wet: 0 }),
    fridge: mat.emissiveMap(can(fridgeCanvas(tex)), 1.4),
    board: { hotpot: mat.emissiveMap(can(boardCanvas(tex, 'hotpot')), 1.0), noodle: mat.emissiveMap(can(boardCanvas(tex, 'noodle')), 1.0) },
    goods: [0x7a3030, 0x34507a, 0x8a7a3a, 0x3a6040, 0xa4a8ac, 0x6a4a6a, 0x9a6a3a, 0xb0aca0].map(c => mat.std({ color: c, roughness: 0.55, wet: 0 })),
  };
  cache.set(ctx, M);
  return M;
}

// 店种 → 墙/地/灯色
const STYLE = {
  hotpot:   { wall: 'tileP', floor: 'floorStone', lamp: WINDOW.warm, tube: 'tubeWarm' },
  noodle:   { wall: 'tileW', floor: 'floorStone', lamp: 0xfff0d0, tube: 'tube' },
  store:    { wall: 'tileW', floor: 'tileW', lamp: WINDOW.fluor, tube: 'tube' },
  tea:      { wall: 'plaster', floor: 'wood', lamp: NEON.amber, tube: 'tubeWarm' },
  barber:   { wall: 'tileB', floor: 'tileW', lamp: 0xc0f0ff, tube: 'tube' },
  pharmacy: { wall: 'tileG', floor: 'tileW', lamp: 0xd0ffe0, tube: 'tube' },
  hardware: { wall: 'plaster', floor: 'floorStone', lamp: 0xfff0c0, tube: 'tube' },
};

/**
 * @param F   { P(u,y,out), ry }
 * @param o   { u0, u1, floorY, depth, height, topY, baseY, door:[du0,du1], doorH, kind, seed, light }
 * @returns { light } 登记的光场句柄（可能为 null）
 */
export function buildRoom(ctx, F, o) {
  const { make } = ctx;
  const M = materials(ctx);
  const r = ctx.rng('room-' + o.seed);
  const kind = ROOM_KINDS.includes(o.kind) ? o.kind : 'store';
  const st = STYLE[kind];
  const { u0, u1, floorY: fy } = o;
  const D = o.depth ?? 5, H = o.height ?? 3.0, T = 0.16;
  const bw = u1 - u0, uc = (u0 + u1) / 2;
  const [du0, du1] = o.door ?? [u0 + 0.2, u1 - 0.2];
  const doorH = Math.min(o.doorH ?? 2.5, H - 0.1);
  const blk = (w, h, d, m, u, y, inward, { solid = false, ry = 0, uv = 0 } = {}) => {
    const p = F.P(u, y, -inward);
    return make.block(w, h, d, m, { x: p.x, y: p.y, z: p.z, ry: F.ry + ry, solid, uv });
  };
  const quad = (w, h, m, u, y, inward, ry = 0) => {
    const p = F.P(u, y, -inward);
    return make.quad(w, h, m, { x: p.x, y: p.y, z: p.z, ry: F.ry + ry });
  };
  const cyl = (rad, h, m, u, y, inward, seg = 10, rTop = rad) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rad, h, seg), m);
    mesh.position.copy(F.P(u, y + h / 2, -inward));
    ctx.staticRoot.add(mesh);
    return mesh;
  };
  const solidCyl = (rad, h, m, u, y, inward, seg) => {
    cyl(rad, h, m, u, y, inward, seg);
    const p = F.P(u, 0, -inward);
    ctx.physics.addBox(p.x - rad, p.z - rad, p.x + rad, p.z + rad, y + h, y);
  };

  // ---------------- 壳体
  const wallM = M[st.wall], floorM = M[st.floor];
  blk(bw, fy - (o.baseY ?? fy - 1.2), D, floorM, uc, o.baseY ?? fy - 1.2, D / 2, { solid: true, uv: 1 }).userData.walkable = true;
  const top = Math.max(fy + H + 0.1, o.topY ?? fy + H + 0.3);
  blk(bw, top - (fy + H), D, M.ceil, uc, fy + H, D / 2, { solid: true });
  blk(bw, H, T, wallM, uc, fy, D - T / 2, { solid: true, uv: 1 });                        // 后墙
  for (const [u, s] of [[u0 + T / 2, 1], [u1 - T / 2, -1]]) { void s; blk(T, H, D, wallM, u, fy, D / 2, { solid: true, uv: 1 }); }
  if (du0 - u0 > 0.05) blk(du0 - u0, H, T, wallM, (u0 + du0) / 2, fy, T / 2, { solid: true, uv: 1 });   // 门洞两侧前墙
  if (u1 - du1 > 0.05) blk(u1 - du1, H, T, wallM, (du1 + u1) / 2, fy, T / 2, { solid: true, uv: 1 });
  blk(du1 - du0, H - doorH, T, wallM, (du0 + du1) / 2, fy + doorH, T / 2, { uv: 1 });               // 门楣
  // 踢脚线（沿两侧墙与后墙）
  for (const u of [u0 + T + 0.01, u1 - T - 0.01]) blk(0.02, 0.12, D - T, M.wood, u, fy, D / 2);
  blk(bw - 2 * T, 0.12, 0.02, M.wood, uc, fy, D - T - 0.01);
  // 天花灯管
  const nT = Math.max(1, Math.round(D / 2.2));
  for (let k = 0; k < nT; k++) blk(Math.min(1.2, bw - 0.8), 0.05, 0.1, M[st.tube], uc, fy + H - 0.06, (k + 0.5) * D / nT);
  let light = null;
  if (o.light !== false) light = ctx.lights.add({ position: F.P(uc, fy + H - 0.5, -D * 0.5), color: st.lamp, intensity: 1.7, radius: Math.max(5, D + 1.5) });

  // ---------------- 家具（door 区域内侧 1.2 m 留空，便于进出）
  const inU0 = u0 + T + 0.05, inU1 = u1 - T - 0.05, iw = inU1 - inU0;
  const back = D - T - 0.05;
  const wide = iw > 3.0;
  const shelfRow = (u, inward, len, along, levels = 4, depthS = 0.38, m = M.wood, goods = true) => {
    // along = 'u'（沿立面）或 'd'（沿进深）
    const w = along === 'u' ? len : depthS, d = along === 'u' ? depthS : len;
    // 货架 = 两端立板 + 背板（靠墙一侧）+ 层板；碰撞单独登记
    for (const e of [-1, 1]) {
      if (along === 'u') blk(0.04, 1.85, d, M.metalDk, u + e * (len / 2 - 0.02), fy, inward);
      else blk(w, 1.85, 0.04, M.metalDk, u, fy, inward + e * (len / 2 - 0.02));
    }
    if (along === 'u') blk(len, 1.85, 0.03, M.metalDk, u, fy, inward + depthS / 2 - 0.015);
    else if (Math.abs(u - uc) > 0.3) blk(0.03, 1.85, len, M.metalDk, u + Math.sign(u - uc) * (depthS / 2 - 0.015), fy, inward);
    else blk(0.03, 1.85, len, M.metalDk, u, fy, inward);
    {
      const p = F.P(u, 0, -inward), sw = Math.abs(Math.sin(F.ry)) > 0.7;
      const hx = (sw ? d : w) / 2, hz = (sw ? w : d) / 2;
      ctx.physics.addBox(p.x - hx, p.z - hz, p.x + hx, p.z + hz, fy + 1.85, fy);
    }
    for (let l = 0; l < levels; l++) {
      const y = fy + 0.15 + l * 0.42;
      blk(w + 0.02, 0.03, d + 0.02, m, u, y, inward);
      if (!goods) continue;
      const n = Math.max(2, Math.floor(len / 0.22));
      for (let k = 0; k < n; k++) {
        if (r() < 0.18) continue;
        const t = (k + 0.5) / n - 0.5;
        const gw = r.range(0.12, 0.2), gh = r.range(0.14, 0.32);
        if (along === 'u') blk(gw, gh, depthS * 0.8, r.pick(M.goods), u + t * len, y + 0.03, inward);
        else blk(depthS * 0.8, gh, gw, r.pick(M.goods), u, y + 0.03, inward + t * len);
      }
    }
  };
  const table = (u, inward, w, d, m = M.wood, h = 0.74) => {
    blk(w, 0.05, d, m, u, fy + h - 0.05, inward);
    blk(0.08, h - 0.05, 0.08, M.metalDk, u, fy, inward);
    blk(w * 0.6, 0.04, d * 0.6, M.metalDk, u, fy + 0.02, inward);
    const p = F.P(u, 0, -inward);
    const hw = (Math.abs(Math.sin(F.ry)) > 0.7 ? d : w) / 2, hd = (Math.abs(Math.sin(F.ry)) > 0.7 ? w : d) / 2;
    ctx.physics.addBox(p.x - hw, p.z - hd, p.x + hw, p.z + hd, fy + h, fy);
  };
  const stool = (u, inward, m) => cyl(0.16, 0.45, m, u, fy, inward, 8, 0.14);
  const chair = (u, inward, face) => {     // face: 0 朝门，π 朝里
    blk(0.42, 0.06, 0.42, M.woodLt, u, fy + 0.44, inward);
    for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) blk(0.04, 0.44, 0.04, M.woodLt, u + a, fy, inward + b);
    blk(0.42, 0.5, 0.04, M.woodLt, u, fy + 0.5, inward + (face ? -0.19 : 0.19));
  };

  switch (kind) {
    case 'hotpot': {
      const tables = wide ? [[inU0 + iw * 0.27, 2.0], [inU0 + iw * 0.73, 3.3]] : [[uc, 2.6]];
      for (const [u, d] of tables) {
        if (d > back - 0.8) continue;
        table(u, d, 0.95, 0.95, M.metalDk);
        cyl(0.22, 0.14, M.pot, u, fy + 0.74, d, 14);
        cyl(0.24, 0.02, M.metal, u, fy + 0.74, d, 14);
        for (const [a, b] of [[-0.75, 0], [0.75, 0], [0, -0.7], [0, 0.7]]) stool(u + a, d + b, r() < 0.7 ? M.red : M.blue);
      }
      quad(Math.min(1.6, iw - 0.6), 0.9, M.kitchen, uc, fy + 1.55, back - 0.01);                 // 后厨传菜口
      blk(Math.min(2.0, iw - 0.4), 0.95, 0.5, M.metal, uc, fy, back - 0.3, { solid: true });
      quad(0.9, 0.5, M.board.hotpot, inU0 + 0.02, fy + 1.9, D * 0.45, Math.PI / 2);                       // 侧墙菜单灯箱
      break;
    }
    case 'noodle': {
      blk(iw - 0.2, 0.95, 0.55, M.white, uc, fy, back - 0.3, { solid: true });                            // 灶台
      for (let k = 0; k < Math.floor((iw - 0.4) / 0.6); k++) cyl(0.17, 0.3, M.metal, inU0 + 0.4 + k * 0.6, fy + 0.95, back - 0.3, 12);
      blk(iw - 0.4, 0.04, 0.4, M.wood, uc, fy + 1.05, back - 1.0);                                       // 吧台
      blk(iw - 0.4, 1.05, 0.12, M.white, uc, fy, back - 0.86, { solid: true });
      for (let k = 0; k < Math.floor((iw - 0.4) / 0.65); k++) stool(inU0 + 0.5 + k * 0.65, back - 1.5, M.red);
      quad(Math.min(1.8, iw - 0.6), 0.7, M.board.noodle, uc, fy + 2.15, back - 0.01);
      if (back > 3.4) { table(inU0 + 0.55, 1.8, 0.7, 0.7); stool(inU0 + 0.55, 1.15, M.blue); }
      break;
    }
    case 'store': {
      shelfRow(inU0 + 0.2, back / 2 + 0.6, back - 1.4, 'd');
      shelfRow(inU1 - 0.2, back / 2 + 0.6, back - 1.4, 'd');
      if (wide) shelfRow(uc, back / 2 + 0.8, back - 2.2, 'd', 4, 0.5);
      blk(0.7, 1.9, 0.6, M.white, inU0 + 0.9, fy, back - 0.3, { solid: true });                            // 冰柜
      quad(0.62, 1.7, M.fridge, inU0 + 0.9, fy + 0.95, back - 0.61);
      blk(1.0, 0.95, 0.55, M.wood, inU1 - 0.95, fy, 1.0, { solid: true });                                // 收银台
      blk(0.32, 0.2, 0.28, M.metalDk, inU1 - 0.95, fy + 0.95, 1.0);
      break;
    }
    case 'tea': {
      const spots = wide ? [[inU0 + iw * 0.28, 2.0], [inU0 + iw * 0.72, 2.0], [inU0 + iw * 0.5, 3.6]] : [[uc, 2.2], [uc, 3.8]];
      spots.forEach(([u, d], k) => {
        if (d > back - 0.7) return;
        const mahjong = k === spots.length - 1 && r() < 0.6;
        table(u, d, 0.85, 0.85, mahjong ? M.green : M.wood);
        for (const [a, b, f] of [[-0.62, 0, 0], [0.62, 0, 0], [0, -0.6, 0], [0, 0.6, 1]]) chair(u + a, d + b, f);
        if (!mahjong) for (const a of [-0.2, 0.2]) cyl(0.04, 0.09, M.white, u + a, fy + 0.74, d, 8);
      });
      for (const [a, m] of [[0.25, M.red], [0.5, M.green]]) cyl(0.07, 0.38, m, inU1 - a, fy, back - 0.3, 10);   // 暖水瓶
      quad(0.6, 1.3, M.scroll, uc, fy + 1.7, back - 0.01);                                       // 字画
      break;
    }
    case 'barber': {
      for (let k = 0; k < (wide ? 2 : 1); k++) {
        const d = 1.6 + k * 1.6;
        if (d > back - 0.6) break;
        quad(0.9, 1.0, M.mirror, inU0 + 0.02, fy + 1.45, d, Math.PI / 2);                                  // 镜子
        blk(0.35, 0.05, 1.0, M.white, inU0 + 0.2, fy + 0.9, d);
        solidCyl(0.22, 0.42, M.metal, inU0 + 0.95, fy, d, 10);                                             // 理发椅
        blk(0.52, 0.12, 0.52, M.leather, inU0 + 0.95, fy + 0.45, d);
        blk(0.1, 0.62, 0.5, M.leather, inU0 + 1.2, fy + 0.57, d, {});
      }
      blk(0.45, 0.45, Math.min(2.0, back - 1.2), M.leather, inU1 - 0.3, fy, back / 2 + 0.4, { solid: true });  // 等候长凳
      blk(0.8, 0.9, 0.45, M.white, uc, fy, back - 0.3, { solid: true });                                  // 洗头池
      break;
    }
    case 'pharmacy': {
      shelfRow(uc, back - 0.25, iw - 0.4, 'u', 5, 0.35, M.white);
      shelfRow(inU0 + 0.2, back / 2, back - 2.0, 'd', 4, 0.35, M.white);
      blk(Math.min(2.2, iw - 1.4), 0.95, 0.5, M.white, uc - 0.3, fy, back - 1.5, { solid: true });          // 玻璃柜台
      blk(Math.min(2.2, iw - 1.4), 0.03, 0.52, M.glass, uc - 0.3, fy + 0.95, back - 1.5);
      blk(0.5, 0.12, 0.06, M.cross, uc, fy + 2.35, back - 0.42); blk(0.12, 0.5, 0.06, M.cross, uc, fy + 2.16, back - 0.42);
      break;
    }
    default: {   // hardware
      shelfRow(inU0 + 0.25, back / 2 + 0.3, back - 0.8, 'd', 4, 0.45, M.metal);
      shelfRow(uc, back - 0.3, iw - 1.2, 'u', 4, 0.45, M.metal);
      for (let k = 0; k < 5; k++) blk(0.04, r.range(0.3, 0.6), 0.25, M.metalDk, inU1 - 0.05, fy + 1.4, 1.2 + k * 0.45);   // 墙上挂工具
      for (let k = 0; k < 3; k++) solidCyl(0.18, 0.32 * (k + 1) * 0.5 + 0.2, k % 2 ? M.red : M.blue, inU1 - 0.45, fy, back - 0.5 - k * 0.45, 10);
      blk(1.0, 0.95, 0.5, M.wood, inU1 - 0.8, fy, 1.4, { solid: true });
    }
  }
  return { light };
}
