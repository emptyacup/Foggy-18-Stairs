// props/kit —— 道具"套件"：每种道具由若干零件组成，按材质合并成一份几何，
// 所有摆放实例最后一次性变成 InstancedMesh（每种道具 × 每种材质 = 1 个 draw call）。
// tint 材质（白底）的实例可以单独上色（instanceColor），用于凳子、筐、车壳等色彩变化。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// 统一几何：非索引、只保留 position/normal/uv
function clean(g) {
  let out = g.index ? g.toNonIndexed() : g;
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  out.clearGroups();
  out.morphAttributes = {};
  return out;
}

export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.types = new Map();
    this.tints = new Set();
  }

  // 声明一个材质为"可着色"（材质本身应为白色）
  tintable(m) { this.tints.add(m); return m; }

  // parts: [{ g: BufferGeometry, m: Material }]
  define(name, parts, { tint = 0xffffff } = {}) {
    const byMat = new Map();
    for (const p of parts) {
      if (!byMat.has(p.m)) byMat.set(p.m, []);
      byMat.get(p.m).push(clean(p.g));
    }
    const list = [];
    for (const [m, gs] of byMat) {
      const g = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
      if (!g) throw new Error('props kit: merge failed for ' + name);
      list.push({ m, g, tris: g.attributes.position.count / 3 });
    }
    this.types.set(name, { name, list, tint: new THREE.Color(tint), inst: [] });
  }

  has(name) { return this.types.has(name); }

  // 摆放：(x,y,z) = 道具原点（底面中心）；ry 朝向；rx/rz 倾斜（先滚转/俯仰，再偏航）；s 缩放（数或 [sx,sy,sz]）
  place(name, x, y, z, ry = 0, { rx = 0, rz = 0, s = 1, color } = {}) {
    const T = this.types.get(name);
    if (!T) throw new Error('props kit: unknown type ' + name);
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    T.inst.push({ m: _m.clone(), c: color !== undefined ? new THREE.Color(color) : T.tint });
  }

  tris() {
    let n = 0;
    for (const T of this.types.values()) for (const p of T.list) n += p.tris * T.inst.length;
    return n;
  }

  build(root) {
    const out = [];
    for (const T of this.types.values()) {
      const n = T.inst.length;
      if (!n) continue;
      for (const p of T.list) {
        const mesh = new THREE.InstancedMesh(p.g, p.m, n);
        mesh.name = 'props:' + T.name;
        const tinted = this.tints.has(p.m);
        for (let i = 0; i < n; i++) {
          mesh.setMatrixAt(i, T.inst[i].m);
          if (tinted) mesh.setColorAt(i, T.inst[i].c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox?.();
        root.add(mesh);
        out.push(mesh);
      }
    }
    return out;
  }
}

// ------------------------------------------------------------ 几何工具（全部"底面中心为原点"或两点间杆件）
export function xf(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}
export function box(w, h, d, o) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return xf(g, o);
}
export function cyl(rt, rb, h, seg = 10, o, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(0, h / 2, 0);
  return xf(g, o);
}
export function sphere(r, ws = 8, hs = 6, o) {
  return xf(new THREE.SphereGeometry(r, ws, hs), o);
}
export function blob(r, detail = 0, o) {
  return xf(new THREE.IcosahedronGeometry(r, detail), o);
}
const _up = new THREE.Vector3(0, 1, 0);
// 两点之间的杆（圆柱）
export function rod(a, b, r = 0.02, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  _q.setFromUnitVectors(_up, d.normalize());
  _m.compose(A.add(B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}
// 侧面轮廓挤出：pts 为 (z, y) 轮廓点，沿 X 方向挤出 width（居中）
export function profile(pts, width, { bevel = 0.012 } = {}) {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  sh.closePath();
  const d = Math.max(0.001, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  g.rotateY(-Math.PI / 2);   // 形状 x → 世界 z，挤出方向 → 世界 x
  return g;
}
// 参数化曲面：fn(u, v) → [x, y, z]，u,v ∈ [0,1]
export function sheet(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    pos.push(...fn(u, v)); uv.push(u, v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 伞面：apex 高 h，边缘半径 r、高 0；seg 片；parity=0/1 只取偶/奇数片（做条纹），-1 全取
export function fan(r, h, seg, parity = -1, droop = 0.08) {
  const pos = [];
  for (let i = 0; i < seg; i++) {
    if (parity >= 0 && i % 2 !== parity) continue;
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const rm = r * 0.55;
    const P0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], P1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
    const M = [Math.cos(am) * rm, h * 0.45 - droop, Math.sin(am) * rm];   // 伞骨之间下凹
    const A = [0, h, 0];
    const Q0 = [Math.cos(a0) * rm * 1.02, h * 0.45, Math.sin(a0) * rm * 1.02];
    const Q1 = [Math.cos(a1) * rm * 1.02, h * 0.45, Math.sin(a1) * rm * 1.02];
    pos.push(...A, ...Q1, ...M, ...A, ...M, ...Q0, ...Q0, ...M, ...P0, ...M, ...P1, ...P0, ...M, ...Q1, ...P1);
    // 垂边
    const v = 0.1;
    pos.push(...P0, ...P1, P1[0], -v, P1[2], ...P0, P1[0], -v, P1[2], P0[0], -v, P0[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
