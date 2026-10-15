// aircraft-lanes —— 飞车航道：沿样条航线流动的实例化飞车 + 前灯/尾灯眩光（远处只剩光点串成的灯河）。
// 一条近航道从江对岸飞向镜头、在坡顶上空（y≈75）掠过，制造视差。
import * as THREE from 'three';
import { NEON } from '../../core/palette.js';
import { Glows, emitMaterial, prep, merge, rgb } from './aircraft-fx.js';

// ------------------------------------------------------------ 飞车模型（局部 +X 车头，原点车体中心）
function extrude(pts, width) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -width / 2);
  return g;
}
function cyl(r, len, x, y, z, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r * 0.85, len, seg, 1, false);
  g.rotateZ(Math.PI / 2); g.translate(x, y, z);
  return g;
}
function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
const P = (list, c) => merge(list.map(g => prep(g, c)));

function carGeos() {
  const body = P([
    extrude([[-2.6, -0.35], [2.3, -0.35], [2.75, -0.08], [2.45, 0.2], [0.9, 0.36], [-1.9, 0.5], [-2.7, 0.3]], 2.0),
    box(1.4, 0.18, 0.5, -2.1, 0.62, 0),                          // 尾翼
    cyl(0.36, 1.3, 1.5, -0.25, 1.2), cyl(0.36, 1.3, 1.5, -0.25, -1.2),   // 前推进舱
    cyl(0.42, 1.5, -1.7, -0.2, 1.25), cyl(0.42, 1.5, -1.7, -0.2, -1.25),
  ]);
  const glass = P([extrude([[1.0, 0.34], [0.2, 0.86], [-1.0, 0.9], [-1.7, 0.5]], 1.45)]);
  // 车灯合成一个顶点色自发光网格：前灯暖白、尾灯红、推进器喷口青
  const lamps = merge([
    P([box(0.08, 0.1, 0.5, 2.62, 0.02, 0.62), box(0.08, 0.1, 0.5, 2.62, 0.02, -0.62)], rgb(0xfff2dc, 5)),
    P([box(0.08, 0.1, 1.7, -2.72, 0.25, 0)], rgb(0xff1420, 3)),
    P([box(0.1, 0.5, 0.5, -2.5, -0.2, 1.25), box(0.1, 0.5, 0.5, -2.5, -0.2, -1.25)], rgb(0x7ab8ff, 2.2)),
  ]);
  return { body, glass, lamps };
}

// ------------------------------------------------------------ 航线
// two: 双向（左右各偏 off 米、方向相反）；speed m/s；gap 平均车距
function laneDefs(L) {
  const [h1, h2, h3, h4] = L.MEGA.skyLanes;
  const ew = (z, h, amp, seed) => {
    const pts = [];
    for (let x = -1600; x <= 1600; x += 200) pts.push([x, h + Math.sin(x * 0.004 + seed) * 6, z + Math.sin(x * 0.0023 + seed * 2) * amp]);
    return pts;
  };
  return [
    { pts: ew(-420, h1, 30, 0.3), two: 5, speed: 42, gap: 44, bodies: true },
    { pts: ew(-560, h2, 50, 1.1), two: 6, speed: 50, gap: 26 },
    { pts: ew(-700, h3, 60, 2.0), two: 6, speed: 55, gap: 26 },
    { pts: ew(-1000, h4, 70, 2.9), two: 7, speed: 60, gap: 30 },
    { pts: ew(-1180, h2 + 30, 60, 4.1), two: 7, speed: 55, gap: 34 },
    { pts: [[-280, h2, -1700], [-250, h2, -1100], [-240, h2 + 5, -700], [-300, h2 + 10, -430], [-650, h2 + 20, -300], [-1600, h2 + 30, -260]], two: 5, speed: 48, gap: 36 },
    { pts: [[320, h3, -1700], [300, h3, -1100], [280, h3 - 5, -760], [340, h3 - 10, -460], [800, h3 - 20, -330], [1600, h3 - 20, -300]], two: 5, speed: 52, gap: 36 },
    // 近航道：江对岸 → 镜头 → 从坡顶上空掠过 → 身后山城
    { near: true, pts: [[-460, h3, -1500], [-200, 185, -820], [-40, 132, -460], [20, 100, -230], [28, 88, -100], [30, 84, -30], [30, 86, 40], [42, 100, 200], [90, 138, 480], [200, 180, 900]], two: 5, speed: 34, gap: 52, bodies: true },
  ];
}

const SAMPLES = 700;
function prepareLane(def, idx) {
  const curve = new THREE.CatmullRomCurve3(def.pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const pos = curve.getSpacedPoints(SAMPLES);
  const len = curve.getLength();
  const tan = pos.map((p, i) => {
    const a = pos[Math.max(0, i - 1)], b = pos[Math.min(SAMPLES, i + 1)];
    return b.clone().sub(a).normalize();
  });
  return { ...def, idx, pos, tan, len };
}
function sample(lane, u, outP, outT) {
  const f = Math.min(Math.max(u, 0), 1) * SAMPLES;
  const i = Math.min(SAMPLES - 1, Math.floor(f)), k = f - i;
  outP.lerpVectors(lane.pos[i], lane.pos[i + 1], k);
  outT.lerpVectors(lane.tan[i], lane.tan[i + 1], k).normalize();
}

export function buildLanes(ctx) {
  const { L, mat } = ctx;
  const rng = ctx.rng('lanes');
  const lanes = laneDefs(L).map(prepareLane);

  // 车辆分配：每条航线两个方向
  const cars = [];
  let nb = 0;
  for (const ln of lanes) {
    for (const dir of [1, -1]) {
      const n = Math.max(4, Math.round(ln.len / ln.gap));
      for (let i = 0; i < n; i++) {
        cars.push({
          bi: ln.bodies ? nb++ : -1,
          lane: ln, dir,
          u0: (i + rng.range(-0.35, 0.35)) / n, speed: ln.speed * rng.range(0.85, 1.15),
          dy: rng.range(-2.5, 2.5), bob: rng.range(0, 6.28),
          paint: rng.pick([0x16181e, 0x22252c, 0x3a3f48, 0x6a707a, 0x2a1c28, 0x1c2638, 0x8e9298]),
          under: rng.chance(0.35) ? rng.pick([NEON.cyan, NEON.magenta, NEON.violet, NEON.teal, NEON.pink]) : null,
        });
      }
    }
  }
  const N = cars.length;

  // 实例化车体
  const G = carGeos();
  const M = {
    body: mat.std({ color: 0xffffff, roughness: 0.3, metalness: 0.5, wet: 0.6 }),
    glass: mat.std({ color: 0x0a0d14, roughness: 0.05, metalness: 0.6, wet: 0.3 }),
    lamps: emitMaterial(ctx, { fogK: 0.5 }),
  };
  const meshes = {};
  for (const k of Object.keys(G)) {
    const m = new THREE.InstancedMesh(G[k], M[k], nb);
    m.name = 'skycar-' + k;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.userData.noBatch = true;
    ctx.dynamicRoot.add(m);
    meshes[k] = m;
  }
  const C = new THREE.Color();
  for (const c of cars) if (c.bi >= 0) meshes.body.setColorAt(c.bi, C.set(c.paint));
  meshes.body.instanceColor.needsUpdate = true;

  // 眩光：每车 前灯 + 尾灯 + 底光（可为 0）
  const flares = new Glows(ctx, N * 3, { fogK: 0.09, minPx: 6.0, streak: 0.6, stretch: 2.6, name: 'skycar-flares', dynamic: true });

  const p = new THREE.Vector3(), t = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const fx = new THREE.Vector3(), q = new THREE.Vector3();

  ctx.onUpdate((dt, time) => {
    for (let i = 0; i < N; i++) {
      const c = cars[i], ln = c.lane;
      let u = (c.u0 + c.speed * time / ln.len) % 1;
      if (c.dir < 0) u = 1 - u;
      // 两端淡入淡出（航线端点都在画外/远处）
      const fade = Math.min(1, Math.min(u, 1 - u) / 0.025);
      if (fade <= 0.01) {
        if (c.bi >= 0) for (const k in meshes) meshes[k].setMatrixAt(c.bi, HIDE);
        for (let j = 0; j < 3; j++) { flares.setPos(i * 3 + j, 0, -500, 0); flares.setColor(i * 3 + j, 0, 0); }
        continue;
      }
      sample(ln, u, p, t);
      if (c.dir < 0) t.negate();
      side.crossVectors(t, Y).normalize();
      p.addScaledVector(side, ln.two * 1.0);            // 靠右行驶：两个方向自然分开
      p.y += c.dy + 0.35 * Math.sin(time * 1.3 + c.bob);
      up.crossVectors(side, t).normalize();
      // 车身：x = 前进方向，y = 上，z = 右侧（side）
      M4.makeBasis(t, up, side).setPosition(p);
      if (c.bi >= 0) for (const k in meshes) meshes[k].setMatrixAt(c.bi, M4);
      // 眩光
      fx.copy(p).addScaledVector(t, 2.8);
      flares.set(i * 3, fx.x, fx.y, fx.z, 0xfff0d8, 9.0 * fade, 1.7, { dir: [t.x, t.y, t.z], dirMix: 0.75 });
      fx.copy(p).addScaledVector(t, -2.8).addScaledVector(up, 0.2);
      flares.set(i * 3 + 1, fx.x, fx.y, fx.z, 0xff1a24, 6.5 * fade, 1.4, { dir: [-t.x, -t.y, -t.z], dirMix: 0.5 });
      q.copy(p).addScaledVector(up, -0.6);
      if (c.under) flares.set(i * 3 + 2, q.x, q.y, q.z, c.under, 1.6 * fade, 2.6, { dir: [t.x, t.y, t.z], dirMix: 0 });
      else flares.setColor(i * 3 + 2, 0, 0);
    }
    for (const k in meshes) meshes[k].instanceMatrix.needsUpdate = true;
    flares.commit();
  });
  return { cars: N, bodies: nb };
}
