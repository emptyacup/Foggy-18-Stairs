// 楼体几何累加器：所有零件先变换到世界坐标，按材质分桶，最后每栋楼每种材质合成一个 Mesh。
// 这样几千个小构件（窗框、窗台、空调…）不会变成几千个 Mesh，合批器也省事。
// 支持"世界坐标 UV"：墙面类材质按米投影贴图，相邻构件的贴图自然连续。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const BOX = new Map();
function unitBox() {   // 底面中心原点的单位盒（每次 clone）
  if (!BOX.has('b')) { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); BOX.set('b', g); }
  return BOX.get('b');
}

export class Builder {
  constructor(ctx) {
    this.ctx = ctx;
    this.buckets = new Map();   // material → geometry[]
    this.uvScale = new Map();   // material → 米/重复（0 = 保留原 UV）
  }
  worldUV(mat, meters) { this.uvScale.set(mat, meters); return mat; }

  // geo 会被就地变换（调用方传入新建或 clone 的几何）
  add(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    geo.applyMatrix4(_m);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.index) {
      const n = geo.attributes.position.count, idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    const s = this.uvScale.get(mat);
    if (s) this._worldUV(geo, s);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(geo);
    return geo;
  }

  // 盒子：(x,y,z) = 底面中心；尺寸 w(本地X) h d(本地Z)
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    const g = unitBox().clone();
    return this.add(g, mat, x, y, z, ry, rx, rz, w, h, d);
  }
  // 平面：中心定位，法线 +Z
  quad(mat, w, h, x, y, z, ry = 0, rx = 0, geo) {
    const g = geo || new THREE.PlaneGeometry(1, 1);
    return this.add(g, mat, x, y, z, ry, rx, 0, w, h, 1);
  }
  cyl(mat, r, h, x, y, z, seg = 10, ry = 0, rx = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(1, 1, 1, seg, 1);
    g.translate(0, 0.5, 0);
    return this.add(g, mat, x, y, z, ry, rx, rz, r, h, r);
  }
  // 圆锥（伞面等）：(x,y,z) = 底面中心，开口朝下
  cone(mat, r, h, x, y, z, seg = 8, ry = 0) {
    const g = new THREE.ConeGeometry(1, 1, seg, 1, true);
    g.translate(0, 0.5, 0);
    return this.add(g, mat, x, y, z, ry, 0, 0, r, h, r);
  }
  // 细杆：从 a 到 b（世界坐标），截面 s×s
  seg(mat, a, b, s = 0.025) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 1e-3) return null;
    const g = new THREE.BoxGeometry(1, 1, 1);
    return this.add(g, mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2,
      Math.atan2(dx, dz), -Math.asin(dy / L), 0, s, s, L);
  }

  _worldUV(geo, S) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay > ax && ay > az) { u = p.getX(i); v = p.getZ(i); }
      else if (ax > az) { u = p.getZ(i) * Math.sign(n.getX(i) || 1) * -1; v = p.getY(i); }
      else { u = p.getX(i) * Math.sign(n.getZ(i) || 1); v = p.getY(i); }
      uv.setXY(i, u / S, v / S);
    }
  }

  // 合并输出到 root（默认 staticRoot）。返回三角面数
  flush(root = this.ctx.staticRoot, name = 'tower') {
    let tris = 0;
    for (const [mat, geos] of this.buckets) {
      if (!geos.length) continue;
      const g = mergeGeometries(geos, false);
      if (!g) throw new Error('tower: mergeGeometries failed');
      g.computeBoundingBox(); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      root.add(mesh);
      tris += g.index.count / 3;
    }
    this.buckets.clear();
    return tris;
  }
}

// 立面坐标系：u 沿立面（tangent），y 绝对高度，o 向外（normal）。
// 盒子在立面局部空间里摆放：宽 w 沿 u，深 d 沿 o，(u, y, o) = 底面中心。
export class FaceFrame {
  constructor(B, origin, ry) {
    this.B = B; this.origin = origin; this.ry = ry;
    this.t = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    this.n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  }
  P(u, y, o, out = new THREE.Vector3()) {
    return out.copy(this.origin).addScaledVector(this.t, u).addScaledVector(this.n, o).setY(y);
  }
  box(mat, u, y, o, w, h, d, rx = 0, rz = 0) {
    const p = this.P(u, y, o, _v);
    return this.B.box(mat, w, h, d, p.x, p.y, p.z, this.ry, rx, rz);
  }
  quad(mat, u, y, o, w, h, geo, rx = 0) {   // (u,y,o) = 中心
    const p = this.P(u, y, o, _v);
    return this.B.quad(mat, w, h, p.x, p.y, p.z, this.ry, rx, geo);
  }
  cyl(mat, u, y, o, r, h, seg = 10, rx = 0, rz = 0) {
    const p = this.P(u, y, o, _v);
    return this.B.cyl(mat, r, h, p.x, p.y, p.z, seg, this.ry, rx, rz);
  }
}
const _v = new THREE.Vector3();
