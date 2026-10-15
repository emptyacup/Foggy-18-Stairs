// aircraft-carrier —— 悬停母舰：分段楔形舰体 + 腹部龙骨 + 舰桥 + 引擎组 + 实例化 greeble + 腹部灯阵 + 垂向城市的光束。
// 局部坐标：+X 舰首，+Y 上，Z = 舷宽方向，原点 = 舰体中心线。整舰挂在一个 Group 下，按 t 缓慢浮动。
import * as THREE from 'three';
import { NEON } from '../../core/palette.js';
import { hullMaterial, emitMaterial, Glows, makeBeam, aimBeam, prep, merge, rgb, cbox, loft, fogUniforms } from './aircraft-fx.js';

// 舰体平面/侧面轮廓关键截面：[x, 半宽 w, 顶 t, 底 b]（舰尾 → 舰首）
const KEY = [
  [-318, 76, 16, -28],
  [-296, 96, 22, -40],
  [-210, 106, 25, -46],
  [-70, 100, 24, -47],
  [60, 84, 20, -43],
  [170, 60, 16, -35],
  [262, 30, 10, -22],
  [334, 3, 3, -5],
];
function sec(x) {
  if (x <= KEY[0][0]) return { x, w: KEY[0][1], t: KEY[0][2], b: KEY[0][3] };
  for (let i = 0; i < KEY.length - 1; i++) {
    const a = KEY[i], c = KEY[i + 1];
    if (x <= c[0]) {
      const k = (x - a[0]) / (c[0] - a[0]);
      return { x, w: a[1] + (c[1] - a[1]) * k, t: a[2] + (c[2] - a[2]) * k, b: a[3] + (c[3] - a[3]) * k };
    }
  }
  const z = KEY[KEY.length - 1];
  return { x, w: z[1], t: z[2], b: z[3] };
}
// 舰体分段（段间 10 m 缝，露出内收的芯体）
const SEGS = [[-318, -222], [-212, -96], [-86, 40], [50, 160], [170, 334]];
// 腹部龙骨：[x, 半宽, 底]
const KEEL = [[-270, 30, -70], [-150, 34, -76], [0, 30, -74], [130, 22, -64], [210, 12, -50]];
function keelAt(x) {
  if (x <= KEEL[0][0]) return KEEL[0];
  for (let i = 0; i < KEEL.length - 1; i++) {
    const a = KEEL[i], c = KEEL[i + 1];
    if (x <= c[0]) { const k = (x - a[0]) / (c[0] - a[0]); return [x, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k]; }
  }
  return KEEL[KEEL.length - 1];
}

export function buildCarrier(ctx) {
  const { L } = ctx;
  const C = L.MEGA.carrier;
  const rng = ctx.rng('carrier');
  const FOGK = 0.09;

  const root = new THREE.Group();
  root.name = 'carrier';
  // 舰体中心线比 layout 的 520 略低 30 m：主镜头仰角有限，腹部（最有看点的一面）才能进画
  const baseY = C.y - 30;
  const yaw = 0.42;      // 舰首指向东北，斜 3/4 视角，舰尾引擎略朝镜头
  root.position.set(C.x, baseY, C.z);
  root.rotation.y = yaw;
  root.scale.setScalar(C.scale ?? 1);   // 整体缩放（layout 控制：近处悬停时缩小）
  ctx.dynamicRoot.add(root);

  const hullMat = hullMaterial(ctx, { fogK: FOGK, panel: 11, windows: 0.06, under: 1.1, underColor: 0xa8584e, sky: 0.9, seamDark: 0.5 });
  const emit = emitMaterial(ctx, { fogK: FOGK * 0.8 });

  const HULL = rgb(0x5a5e6a), HULL_DK = rgb(0x3a3d48), HULL_LT = rgb(0x767a86), KEELC = rgb(0x4a4c58);
  const geos = [];
  const emits = [];

  // ---------------------------------------------------------- 分段舰体 + 芯体
  for (const [x0, x1] of SEGS) {
    const xs = [x0, x0 + 6, ...KEY.map(k => k[0]).filter(x => x > x0 + 6 && x < x1 - 6), x1 - 6, x1];
    const secs = xs.map((x, i) => {
      const s = sec(x);
      const inset = (i === 0 || i === xs.length - 1) && x < 330 ? 1 : 0;
      return inset ? { x, w: s.w - 5, t: s.t - 3, b: s.b + 4 } : s;
    });
    geos.push(loft(secs, HULL));
  }
  {
    const xs = [];
    for (let x = -312; x <= 300; x += 24) xs.push(x);
    geos.push(loft(xs.map(x => { const s = sec(x); return { x, w: s.w * 0.82, t: s.t * 0.7, b: s.b * 0.8 }; }), HULL_DK));
  }
  // 段缝里的灯带（横跨腹部 / 两舷）
  for (let i = 0; i < SEGS.length - 1; i++) {
    const x = (SEGS[i][1] + SEGS[i + 1][0]) / 2;
    const s = sec(x);
    emits.push(cbox(1.2, 1.2, s.w * 1.55, x, s.b * 0.8 - 0.4, 0, rgb(NEON.amber, 2.6)));
    for (const sd of [-1, 1]) emits.push(cbox(1.0, (s.t - s.b) * 0.45, 1.0, x, (s.t + s.b) * 0.3, sd * s.w * 0.82, rgb(NEON.cyan, 2.2)));
  }

  // ---------------------------------------------------------- 上层建筑：阶梯式甲板 + 舰桥塔
  const tierA = [], tierB = [];
  for (let x = -306; x <= 10; x += 30) { const s = sec(x); tierA.push({ x, w: s.w * 0.62, t: s.t + 11, b: s.t - 4, ct: 6, cb: 0.1 }); }
  for (let x = -290; x <= -110; x += 30) { const s = sec(x); tierB.push({ x, w: s.w * 0.36, t: s.t + 22, b: s.t + 6, ct: 5, cb: 0.1 }); }
  geos.push(loft(tierA, HULL_LT), loft(tierB, HULL));
  {
    const bx = -236, s = sec(bx), y0 = s.t + 22;
    geos.push(cbox(18, 34, 14, bx, y0 + 17, 0, HULL_DK));                      // 舰桥颈
    geos.push(loft([                                                         // 舰桥头：宽 T 形
      { x: bx - 12, w: 34, t: y0 + 46, b: y0 + 33, ct: 3, cb: 3 },
      { x: bx + 8, w: 44, t: y0 + 46, b: y0 + 33, ct: 3, cb: 4 },
      { x: bx + 14, w: 40, t: y0 + 44, b: y0 + 36, ct: 2, cb: 2 },
    ], HULL));
    emits.push(cbox(0.6, 2.2, 84, bx + 14.4, y0 + 40, 0, rgb(0xbfe6ff, 2.4)));   // 舰桥观察窗带
    // 天线桅杆 + 雷达盘
    for (const [dx, dz, h] of [[-4, 0, 70], [-14, 18, 44], [-14, -18, 38], [6, 30, 26]]) {
      geos.push(cbox(1.6, h, 1.6, bx + dx, y0 + 46 + h / 2, dz, HULL_DK));
      geos.push(cbox(9, 0.8, 0.8, bx + dx, y0 + 46 + h * 0.7, dz, HULL_DK));
    }
    const dish = new THREE.SphereGeometry(9, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
    dish.rotateZ(Math.PI * 0.6); dish.translate(bx - 40, s.t + 30, 22);
    geos.push(prep(dish, HULL_LT));
  }
  // 舰首上方的"脊"
  geos.push(loft([20, 120, 220, 300].map(x => { const s = sec(x); return { x, w: s.w * 0.2, t: s.t + 7 - x * 0.01, b: s.t - 2, ct: 3, cb: 0.1 }; }), HULL_LT));

  // ---------------------------------------------------------- 两舷炮塔式外挂块（sponson）
  for (let x = -280; x <= 170; x += 38) {
    const s = sec(x), s2 = sec(x + 1);
    const ang = Math.atan2(s2.w - s.w, 1);
    for (const sd of [-1, 1]) {
      const g = new THREE.BoxGeometry(26, 12, 9);
      g.rotateY(-sd * ang);
      g.translate(x, (s.t + s.b) * 0.5 - 2, sd * (s.w + 3.5));
      geos.push(prep(g, HULL_DK));
      emits.push(cbox(18, 0.7, 0.4, x, (s.t + s.b) * 0.5 + 1.5, sd * (s.w + 8.1), rgb(NEON.amber, 1.8)));
    }
  }

  // ---------------------------------------------------------- 腹部龙骨（分三段，中间是机库）
  for (const [x0, x1] of [[-272, -140], [-130, 40], [50, 214]]) {
    const xs = [x0, x0 + 8, ...KEEL.map(k => k[0]).filter(x => x > x0 + 8 && x < x1 - 8), x1 - 8, x1];
    geos.push(loft(xs.map((x, i) => {
      const [, w, b] = keelAt(x), s = sec(x);
      const e = i === 0 || i === xs.length - 1;
      return { x, w: e ? w * 0.8 : w, t: s.b + 6, b: e ? b + 8 : b, ct: 0.1, cb: w * 0.45 };
    }), KEELC));
  }
  // 机库口：龙骨底面的暖光开口
  const bays = [[-205, 46, 18], [-45, 60, 20], [125, 36, 12]];
  for (const [bx, len, wid] of bays) {
    const [, , b] = keelAt(bx);
    const q = new THREE.PlaneGeometry(len, wid, 6, 3);
    q.rotateX(Math.PI / 2); q.translate(bx, b - 0.6, 0);
    const pg = prep(q, [0, 0, 0]);
    // 渐变：中间亮、边缘暗（顶点色）
    const p = pg.attributes.position, c = pg.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const u = Math.abs(p.getX(i) - bx) / (len / 2), v = Math.abs(p.getZ(i)) / (wid / 2);
      const k = (1 - u * u * 0.6) * (1 - v * v * 0.7);
      c.setXYZ(i, 2.4 * k, 1.5 * k, 0.8 * k);
    }
    emits.push(pg);
    // 开口边框
    geos.push(cbox(len + 4, 3, 2, bx, b - 2.5, wid / 2 + 1, HULL_DK), cbox(len + 4, 3, 2, bx, b - 2.5, -wid / 2 - 1, HULL_DK));
  }

  // ---------------------------------------------------------- 引擎组（舰尾，喷口朝 -X）
  const engines = [[0, 0, 19], [-14, 44, 14], [-14, -44, 14], [6, 80, 10], [6, -80, 10], [-30, 0, 9]];
  for (const [ey, ez, r] of engines) {
    const len = 46 + r;
    const cyl = new THREE.CylinderGeometry(r, r * 1.12, len, 18, 1, false);
    cyl.rotateZ(Math.PI / 2); cyl.translate(-318 - len / 2 + 14, ey, ez);
    geos.push(prep(cyl, HULL_DK));
    // 散热环
    for (let k = 0; k < 4; k++) {
      const ring = new THREE.CylinderGeometry(r * 1.18, r * 1.18, 2.4, 18, 1, false);
      ring.rotateZ(Math.PI / 2); ring.translate(-318 - 6 - k * 9, ey, ez);
      geos.push(prep(ring, HULL));
    }
    const nx = -318 - len + 14;
    const disc = new THREE.CircleGeometry(r * 0.92, 20);
    disc.rotateY(-Math.PI / 2); disc.translate(nx - 0.5, ey, ez);
    emits.push(prep(disc, rgb(0x9fd8ff, 3.2)));
    const core = new THREE.CircleGeometry(r * 0.5, 16);
    core.rotateY(-Math.PI / 2); core.translate(nx - 0.8, ey, ez);
    emits.push(prep(core, rgb(0xe8f6ff, 6)));
  }

  // ---------------------------------------------------------- 腹部挂载：传感器圆顶、下垂天线
  for (const [dx, dz] of [[-250, 50], [-250, -50], [-90, 58], [-90, -58], [90, 44], [90, -44]]) {
    const s = sec(dx);
    const dome = new THREE.SphereGeometry(9, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    dome.translate(dx, s.b, dz);
    geos.push(prep(dome, HULL_LT));
  }
  const pylonTips = [];
  for (const [dx, dz, h] of [[-300, 0, 34], [-170, 66, 26], [-170, -66, 26], [0, 60, 30], [0, -60, 30], [200, 0, 22]]) {
    const s = dz === 0 ? { b: keelAt(dx)[2] } : sec(dx);
    geos.push(cbox(1.8, h, 1.8, dx, s.b - h / 2, dz, HULL_DK));
    geos.push(cbox(6, 1.2, 6, dx, s.b - h * 0.4, dz, HULL_DK));
    pylonTips.push([dx, s.b - h - 1, dz]);
  }

  // ---------------------------------------------------------- 腹部边缘灯带（沿底部倒角线）
  for (const [x0, x1] of SEGS) {
    for (let x = x0 + 8; x < x1 - 8; x += 12) {
      const s = sec(x), s2 = sec(Math.min(x + 12, x1 - 8));
      for (const sd of [-1, 1]) {
        const a = new THREE.Vector3(x, s.b + 0.2, sd * (s.w - (s.t - s.b) * 0.35 + 1));
        const b = new THREE.Vector3(Math.min(x + 12, x1 - 8), s2.b + 0.2, sd * (s2.w - (s2.t - s2.b) * 0.35 + 1));
        const len = a.distanceTo(b);
        if (len < 2) continue;
        const g = new THREE.BoxGeometry(len - 3, 0.9, 0.9);
        g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.5, (a.z + b.z) / 2);
        emits.push(prep(g, rgb(NEON.cyan, 2.4)));
      }
    }
  }

  const hull = new THREE.Mesh(merge(geos), hullMat);
  hull.name = 'carrier-hull';
  hull.frustumCulled = false;
  root.add(hull);
  const emitMesh = new THREE.Mesh(merge(emits), emit);
  emitMesh.name = 'carrier-emit';
  emitMesh.frustumCulled = false;
  root.add(emitMesh);

  // ---------------------------------------------------------- Greeble：实例化面板/凸起
  const boxG = prep(new THREE.BoxGeometry(1, 1, 1), [1, 1, 1]);
  const greebles = [];
  const add = (cx, cy, cz, sx, sy, sz, ry = 0, tone = 1) => greebles.push({ cx, cy, cz, sx, sy, sz, ry, tone });
  // 腹部（主看面）
  for (let i = 0; i < 1900; i++) {
    const x = rng.range(-312, 320), s = sec(x);
    const zMax = s.w - (s.t - s.b) * 0.35 - 2;
    if (zMax < 4) continue;
    const z = rng.range(-zMax, zMax);
    const k = keelAt(x);
    if (Math.abs(z) < k[1] + 2 && x > -272 && x < 214) continue;   // 龙骨占的地方另算
    const big = rng.chance(0.12);
    const sx = big ? rng.range(18, 40) : rng.range(3, 14), sz = big ? rng.range(8, 22) : rng.range(2, 9), sy = big ? rng.range(2, 4) : rng.range(0.8, 3.2);
    add(x, s.b - sy / 2 + 0.3, z, sx, sy, sz, rng.chance(0.15) ? rng.range(-0.3, 0.3) : 0, rng.range(0.55, 1.3));
  }
  // 两舷
  for (let i = 0; i < 1100; i++) {
    const x = rng.range(-310, 300), s = sec(x);
    const h = s.t - s.b;
    const y = rng.range(s.b + h * 0.38, s.t - h * 0.22);
    const sd = rng.sign();
    const out = rng.range(0.8, 3.5);
    const s2 = sec(x + 1), ang = Math.atan2(s2.w - s.w, 1);
    add(x, y - rng.range(1, 4) / 2, sd * (s.w + out / 2 - 0.5), rng.range(4, 20), rng.range(1.2, 6), out, -sd * ang, rng.range(0.55, 1.25));
  }
  // 顶部
  for (let i = 0; i < 700; i++) {
    const x = rng.range(-300, 300), s = sec(x);
    const zMax = s.w * 0.85 - 4;
    if (zMax < 3) continue;
    const sy = rng.range(1, 6);
    add(x, s.t + sy / 2 - 0.4, rng.range(-zMax, zMax), rng.range(3, 22), sy, rng.range(3, 14), 0, rng.range(0.6, 1.3));
  }
  // 龙骨两侧与底面
  for (let i = 0; i < 700; i++) {
    const x = rng.range(-266, 208), k = keelAt(x), s = sec(x);
    if (rng.chance(0.55)) {
      const sy = rng.range(0.8, 3);
      const onBay = bays.some(([bx, len, wid]) => Math.abs(x - bx) < len / 2 + 4);
      if (onBay) continue;
      add(x, k[2] - sy / 2 + 0.3, rng.range(-k[1] * 0.5, k[1] * 0.5), rng.range(3, 16), sy, rng.range(2, 10), 0, rng.range(0.6, 1.3));
    } else {
      const sd = rng.sign(), out = rng.range(1, 3);
      add(x, rng.range(k[2] + 6, s.b - 2), sd * (k[1] * 0.85 + out / 2), rng.range(4, 14), rng.range(2, 6), out, 0, rng.range(0.6, 1.3));
    }
  }
  const gm = new THREE.InstancedMesh(boxG, hullMat, greebles.length);
  gm.name = 'carrier-greeble';
  gm.frustumCulled = false;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), CC = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  greebles.forEach((g, i) => {
    Q.setFromAxisAngle(Y, g.ry);
    M4.compose(V.set(g.cx, g.cy, g.cz), Q, S.set(g.sx, g.sy, g.sz));
    gm.setMatrixAt(i, M4);
    CC.setRGB(0.36 * g.tone, 0.37 * g.tone, 0.42 * g.tone);
    gm.setColorAt(i, CC);
  });
  root.add(gm);

  // ---------------------------------------------------------- 腹部灯阵（成千上万的小灯点，Points）
  const pts = [], cols = [], seeds = [];
  const lightCol = [[1.0, 0.78, 0.5], [1.0, 0.9, 0.75], [0.6, 0.85, 1.0], [1.0, 0.55, 0.35]];
  for (let blk = 0; blk < 150; blk++) {
    const x0 = rng.range(-300, 300), s = sec(x0);
    const zMax = s.w - (s.t - s.b) * 0.35 - 4;
    if (zMax < 6) continue;
    const bw = rng.range(14, 50), bd = rng.range(8, 30);
    const z0 = rng.range(-zMax, zMax - bd);
    const pitch = rng.pick([2.0, 2.6, 3.2]);
    const col = rng.weighted([[0, 5], [1, 3], [2, 2], [3, 1]]);
    const fill = rng.range(0.35, 0.9);
    for (let x = x0; x < x0 + bw; x += pitch) {
      const sx = sec(x);
      for (let z = z0; z < z0 + bd; z += pitch) {
        if (Math.abs(z) > sx.w - (sx.t - sx.b) * 0.35 - 2) continue;
        if (!rng.chance(fill)) continue;
        const k = keelAt(x);
        const inKeel = Math.abs(z) < k[1] && x > -272 && x < 214;
        pts.push(x, (inKeel ? k[2] : sx.b) - 0.8, z);
        const c = lightCol[col], br = rng.range(0.5, 1.4);
        cols.push(c[0] * br, c[1] * br, c[2] * br);
        seeds.push(rng());
      }
    }
  }
  // 龙骨底面两条"跑道灯"（追逐闪烁）
  for (let x = -266; x < 208; x += 4) {
    const k = keelAt(x);
    for (const sd of [-1, 1]) { pts.push(x, k[2] - 1, sd * k[1] * 0.42); cols.push(1.6, 0.5, 0.3); seeds.push(-1 - (x + 300) / 600); }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  pg.setAttribute('aCol', new THREE.Float32BufferAttribute(cols, 3));
  pg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  const pu = { ...fogUniforms(ctx, FOGK * 0.55), uTime: ctx.shared.uTime, uViewH: { value: 720 }, uSize: { value: 1.3 } };
  const pMat = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: pu,
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aSeed;
      varying vec3 vCol;
      uniform float uTime, uViewH, uSize, uFogDensity, uFogK;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = max(-mv.z, 1.0);
        float px = uSize * projectionMatrix[1][1] * uViewH * 0.5 / d;
        float sz = max(px, 1.6);
        float tw = 1.0;
        if (aSeed < 0.0) { float ph = fract(uTime * 0.5 + aSeed); tw = 0.25 + 2.5 * exp(-ph * 30.0); }
        else tw = 0.8 + 0.2 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0);
        vCol = aCol * tw * (px / sz) * 4.0 * exp(-d * uFogDensity * uFogK);
        gl_PointSize = sz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main(){
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(p, p) * 2.5);
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const points = new THREE.Points(pg, pMat);
  points.name = 'carrier-lights';
  points.frustumCulled = false;
  points.renderOrder = 11;
  root.add(points);

  // ---------------------------------------------------------- 航行灯 / 引擎辉光（精灵）
  const glows = new Glows(ctx, 260, { parent: root, fogK: FOGK * 0.5, minPx: 5, streak: 0.4, name: 'carrier-glows' });
  for (const [ey, ez, r] of engines) glows.add({ pos: [-318 - 46 - r + 14 - 4, ey, ez], color: 0x8fd0ff, intensity: 1.6, size: r * 3.2 });
  const tipW = sec(-296);
  glows.add({ pos: [-296, tipW.b + 8, tipW.w + 2], color: 0x20ff60, intensity: 6, size: 9, blink: [2.4, 0.0, 0.5] });
  glows.add({ pos: [-296, tipW.b + 8, -tipW.w - 2], color: 0xff2020, intensity: 6, size: 9, blink: [2.4, 0.0, 0.5] });
  glows.add({ pos: [336, 0, 0], color: 0xffffff, intensity: 9, size: 10, blink: [1.7, 0.2, 0.08] });
  glows.add({ pos: [-236 - 4, sec(-236).t + 22 + 46 + 72, 0], color: 0xff2a2a, intensity: 7, size: 8, blink: [2.0, 0.5, 0.3] });
  for (const p of pylonTips) glows.add({ pos: p, color: 0xff3020, intensity: 5, size: 6, blink: [1.6, rng(), 0.35] });
  // 两舷频闪白灯
  for (let x = -280; x <= 260; x += 90) {
    const s = sec(x);
    for (const sd of [-1, 1]) glows.add({ pos: [x, s.b + 2, sd * (s.w + 1)], color: 0xffffff, intensity: 6, size: 5, blink: [2.6, (x + 300) / 2400 + (sd > 0 ? 0.5 : 0), 0.06] });
  }
  // 腹部光束发射口
  const emitters = [[-190, 0], [-60, 0], [70, 0], [165, 0]].map(([x, z]) => [x, keelAt(x)[2] - 3, z]);
  for (const e of emitters) glows.add({ pos: e, color: 0xcfeaff, intensity: 3.2, size: 22 });
  // 舷侧零散琥珀标识灯
  for (let i = 0; i < 120; i++) {
    const x = rng.range(-300, 320), s = sec(x), sd = rng.sign();
    const y = rng.range(s.b + 6, s.t - 3);
    glows.add({ pos: [x, y, sd * (s.w + 0.8)], color: rng.pick([NEON.amber, 0xffd8a0, NEON.cyan]), intensity: rng.range(1.5, 3.2), size: rng.range(2, 4) });
  }
  glows.commit();
  const nGlow = glows.count;

  // ---------------------------------------------------------- 垂向城市的光束
  const beams = emitters.map((e, i) => {
    const b = makeBeam(ctx, root, { color: i === 1 ? 0xffb8e8 : 0xbfe4ff, intensity: 0.16, fogK: FOGK * 0.45, falloff: 0.7, rain: 0.15, core: 0.6, name: 'carrier-beam' });
    return { mesh: b, from: new THREE.Vector3(...e), seed: i * 1.7 + 0.3 };
  });
  const to = new THREE.Vector3();
  const inv = new THREE.Matrix4();

  // ---------------------------------------------------------- 动画（只由 t 决定）
  ctx.onUpdate((dt, t) => {
    root.position.y = baseY + 2.6 * Math.sin(t * 2 * Math.PI / 37);
    root.rotation.z = 0.004 * Math.sin(t * 2 * Math.PI / 53);
    root.rotation.x = 0.003 * Math.sin(t * 2 * Math.PI / 41 + 1);
    const h = ctx.renderer?.domElement?.height;
    if (h) pu.uViewH.value = h;
    // 光束：末端落在城市上（世界 y≈20），缓慢游移
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    for (const b of beams) {
      const w = b.from.clone().applyMatrix4(root.matrixWorld);
      to.set(w.x + 40 * Math.sin(t * 0.07 + b.seed * 2), 15, w.z + 30 * Math.sin(t * 0.05 + b.seed));
      to.applyMatrix4(inv);
      aimBeam(b.mesh, b.from, to, 34 + 6 * Math.sin(b.seed * 3));
    }
  });

  return { root, tris: 0, glows: nGlow, points: pts.length / 3 };
}
