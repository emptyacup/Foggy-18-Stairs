// characters-rig —— 低多边形分段人体 + 伞 / 手机 / 烟头 / 扁担等配件。
// 每个部件一个 InstancedMesh（衣服、皮肤、伞面颜色走 instanceColor），每帧由 pose 计算实例矩阵。
// 人物局部坐标：+Z 朝前，+Y 上，+X 为人物左侧；原点在两脚之间的地面。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASE } from '../../core/palette.js';

const UPPER_LEG = 0.45, LOWER_LEG = 0.45, TORSO = 0.52, UPPER_ARM = 0.29, FOREARM = 0.27, SHOULDER_X = 0.182;
export const HIP_H = 0.93;

function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  n.clearGroups();
  return n;
}
const merge = (list) => mergeGeometries(list.map(clean), false);
const cyl = (rt, rb, h, seg, y = -h / 2) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(0, y, 0); return g; };
const oval = (x, y, z, rx, ry, rz, ws = 6, hs = 4) => {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz); g.translate(x, y, z); return g;
};
const strip = (w, h, d, x, y, z, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateZ(rz); g.translate(x, y, z); return g;
};
const rod = (a, b, r = 0.004) => {
  const v = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(v);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 3, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(...v.add(end).multiplyScalar(0.5).toArray());
  return g;
};

// ------------------------------------------------------------ 几何
function geometries() {
  // 躯干：旋转体轮廓（外套下摆 → 腰 → 胸 → 溜肩 → 领口），压扁成椭圆截面
  const prof = [[0.0, -0.21], [0.185, -0.2], [0.17, -0.04], [0.155, 0.1], [0.175, 0.26], [0.195, 0.38], [0.2, 0.44], [0.18, 0.5], [0.12, 0.54], [0.07, 0.56], [0.0, 0.56]];
  const chest = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  chest.scale(1, 1, 0.66);
  const torso = merge([chest]);
  // 头：脖子 + 略扁的头
  const neck = cyl(0.045, 0.05, 0.09, 6, 0.045);
  const skull = new THREE.SphereGeometry(0.1, 10, 8); skull.scale(0.92, 1.12, 1.0); skull.translate(0, 0.19, 0.01);
  const nose = oval(0, 0.18, 0.107, 0.016, 0.024, 0.025, 4, 4);
  const ears = [-1, 1].map(s => oval(s * 0.09, 0.18, 0.003, 0.016, 0.028, 0.018, 4, 3));
  const head = merge([neck, skull, nose, ...ears]);
  // 眼白、瞳孔、眉毛和嘴独立实例化，随头部旋转；不靠发光材质照亮脸。
  const eyes = merge([-1, 1].map(s => oval(s * 0.036, 0.207, 0.098, 0.022, 0.009, 0.009, 4, 3)));
  const pupils = [-1, 1].map(s => oval(s * 0.036, 0.207, 0.105, 0.008, 0.008, 0.004, 4, 2));
  const brows = [-1, 1].map(s => strip(0.04, 0.006, 0.007, s * 0.036, 0.225, 0.093, s * 0.1));
  const face = merge([...pupils, ...brows]);
  const mouth = merge([strip(0.036, 0.005, 0.007, 0, 0, 0)]);
  // 衣襟紧贴椭圆躯干，领口和口袋突出数毫米即可从近处识别。
  const rAt = (y) => {
    for (let k = 1; k < prof.length; k++) if (y <= prof[k][1]) {
      const [r0, y0] = prof[k - 1], [r1, y1] = prof[k];
      return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0);
    }
    return 0;
  };
  const onChest = (x, y, off) => [x, y, 0.66 * Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x)) + off];
  // 四边形网格贴合躯干：a→b 为内缘、c→d 为外缘（自上而下），分段跟随曲率
  const chestQuad = (a, b, c, d, off, segs = 4) => {
    const pos = [], uv = [];
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs;
      const P = [lerp(a, b, t0), lerp(c, d, t0), lerp(a, b, t1), lerp(c, d, t1)].map(([x, y]) => onChest(x, y, off));
      pos.push(...P[0], ...P[2], ...P[1], ...P[1], ...P[2], ...P[3]);
      uv.push(0, t0, 0, t1, 1, t0, 1, t0, 0, t1, 1, t1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const collar = merge([-1, 1].map(s => chestQuad([s * 0.03, 0.548], [0, 0.35], [s * 0.088, 0.53], [s * 0.05, 0.36], 0.009)));
  const seams = merge([strip(0.006, 0.38, 0.008, 0, 0.14, 0.121),
    ...[-1, 1].map(s => strip(0.07, 0.008, 0.01, s * 0.111, 0.028, 0.096, s * 0.12))]);
  const pockets = merge([-1, 1].map(s => strip(0.073, 0.062, 0.008, s * 0.112, -0.006, 0.098)));
  const hairG = new THREE.SphereGeometry(0.108, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hairG.scale(0.95, 1.12, 1.05); hairG.rotateX(-0.35); hairG.translate(0, 0.205, -0.005);
  const hair = merge([hairG]);
  const longG = oval(0, 0.1, -0.075, 0.105, 0.19, 0.05, 8, 4);
  const hairLong = merge([longG]);
  // 发型外壳：前脸留空的球壳（phi=π/2 为正前方）
  const shell = (r, gap, th, sx, sy, sz, y, z) => {
    const g = new THREE.SphereGeometry(r, 10, 5, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, th);
    g.scale(sx, sy, sz); g.translate(0, y, z); return g;
  };
  const bob = merge([shell(0.118, Math.PI * 0.3, Math.PI * 0.7, 1.0, 1.1, 1.02, 0.19, -0.004)]);
  const fringeG = new THREE.SphereGeometry(0.113, 9, 3, Math.PI * 0.16, Math.PI * 0.68, Math.PI * 0.12, Math.PI * 0.2);
  fringeG.scale(0.95, 1.12, 1.06); fringeG.translate(0, 0.19, 0.008);
  const fringe = merge([fringeG]);
  const tailG = cyl(0.034, 0.012, 0.24, 6); tailG.rotateX(0.35); tailG.translate(0, 0.25, -0.13);
  const tail = merge([oval(0, 0.255, -0.112, 0.03, 0.026, 0.026, 6, 4), tailG]);
  const bun = merge([oval(0, 0.3, -0.07, 0.05, 0.045, 0.05, 8, 5)]);
  // 衣着层次：内搭 V 领、围巾、长外套下摆、裙子、背包
  const inner = merge([chestQuad([-0.045, 0.548], [-0.004, 0.36], [0.045, 0.548], [0.004, 0.36], 0.005)]);
  const scarfG = new THREE.TorusGeometry(0.072, 0.028, 4, 10); scarfG.rotateX(Math.PI / 2); scarfG.scale(1, 1, 0.82); scarfG.translate(0, 0.53, 0.004);
  const scarfEnd = strip(0.05, 0.16, 0.018, 0.035, 0.45, 0.085, 0.08);
  const scarf = merge([scarfG, scarfEnd]);
  const coatSkirtG = new THREE.CylinderGeometry(0.183, 0.25, 0.42, 10, 1, true); coatSkirtG.scale(1, 1, 0.78); coatSkirtG.translate(0, -0.4, 0);
  const coatSkirt = merge([coatSkirtG]);
  const skirtG = new THREE.CylinderGeometry(0.17, 0.25, 0.36, 10, 1, true); skirtG.scale(1, 1, 0.82); skirtG.translate(0, -0.33, 0);
  const skirt = merge([skirtG]);
  const packG = new THREE.BoxGeometry(0.25, 0.32, 0.12); packG.translate(0, 0.27, -0.185);
  const packFlap = strip(0.22, 0.1, 0.02, 0, 0.36, -0.245);
  const strapsG = [-1, 1].map(s => strip(0.03, 0.34, 0.012, s * 0.09, 0.3, 0.118));
  const backpack = merge([packG, packFlap, ...strapsG]);
  // 脸部配件：口罩、眼镜、赛博目镜（发光）
  const maskG = oval(0, 0.152, 0.08, 0.064, 0.05, 0.028, 8, 5);
  const mask = merge([maskG, ...[-1, 1].map(s => rod([s * 0.058, 0.165, 0.07], [s * 0.088, 0.19, 0.0], 0.003))]);
  const glasses = merge([...[-1, 1].map(s => strip(0.036, 0.024, 0.006, s * 0.036, 0.207, 0.112)), strip(0.014, 0.004, 0.006, 0, 0.212, 0.114),
    ...[-1, 1].map(s => strip(0.004, 0.004, 0.09, s * 0.088, 0.21, 0.065))]);
  const visorG = new THREE.CylinderGeometry(0.108, 0.108, 0.026, 12, 1, true, -Math.PI * 0.3, Math.PI * 0.6);
  visorG.translate(0, 0.207, 0.01);
  const visor = merge([visorG]);
  // 雨衣兜帽：比头大一圈的半球壳，前面敞开
  const hoodG = new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hoodG.scale(0.95, 1.1, 1.05); hoodG.rotateX(-0.4); hoodG.translate(0, 0.19, -0.02);
  const hood = merge([hoodG]);
  const brimG = new THREE.BoxGeometry(0.17, 0.016, 0.11); brimG.rotateX(0.12); brimG.translate(0, 0.262, 0.1);
  const brim = merge([brimG]);
  const thigh = merge([cyl(0.08, 0.062, UPPER_LEG, 7)]);
  const shin = merge([cyl(0.06, 0.044, LOWER_LEG - 0.03, 7)]);
  const shoe = merge([oval(0, -LOWER_LEG + 0.01, 0.046, 0.057, 0.043, 0.13, 6, 3)]);
  const sole = merge([strip(0.113, 0.017, 0.239, 0, -LOWER_LEG - 0.018, 0.042)]);
  const laces = merge([strip(0.068, 0.007, 0.008, 0, -LOWER_LEG + 0.048, 0.04),
    strip(0.065, 0.007, 0.008, 0, -LOWER_LEG + 0.045, 0.065)]);
  const ball = new THREE.SphereGeometry(0.058, 7, 5); ball.scale(1, 0.9, 1);
  const upperArm = merge([cyl(0.056, 0.048, UPPER_ARM, 7), ball]);
  const hand = oval(0, -FOREARM - 0.026, 0, 0.028, 0.038, 0.017, 6, 3);
  const fingers = Array.from({ length: 4 }, (_, k) => {
    const g = cyl(0.007, 0.005, 0.045 - Math.abs(k - 1.5) * 0.004, 3, -FOREARM - 0.065);
    g.translate((k - 1.5) * 0.014, 0, 0.003); return g;
  });
  const thumb = cyl(0.009, 0.006, 0.034, 3, 0); thumb.rotateZ(-0.48); thumb.translate(-0.033, -FOREARM - 0.032, 0.006);
  const forearm = merge([cyl(0.047, 0.04, FOREARM, 7), cyl(0.05, 0.05, 0.035, 7, -FOREARM + 0.03)]);   // 袖口
  const handG = merge([hand, ...fingers, thumb]);
  return { torso, head, eyes, face, mouth, collar, seams, pockets, hair, hairLong, hood, brim, thigh, shin, shoe, sole, laces, upperArm, forearm, hand: handG,
    bob, fringe, tail, bun, inner, scarf, coatSkirt, skirt, backpack, mask, glasses, visor };
}

// 伞：8 骨，伞面带扇形下垂（原点 = 手柄握点，伞杆沿 +Y）
function umbrellaGeo(R = 0.52, H = 0.92) {
  const ribs = 8, seg = ribs * 2;
  const pos = [0, H, 0];
  const ring = (r, y, sc) => { for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; const k = i % 2 ? sc : 1; pos.push(Math.cos(a) * r * k, y + (i % 2 ? 0.035 : 0), Math.sin(a) * r * k); } };
  ring(R * 0.5, H - 0.06, 0.98);
  ring(R, H - 0.25, 0.9);
  const idx = [];
  for (let i = 0; i < seg; i++) {
    const a = 1 + i, b = 1 + (i + 1) % seg, c = 1 + seg + i, d = 1 + seg + (i + 1) % seg;
    idx.push(0, b, a, a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return g;
}
function shaftGeo(H = 0.92) {
  const s = cyl(0.011, 0.011, H, 5, H / 2);
  const tip = cyl(0.006, 0.006, 0.08, 4, H + 0.04);
  const hook = new THREE.TorusGeometry(0.045, 0.012, 4, 8, Math.PI); hook.rotateZ(Math.PI); hook.translate(0.045, -0.02, 0);
  return merge([s, tip, hook]);
}
function umbrellaRibs(R = 0.52, H = 0.92) {
  const ribs = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const mid = [c * R * 0.5, H - 0.065, s * R * 0.5], end = [c * R, H - 0.255, s * R];
    ribs.push(rod([0, H - 0.004, 0], mid), rod(mid, end));
    if (i % 2 === 0) ribs.push(rod([0, H - 0.3, 0], mid, 0.003));
  }
  return merge(ribs);
}
// 收起的伞（拎在手里，伞尖朝下）
function closedUmbrellaGeo() {
  const body = new THREE.ConeGeometry(0.05, 0.62, 8, 1, false); body.rotateX(Math.PI); body.translate(0, -0.42, 0);
  const s = cyl(0.01, 0.01, 0.82, 4, -0.41);
  return merge([body, s]);
}

// ------------------------------------------------------------ 材质
function materials(ctx) {
  const { mat } = ctx;
  const clear = mat.std({ color: 0xc4d0d8, roughness: 0.08, metalness: 0.0, wet: 0.3, side: THREE.DoubleSide, tag: 'umbrella-clear' });
  clear.transparent = true; clear.opacity = 0.3; clear.depthWrite = false;
  return {
    cloth: mat.std({ color: 0xffffff, roughness: 0.75, wet: 0.45 }),
    clothDS: mat.std({ color: 0xffffff, roughness: 0.72, wet: 0.45, side: THREE.DoubleSide }),
    visor: mat.neon(0xffffff, 2.6),
    skin: mat.std({ color: 0xffffff, roughness: 0.7, wet: 0.2 }),
    eyes: mat.std({ color: BASE.tileWhite, roughness: 0.55, wet: 0.1 }),
    detail: mat.std({ color: BASE.glassDk, roughness: 0.8, wet: 0.2 }),
    canopy: mat.std({ color: 0xffffff, roughness: 0.3, wet: 0.6, side: THREE.DoubleSide }),
    clear,
    shaft: mat.surface('metalDk', { wet: 0.3 }),
    led: mat.neon(0x22e6ff, 3.2),
    phone: mat.neon(0xbfe0ff, 2.4),
    ember: mat.neon(0xff7a1f, 6),
    wood: mat.std({ color: 0x5a4a30, roughness: 0.6, wet: 0.5 }),
    load: mat.std({ color: 0xffffff, roughness: 0.5, wet: 0.6 }),
    stool: mat.std({ color: 0xffffff, roughness: 0.4, wet: 0.5 }),
  };
}

// ------------------------------------------------------------ Rig
// need(key, i)：第 i 个人是否会用到可选部件 key（不传 = 每人都分配）。
// 可选部件按"用到的人"紧凑分配实例，parts[key] 换成按人编号转发的视图，隐藏的实例不再占三角面预算。
const OPTIONAL = new Set(['hairLong', 'hood', 'brim', 'bob', 'fringe', 'tail', 'bun', 'inner', 'scarf', 'coatSkirt', 'skirt', 'backpack',
  'mask', 'glasses', 'visor', 'canopy', 'clear', 'shaft', 'ribs', 'led', 'closed', 'phone', 'ember', 'pole', 'load', 'stool', 'bag']);
export function makeRig(ctx, n, need = null) {
  const G = geometries();
  const M = materials(ctx);
  const root = ctx.dynamicRoot;
  const parts = {}, meshes = [];
  const add = (key, geo, material, count, color = false) => {
    const per = count / n;                       // 每人几个实例（1 或 2）
    let slot = null;
    if (need && OPTIONAL.has(key)) {
      slot = new Int32Array(n).fill(-1);
      let k = 0;
      for (let i = 0; i < n; i++) if (need(key, i)) slot[i] = k++;
      count = Math.max(1, k * per);
    }
    const m = new THREE.InstancedMesh(geo, material, count);
    m.name = 'char-' + key;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const Z = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -50, -40);
    for (let i = 0; i < count; i++) m.setMatrixAt(i, Z);
    if (color) { for (let i = 0; i < count; i++) m.setColorAt(i, new THREE.Color(1, 1, 1)); }
    root.add(m);
    meshes.push(m);
    if (!slot) { parts[key] = m; return m; }
    const at = (j) => { const s = slot[Math.floor(j / per)]; return s < 0 ? -1 : s * per + (j % per); };
    parts[key] = {
      mesh: m,
      setMatrixAt(j, mat) { const k = at(j); if (k >= 0) m.setMatrixAt(k, mat); },
      setColorAt(j, c) { const k = at(j); if (k >= 0) m.setColorAt(k, c); },
    };
    return m;
  };
  add('torso', G.torso, M.cloth, n, true);
  add('head', G.head, M.skin, n, true);
  add('eyes', G.eyes, M.eyes, n);
  add('face', G.face, M.detail, n);
  add('mouth', G.mouth, M.detail, n);
  add('collar', G.collar, M.clothDS, n, true);
  add('seams', G.seams, M.detail, n);
  add('pockets', G.pockets, M.cloth, n, true);
  add('hair', G.hair, M.cloth, n, true);
  add('hairLong', G.hairLong, M.cloth, n, true);
  add('hood', G.hood, M.cloth, n, true);
  add('brim', G.brim, M.cloth, n, true);
  add('thigh', G.thigh, M.cloth, n * 2, true);
  add('shin', G.shin, M.cloth, n * 2, true);
  add('shoe', G.shoe, M.detail, n * 2);
  add('sole', G.sole, M.detail, n * 2);
  add('laces', G.laces, M.eyes, n * 2);
  add('upperArm', G.upperArm, M.cloth, n * 2, true);
  add('forearm', G.forearm, M.cloth, n * 2, true);
  add('hand', G.hand, M.skin, n * 2, true);
  add('bob', G.bob, M.clothDS, n, true);
  add('fringe', G.fringe, M.clothDS, n, true);
  add('tail', G.tail, M.cloth, n, true);
  add('bun', G.bun, M.cloth, n, true);
  add('inner', G.inner, M.clothDS, n, true);
  add('scarf', G.scarf, M.cloth, n, true);
  add('coatSkirt', G.coatSkirt, M.clothDS, n, true);
  add('skirt', G.skirt, M.clothDS, n, true);
  add('backpack', G.backpack, M.cloth, n, true);
  add('mask', G.mask, M.cloth, n, true);
  add('glasses', G.glasses, M.detail, n);
  add('visor', G.visor, M.visor, n, true);
  const nU = n;
  add('canopy', umbrellaGeo(), M.canopy, nU, true);
  add('clear', umbrellaGeo(), M.clear, nU);
  add('shaft', shaftGeo(), M.shaft, nU);
  add('ribs', umbrellaRibs(), M.shaft, nU);
  add('led', merge([cyl(0.014, 0.014, 0.86, 6, 0.46)]), M.led, nU);
  add('closed', closedUmbrellaGeo(), M.canopy, nU, true);
  add('phone', merge([new THREE.BoxGeometry(0.075, 0.14, 0.012)]), M.phone, n);
  add('ember', merge([new THREE.SphereGeometry(0.014, 5, 4)]), M.ember, n, true);
  // 扁担 + 两头货物（棒棒）
  const pole = cyl(0.028, 0.028, 1.75, 6, 0); pole.rotateX(Math.PI / 2);
  add('pole', merge([pole]), M.wood, n);
  const bundle = new THREE.BoxGeometry(0.42, 0.36, 0.38); bundle.translate(0, -0.66, 0);
  const rope = cyl(0.008, 0.008, 0.5, 3, -0.24);
  add('load', merge([bundle, rope.clone().translate(0.1, 0, 0), rope.translate(-0.1, 0, 0)]), M.load, n * 2, true);
  // 塑料凳（坐着的人自带一个）
  const seat = cyl(0.17, 0.15, 0.04, 10, 0.43);
  const legs = [];
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const l = cyl(0.025, 0.03, 0.42, 4, 0.21); l.rotateZ(Math.cos(a) * 0.12); l.rotateX(-Math.sin(a) * 0.12); l.translate(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13); legs.push(l); }
  add('stool', merge([seat, ...legs]), M.stool, n, true);
  // 购物袋
  const bag = new THREE.BoxGeometry(0.26, 0.3, 0.1); bag.translate(0, -0.2, 0);
  add('bag', merge([bag]), M.load, n, true);

  // ---------------------------------------------------------- 姿态 → 矩阵
  const tmp = Array.from({ length: 8 }, () => new THREE.Matrix4());
  const A = new THREE.Matrix4(), B = new THREE.Matrix4(), Cm = new THREE.Matrix4();
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -50, -40);
  const col = new THREE.Color();
  // 局部变换：平移 (x,y,z) + 欧拉 (rx,ry,rz, 'YXZ')
  const T = (m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E);
    return m.compose(V.set(x, y, z), Q, S.set(1, 1, 1));
  };
  const hide = (key, i) => parts[key].setMatrixAt(i, ZERO);
  const put = (key, i, m) => parts[key].setMatrixAt(i, m);

  return {
    parts,
    setColors(i, c) {
      parts.torso.setColorAt(i, col.set(c.coat));
      parts.collar.setColorAt(i, col.set(c.coat).lerp(new THREE.Color(BASE.tileWhite), 0.22));
      parts.pockets.setColorAt(i, col.set(c.coat).multiplyScalar(0.8));
      parts.head.setColorAt(i, col.set(c.skin));
      parts.hair.setColorAt(i, col.set(c.style === 'cap' ? c.cap : c.hair));
      parts.hairLong.setColorAt(i, col.set(c.hair));
      parts.hood.setColorAt(i, col.set(c.hoodColor ?? c.coat));
      parts.brim.setColorAt(i, col.set(c.cap ?? c.hair));
      for (const k of ['bob', 'fringe', 'tail', 'bun']) parts[k].setColorAt(i, col.set(c.hair));
      parts.inner.setColorAt(i, col.set(c.inner ?? 0x9a9ea4));
      parts.scarf.setColorAt(i, col.set(c.scarf ?? 0x8a1a1e));
      parts.coatSkirt.setColorAt(i, col.set(c.coat));
      parts.skirt.setColorAt(i, col.set(c.skirt ?? c.pants));
      parts.backpack.setColorAt(i, col.set(c.pack ?? 0x22252e));
      parts.mask.setColorAt(i, col.set(c.maskColor ?? 0xb4b8be));
      parts.visor.setColorAt(i, col.set(c.visorColor ?? 0x22e6ff));
      for (const k of [0, 1]) {
        parts.thigh.setColorAt(i * 2 + k, col.set(c.pants));
        parts.shin.setColorAt(i * 2 + k, col.set(c.pants));
        parts.upperArm.setColorAt(i * 2 + k, col.set(c.coat));
        parts.forearm.setColorAt(i * 2 + k, col.set(c.sleeve ?? c.coat));
        parts.hand.setColorAt(i * 2 + k, col.set(c.skin));
      }
      parts.canopy.setColorAt(i, col.set(c.umbrella ?? 0x141418));
      parts.closed.setColorAt(i, col.set(c.umbrella ?? 0x141418));
      parts.stool.setColorAt(i, col.set(c.stool ?? 0x8a1a1e));
      parts.bag.setColorAt(i, col.set(c.bag ?? 0x9a9ea4));
      parts.load.setColorAt(i * 2, col.set(c.load ?? 0x2c3a58));
      parts.load.setColorAt(i * 2 + 1, col.set(c.load2 ?? c.load ?? 0x2c3a58));
    },
    // p: { x,y,z, ry, s(scale), hipY, lean, side(躯干侧倾), headYaw, headPitch,
    //      hip:[l,r], knee:[l,r], sh:[l,r](肩前屈), ab:[l,r](外展), el:[l,r](肘屈),
    //      umbrella:'open'|'clear'|'led'|'closed'|null, uTilt, phone, ember(0..1|null), pole, bag, stool }
    pose(i, p) {
      const R = tmp[0];
      E.set(0, p.ry, 0, 'YXZ'); Q.setFromEuler(E);
      R.compose(V.set(p.x, p.y, p.z), Q, S.setScalar(p.s ?? 1));
      // 骨盆
      const H = tmp[1].copy(R).multiply(T(A, 0, p.hipY ?? HIP_H, 0, p.lean ?? 0, p.twist ?? 0, p.side ?? 0));
      put('torso', i, H);
      put('collar', i, H); put('seams', i, H); put('pockets', i, H);
      put('head', i, tmp[2].copy(H).multiply(T(A, 0, TORSO, 0, p.headPitch ?? 0, p.headYaw ?? 0, 0)));
      put('eyes', i, tmp[2]); put('face', i, tmp[2]);
      put('mouth', i, B.copy(tmp[2]).multiply(T(A, 0, 0.147, 0.1, 0, 0, p.expression === 'smile' ? 0.12 : p.expression === 'stern' ? -0.08 : 0)));
      const st = p.style || 'short';
      if (st === 'hood') hide('hair', i); else put('hair', i, tmp[2]);
      if (st === 'long') put('hairLong', i, tmp[2]); else hide('hairLong', i);
      if (st === 'hood') put('hood', i, tmp[2]); else hide('hood', i);
      if (st === 'cap') put('brim', i, tmp[2]); else hide('brim', i);
      const hairKeys = { long: ['bob', 'fringe'], bob: ['bob', 'fringe'], short: [], ponytail: ['tail'], bun: ['bun', 'fringe'] }[st] || [];
      for (const k of ['bob', 'fringe', 'tail', 'bun']) if (hairKeys.includes(k)) put(k, i, tmp[2]); else hide(k, i);
      const acc = p.acc;
      if (acc === 'mask') put('mask', i, tmp[2]); else hide('mask', i);
      if (acc === 'glasses') put('glasses', i, tmp[2]); else hide('glasses', i);
      if (acc === 'visor') put('visor', i, tmp[2]); else hide('visor', i);
      if (p.inner) put('inner', i, H); else hide('inner', i);
      if (p.scarf) put('scarf', i, H); else hide('scarf', i);
      if (p.backpack && !p.pole) put('backpack', i, H); else hide('backpack', i);
      // 坐/蹲时大腿前抬，下摆和裙子会被腿穿透，改为隐藏
      const seated = ((p.hip?.[0] ?? 0) + (p.hip?.[1] ?? 0)) > 1.6;
      const skirtM = tmp[7].copy(R).multiply(T(A, 0, p.hipY ?? HIP_H, 0, (p.lean ?? 0) * 0.5, p.twist ?? 0, 0));
      if (!seated && (p.outfit === 'trench' || p.outfit === 'raincoat')) put('coatSkirt', i, skirtM); else hide('coatSkirt', i);
      if (!seated && p.outfit === 'skirt') put('skirt', i, skirtM); else hide('skirt', i);
      // 腿：先抵消躯干前倾，腿以骨盆位置、身体朝向为基准
      const Hl = tmp[3].copy(R).multiply(T(A, 0, p.hipY ?? HIP_H, 0, 0, 0, 0));
      for (const k of [0, 1]) {
        const s = k === 0 ? 1 : -1;
        const th = B.copy(Hl).multiply(T(A, s * 0.095, 0, 0, -(p.hip?.[k] ?? 0), 0, s * (p.legAb ?? 0.02)));
        parts.thigh.setMatrixAt(i * 2 + k, th);
        parts.shin.setMatrixAt(i * 2 + k, Cm.copy(th).multiply(T(A, 0, -UPPER_LEG, 0, p.knee?.[k] ?? 0, 0, 0)));
        for (const key of ['shoe', 'sole', 'laces']) put(key, i * 2 + k, Cm);
      }
      // 手臂（k=0 左，k=1 右）
      const hands = [];
      for (const k of [0, 1]) {
        const s = k === 0 ? 1 : -1;
        const ua = B.copy(H).multiply(T(A, s * SHOULDER_X, TORSO - 0.05, 0, -(p.sh?.[k] ?? 0), s * (p.shYaw?.[k] ?? 0), s * (0.09 + (p.ab?.[k] ?? 0))));
        parts.upperArm.setMatrixAt(i * 2 + k, ua);
        const fa = Cm.copy(ua).multiply(T(A, 0, -UPPER_ARM, 0, -(p.el?.[k] ?? 0), 0, 0));
        parts.forearm.setMatrixAt(i * 2 + k, fa);
        // 左右手拇指朝向相反，手腕/配件的原始握点保持不变。
        put('hand', i * 2 + k, tmp[7].copy(fa).multiply(T(A, 0, 0, 0, 0, k === 0 ? Math.PI : 0, 0)));
        hands.push(new THREE.Vector3(0, -FOREARM - 0.03, 0).applyMatrix4(fa));
        if (k === 0) tmp[4].copy(fa);
        else tmp[5].copy(fa);
      }
      // 伞：握在右手，伞杆竖直略后倾
      const u = p.umbrella;
      const hr = hands[1];
      const um = tmp[6];
      if (u === 'open' || u === 'clear' || u === 'led') {
        E.set(p.uTilt ?? -0.12, p.ry + (p.uSpin ?? 0), p.uRoll ?? 0.05, 'YXZ'); Q.setFromEuler(E);
        um.compose(V.set(hr.x, hr.y - 0.05 * (p.s ?? 1), hr.z), Q, S.setScalar(p.s ?? 1));
        put('shaft', i, um);
        put('ribs', i, um);
        if (u === 'open') { put('canopy', i, um); hide('clear', i); hide('led', i); }
        else if (u === 'clear') { put('clear', i, um); hide('canopy', i); hide('led', i); }
        else { put('clear', i, um); put('led', i, um); hide('canopy', i); hide('shaft', i); }
        hide('closed', i);
      } else {
        hide('canopy', i); hide('clear', i); hide('shaft', i); hide('ribs', i); hide('led', i);
        if (u === 'closed') {
          E.set(0.05, p.ry, 0.04, 'YXZ'); Q.setFromEuler(E);
          put('closed', i, um.compose(V.copy(hr), Q, S.setScalar(p.s ?? 1)));
        } else hide('closed', i);
      }
      // 手机：左手掌前
      if (p.phone) put('phone', i, tmp[7].copy(tmp[4]).multiply(T(A, 0, -FOREARM - 0.02, 0.04, -1.2, 0, 0)));
      else hide('phone', i);
      // 烟头：右手（或嘴边）
      if (p.ember != null) {
        put('ember', i, tmp[7].copy(tmp[5]).multiply(T(A, 0, -FOREARM - 0.07, 0.03)));
        parts.ember.setColorAt(i, col.setScalar(p.ember));
      } else hide('ember', i);
      // 扁担：压在右肩，前后挑着两捆货
      if (p.pole) {
        const sh = tmp[7].copy(H).multiply(T(A, -0.17, TORSO + 0.06, 0.05, p.poleTilt ?? 0, 0, 0));
        put('pole', i, sh);
        for (const k of [0, 1]) {
          const z = k === 0 ? 0.82 : -0.82;
          const lp = new THREE.Vector3(0, 0, z).applyMatrix4(sh);
          E.set(0, p.ry + (p.loadSwing ?? 0) * (k ? -1 : 1), 0, 'YXZ'); Q.setFromEuler(E);
          parts.load.setMatrixAt(i * 2 + k, B.compose(lp, Q, S.setScalar(p.s ?? 1)));
        }
      } else { hide('pole', i); parts.load.setMatrixAt(i * 2, ZERO); parts.load.setMatrixAt(i * 2 + 1, ZERO); }
      // 购物袋：左手拎着
      if (p.bag) {
        E.set(p.bagSwing ?? 0, p.ry, 0, 'YXZ'); Q.setFromEuler(E);
        put('bag', i, B.compose(hands[0], Q, S.setScalar(p.s ?? 1)));
      } else hide('bag', i);
      // 凳子
      if (p.stool) {
        E.set(0, p.ry + 0.3, 0, 'YXZ'); Q.setFromEuler(E);
        put('stool', i, B.compose(V.set(p.stool.x, p.stool.y, p.stool.z), Q, S.set(1, 1, 1)));
      } else hide('stool', i);
    },
    commit() {
      for (const m of meshes) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },
  };
}
