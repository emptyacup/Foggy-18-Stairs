// traffic-cars —— 低多边形车型。每种车型 = 若干"部件"，每个部件一种材质、一块合并几何体，
// 供 traffic.js 做成 InstancedMesh（车身颜色、车灯亮度走 instanceColor）。
// 车辆局部坐标：+X 车头方向，+Y 上，Z = 车宽方向，原点在车底中心（地面）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo } from '../../core/make.js';
import { NEON } from '../../core/palette.js';

// ------------------------------------------------------------ 几何工具
function clean(g) {
  let n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.clearGroups();
  return n;
}
// 侧视轮廓挤出（沿 Z），bevel 让棱角圆一点
function profile(pts, width, bevel = 0.035) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
// 中心定位的盒子：(x, y0 底, z)
function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = boxGeo(w, h, d);
  g.translate(x, y, z);
  return g;
}
function wheel(r, w, x, z, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, w, seg, 1);
  g.rotateX(Math.PI / 2);
  g.translate(x, r, z);
  return g;
}
function wheels(r, w, xs, W) {
  const out = [];
  for (const x of xs) for (const s of [-1, 1]) out.push(wheel(r, w, x, s * (W / 2 - w / 2 + 0.02)));
  return out;
}
const merge = (list) => mergeGeometries(list.map(clean), false);

// 公交车厢内：日光灯带、扶手竖杆、座椅靠背和乘客剪影（假室内，贴在车窗带上）
function busInterior(ctx) {
  const W = 512, H = 64;
  const c = ctx.tex.canvas(W, H);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#e8fff0'); grd.addColorStop(0.18, '#9fc8b4'); grd.addColorStop(0.7, '#5a7a6e'); grd.addColorStop(1, '#2a3a36');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; g.fillRect(0, 2, W, 4);                       // 顶灯
  const r = ctx.rng('bus-interior');
  g.fillStyle = 'rgba(20,28,30,0.85)';
  for (let x = 6; x < W; x += 22) g.fillRect(x, 40, 14, 24);              // 座椅靠背
  g.fillStyle = 'rgba(200,210,200,0.7)';
  for (let x = 30; x < W; x += 64) g.fillRect(x, 6, 2, H);               // 扶手杆
  for (let i = 0; i < 9; i++) {                                           // 乘客剪影
    const x = r.range(10, W - 10), stand = r.chance(0.35);
    const y = stand ? 18 : 30;
    g.fillStyle = `rgba(${r.int(8, 30)},${r.int(10, 26)},${r.int(12, 24)},0.92)`;
    g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 9, y + 5, 18, H - y);
  }
  // 窗格分隔
  g.fillStyle = '#0a0c0e';
  for (let x = 0; x < W; x += W / 7.3) g.fillRect(x, 0, 6, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------ 共享材质
function materials(ctx) {
  const { mat, tex } = ctx;
  const taxiSign = tex.neonText('空车', { style: 'led', color: NEON.hotpot });
  const busSign = tex.neonText('381 朝天门', { style: 'led', color: NEON.amber });
  const M = {
    body: mat.std({ color: 0xffffff, roughness: 0.28, metalness: 0.35, wet: 0.5 }),      // 颜色走 instanceColor
    glass: mat.std({ color: 0x0a0d14, roughness: 0.05, metalness: 0.55, wet: 0.2 }),
    dark: mat.std({ color: 0x141518, roughness: 0.7, metalness: 0.1, wet: 0.6 }),
    chrome: mat.surface('metal', { roughness: 0.25, wet: 0.4 }),
    head: mat.neon(0xfff2dc, 5.5),       // instanceColor 控制亮度（远处淡入）
    tail: mat.neon(0xff1420, 2.6),       // instanceColor 控制亮度（刹车更亮）
    amber: mat.neon(NEON.amber, 3.5),
    busWin: mat.emissiveMap(busInterior(ctx), 1.5),
    busStripe: mat.std({ color: 0x1f3f7a, roughness: 0.35, metalness: 0.2, wet: 0.5 }),
    taxiSign: mat.emissiveMap(taxiSign.texture, 2.6),
    busSign: mat.emissiveMap(busSign.texture, 2.4),
    rider: mat.std({ color: 0xffffff, roughness: 0.25, metalness: 0.0, wet: 0.8 }),     // 雨披：instanceColor
    skin: mat.std({ color: 0x6a4a3a, roughness: 0.8, wet: 0.3 }),
    taxiAspect: taxiSign.aspect, busAspect: busSign.aspect,
  };
  return M;
}

// ------------------------------------------------------------ 车型定义
// 返回 { name, length, width, parts: [{ key, mat, geo, inst: 'body'|'head'|'tail'|null }],
//        headPts: [[x,y,z]], tailPts: [[x,y,z]] }
function sedan(M, { taxi = false } = {}) {
  const W = 1.8;
  const body = [
    profile([[-2.3, 0.27], [2.28, 0.27], [2.33, 0.5], [2.24, 0.7], [1.0, 0.84], [-1.72, 0.86], [-2.26, 0.82], [-2.34, 0.55]], W),
    box(1.22, 0.05, W - 0.2, -0.43, 1.355, 0),                 // 车顶
    box(0.09, 0.52, W - 0.13, -0.33, 0.85, 0),                // B 柱
  ];
  const glass = [profile([[1.0, 0.82], [0.17, 1.37], [-1.02, 1.38], [-1.74, 0.84]], W - 0.16, 0.02)];
  const dark = [
    ...wheels(0.33, 0.22, [1.38, -1.38], W),
    box(4.2, 0.17, W - 0.15, 0, 0.1, 0),
    box(0.05, 0.14, 0.9, 2.31, 0.36, 0),                      // 进气格栅
    box(0.05, 0.1, W - 0.1, -2.33, 0.33, 0),                  // 后保险杠下沿
    box(0.14, 0.1, 0.12, 0.88, 0.88, W / 2 + 0.07), box(0.14, 0.1, 0.12, 0.88, 0.88, -W / 2 - 0.07),   // 后视镜
  ];
  const head = [box(0.07, 0.11, 0.42, 2.27, 0.56, 0.58), box(0.07, 0.11, 0.42, 2.27, 0.56, -0.58)];
  const tail = [box(0.05, 0.1, 0.46, -2.32, 0.66, 0.56), box(0.05, 0.1, 0.46, -2.32, 0.66, -0.56), box(0.04, 0.035, 0.7, -2.33, 0.7, 0)];
  const parts = [
    { key: 'body', mat: M.body, geo: merge(body), inst: 'body' },
    { key: 'glass', mat: M.glass, geo: merge(glass) },
    { key: 'dark', mat: M.dark, geo: merge(dark) },
    { key: 'chrome', mat: M.chrome, geo: merge([box(0.03, 0.03, 1.2, 2.32, 0.47, 0)]) },
    { key: 'head', mat: M.head, geo: merge(head), inst: 'head' },
    { key: 'tail', mat: M.tail, geo: merge(tail), inst: 'tail' },
  ];
  if (taxi) {
    // 顶灯：小灯箱，前后两面"空车"
    parts.push({ key: 'dark2', mat: M.dark, geo: merge([box(0.24, 0.17, 0.56, -0.45, 1.4, 0)]) });
    const w = 0.5, h = Math.min(0.15, w / M.taxiAspect);
    const qf = new THREE.PlaneGeometry(w, h); qf.rotateY(Math.PI / 2); qf.translate(-0.325, 1.485, 0);
    const qb = new THREE.PlaneGeometry(w, h); qb.rotateY(-Math.PI / 2); qb.translate(-0.575, 1.485, 0);
    parts.push({ key: 'taxiSign', mat: M.taxiSign, geo: merge([qf, qb]) });
  }
  return { name: taxi ? 'taxi' : 'sedan', length: 4.66, width: W, parts,
    headPts: [[2.32, 0.56, 0.58], [2.32, 0.56, -0.58]], tailPts: [[-2.36, 0.66, 0.56], [-2.36, 0.66, -0.56]] };
}

function suv(M) {
  const W = 1.92;
  const body = [
    profile([[-2.36, 0.4], [2.33, 0.4], [2.38, 0.66], [2.28, 0.93], [1.25, 1.03], [-2.22, 1.05], [-2.39, 0.96], [-2.41, 0.66]], W),
    box(2.45, 0.06, W - 0.2, -0.85, 1.64, 0),
    box(0.1, 0.62, W - 0.14, -0.5, 1.03, 0), box(0.12, 0.62, W - 0.14, -1.6, 1.03, 0),
  ];
  const glass = [profile([[1.25, 1.01], [0.45, 1.65], [-2.08, 1.66], [-2.24, 1.03]], W - 0.18, 0.02)];
  const dark = [
    ...wheels(0.38, 0.26, [1.45, -1.45], W),
    box(4.3, 0.26, W - 0.12, 0, 0.14, 0),
    box(0.05, 0.22, 1.1, 2.36, 0.48, 0),
    box(2.3, 0.05, 0.05, -0.85, 1.7, W / 2 - 0.15), box(2.3, 0.05, 0.05, -0.85, 1.7, -W / 2 + 0.15),   // 行李架
    box(0.15, 0.11, 0.12, 1.12, 1.07, W / 2 + 0.07), box(0.15, 0.11, 0.12, 1.12, 1.07, -W / 2 - 0.07),
  ];
  // 贯穿式日行灯 + 主灯
  const head = [box(0.07, 0.1, 0.4, 2.31, 0.78, 0.62), box(0.07, 0.1, 0.4, 2.31, 0.78, -0.62), box(0.05, 0.025, 1.5, 2.33, 0.88, 0)];
  const tail = [box(0.05, 0.12, 0.42, -2.39, 0.84, 0.62), box(0.05, 0.12, 0.42, -2.39, 0.84, -0.62), box(0.04, 0.03, 1.3, -2.4, 0.9, 0)];
  return { name: 'suv', length: 4.8, width: W,
    parts: [
      { key: 'body', mat: M.body, geo: merge(body), inst: 'body' },
      { key: 'glass', mat: M.glass, geo: merge(glass) },
      { key: 'dark', mat: M.dark, geo: merge(dark) },
      { key: 'head', mat: M.head, geo: merge(head), inst: 'head' },
      { key: 'tail', mat: M.tail, geo: merge(tail), inst: 'tail' },
    ],
    headPts: [[2.36, 0.78, 0.62], [2.36, 0.78, -0.62]], tailPts: [[-2.43, 0.84, 0.62], [-2.43, 0.84, -0.62]] };
}

// 面包车（"五菱"式微面）：短车头、高车身
function van(M) {
  const W = 1.66;
  const body = [
    profile([[-1.98, 0.28], [1.96, 0.28], [2.02, 0.55], [1.96, 0.92], [1.58, 1.04], [-1.98, 1.05], [-2.02, 0.55]], W),
    box(3.15, 0.12, W - 0.02, -0.42, 1.7, 0),
    box(0.12, 0.66, W - 0.06, 0.62, 1.04, 0), box(0.12, 0.66, W - 0.06, -0.7, 1.04, 0), box(0.16, 0.66, W - 0.06, -1.92, 1.04, 0),
  ];
  const glass = [profile([[1.58, 1.02], [1.12, 1.71], [-1.95, 1.71], [-1.95, 1.02]], W - 0.1, 0.02)];
  const dark = [
    ...wheels(0.3, 0.2, [1.32, -1.3], W),
    box(3.6, 0.16, W - 0.14, 0, 0.1, 0),
    box(0.05, 0.12, 0.8, 2.0, 0.38, 0),
    box(0.12, 0.1, 0.1, 1.5, 1.08, W / 2 + 0.06), box(0.12, 0.1, 0.1, 1.5, 1.08, -W / 2 - 0.06),
  ];
  const head = [box(0.06, 0.14, 0.3, 1.99, 0.72, 0.55), box(0.06, 0.14, 0.3, 1.99, 0.72, -0.55)];
  const tail = [box(0.05, 0.22, 0.12, -2.0, 0.7, 0.72), box(0.05, 0.22, 0.12, -2.0, 0.7, -0.72)];
  return { name: 'van', length: 4.05, width: W,
    parts: [
      { key: 'body', mat: M.body, geo: merge(body), inst: 'body' },
      { key: 'glass', mat: M.glass, geo: merge(glass) },
      { key: 'dark', mat: M.dark, geo: merge(dark) },
      { key: 'head', mat: M.head, geo: merge(head), inst: 'head' },
      { key: 'tail', mat: M.tail, geo: merge(tail), inst: 'tail' },
    ],
    headPts: [[2.03, 0.72, 0.55], [2.03, 0.72, -0.55]], tailPts: [[-2.04, 0.72, 0.72], [-2.04, 0.72, -0.72]] };
}

// 公交车：发光车窗带 + 前方 LED 线路牌
function bus(M) {
  const L = 11.2, W = 2.5, hx = L / 2;
  const body = [
    profile([[-hx, 0.32], [hx - 0.05, 0.32], [hx + 0.05, 0.62], [hx + 0.05, 1.12], [-hx, 1.12]], W, 0.05),
    profile([[-hx, 2.52], [hx + 0.05, 2.52], [hx + 0.05, 2.9], [hx - 0.15, 3.12], [-hx + 0.1, 3.12], [-hx, 2.95]], W, 0.05),
    box(0.3, 1.42, W - 0.05, -hx + 0.15, 1.11, 0),                        // 车尾
    box(0.1, 0.35, W, 0, 3.12, 0.0),                                       // 空调顶包
  ];
  // 窗柱：把亮窗带分成一格一格
  for (let x = -hx + 0.3; x < hx - 1.4; x += 1.32) body.push(box(0.14, 1.42, W + 0.02, x, 1.11, 0));
  const glass = [box(0.9, 1.5, W - 0.06, hx - 0.42, 1.1, 0), box(1.25, 1.2, 0.03, 0.8 + 3.3, 1.12, W / 2 + 0.005)];
  const win = [box(L - 1.5, 1.38, W - 0.08, -0.62, 1.13, 0)];
  const stripe = [box(L + 0.06, 0.16, W + 0.03, 0, 0.92, 0)];
  const dark = [...wheels(0.5, 0.3, [3.4, -2.9], W), box(L - 0.6, 0.24, W - 0.2, 0, 0.1, 0), box(0.05, 0.2, 1.6, hx + 0.06, 0.42, 0)];
  const head = [box(0.06, 0.14, 0.38, hx + 0.06, 0.7, 0.85), box(0.06, 0.14, 0.38, hx + 0.06, 0.7, -0.85)];
  const tail = [box(0.06, 0.4, 0.14, -hx - 0.02, 0.75, 1.05), box(0.06, 0.4, 0.14, -hx - 0.02, 0.75, -1.05), box(0.06, 0.06, 1.2, -hx - 0.02, 2.85, 0)];
  const sw = 1.5, sh = Math.min(0.3, sw / M.busAspect);
  const sign = new THREE.PlaneGeometry(sw, sh); sign.rotateY(Math.PI / 2); sign.translate(hx + 0.07, 2.72, 0);
  return { name: 'bus', length: L, width: W,
    parts: [
      { key: 'body', mat: M.body, geo: merge(body), inst: 'body' },
      { key: 'glass', mat: M.glass, geo: merge(glass) },
      { key: 'win', mat: M.busWin, geo: merge(win) },
      { key: 'stripe', mat: M.busStripe, geo: merge(stripe) },
      { key: 'dark', mat: M.dark, geo: merge(dark) },
      { key: 'sign', mat: M.busSign, geo: merge([sign]) },
      { key: 'head', mat: M.head, geo: merge(head), inst: 'head' },
      { key: 'tail', mat: M.tail, geo: merge(tail), inst: 'tail' },
    ],
    headPts: [[hx + 0.1, 0.7, 0.85], [hx + 0.1, 0.7, -0.85]], tailPts: [[-hx - 0.05, 0.75, 1.05], [-hx - 0.05, 0.75, -1.05]] };
}

// 电瓶车/摩托 + 披雨披的骑手（雨披颜色走 instanceColor）
function moto(M) {
  const dark = [
    wheel(0.27, 0.09, 0.62, 0, 12), wheel(0.27, 0.09, -0.62, 0, 12),
    box(1.15, 0.22, 0.24, 0, 0.32, 0),                // 踏板
    box(0.12, 0.6, 0.12, 0.6, 0.42, 0),               // 前叉
    box(0.06, 0.05, 0.62, 0.58, 1.02, 0),             // 车把
    box(0.5, 0.14, 0.26, -0.4, 0.62, 0),              // 尾箱座
  ];
  // 雨披：前后拉长的锥体，从肩部罩到车把
  const poncho = new THREE.ConeGeometry(0.56, 0.95, 9, 1, true);
  poncho.translate(0, 0.475 + 0.62, 0); poncho.scale(1.25, 1, 0.95); poncho.translate(0.05, -0.02, 0);
  const capG = new THREE.ConeGeometry(0.2, 0.14, 8, 1, false); capG.translate(0, 1.6, 0);
  const helmet = new THREE.SphereGeometry(0.15, 8, 6); helmet.translate(-0.02, 1.62, 0);
  const visor = box(0.04, 0.09, 0.22, 0.13, 1.55, 0);
  const arms = [box(0.5, 0.09, 0.09, 0.32, 1.1, 0.2), box(0.5, 0.09, 0.09, 0.32, 1.1, -0.2)];
  const head = [box(0.06, 0.12, 0.16, 0.72, 0.92, 0)];
  const tail = [box(0.05, 0.07, 0.18, -0.66, 0.72, 0)];
  return { name: 'moto', length: 1.75, width: 0.7,
    parts: [
      { key: 'body', mat: M.rider, geo: merge([poncho, capG, ...arms]), inst: 'body' },
      { key: 'dark', mat: M.dark, geo: merge([...dark, helmet, visor]) },
      { key: 'head', mat: M.head, geo: merge(head), inst: 'head' },
      { key: 'tail', mat: M.tail, geo: merge(tail), inst: 'tail' },
    ],
    headPts: [[0.76, 0.92, 0]], tailPts: [[-0.7, 0.72, 0]] };
}

export function carTypes(ctx) {
  const M = materials(ctx);
  return { sedan: sedan(M), taxi: sedan(M, { taxi: true }), suv: suv(M), van: van(M), bus: bus(M), moto: moto(M) };
}

// 车漆（sRGB，暗、低饱和；出租车是重庆常见的柠檬黄，压暗以符合受光表面亮度上限）
export const PAINTS = {
  taxi: [0xa89a1e, 0xa09420],
  sedan: [0x121316, 0x1a1c22, 0x6a707a, 0x8e9298, 0x4a1a20, 0x1c2840, 0x3a4446, 0x2a2c30],
  suv: [0x121316, 0x8e9298, 0x3c4048, 0x2a3a2e, 0x50525a],
  van: [0x9a9ea4, 0x8e9298, 0x6e7078, 0x2c3a58],
  bus: [0x5a6068, 0x50525a],
  moto: [0x2a5aa8, 0x8a1e22, 0x2f6a3a, 0x9a8a2a, 0x3c6f8a, 0x5a2a6a, 0x9aa0a8],
};
