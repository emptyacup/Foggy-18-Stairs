// hologram 几何小工具：参数网格、椭圆截面放样、沿折线的平滑管道、合并（带 aKind）。
// 所有几何统一带属性：position, normal, aAux(vec4), aS(float), aKind(float)，便于 mergeGeometries。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// rows × cols 网格。fn(i, j) → { p:[x,y,z], n?:[x,y,z], aux?:[4], s?:number }
export function gridGeo(rows, cols, fn, { wrap = false, flip = false } = {}) {
  const pos = [], nrm = [], aux = [], ss = [], idx = [];
  let hasN = true;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const v = fn(i, j);
      pos.push(...v.p);
      if (v.n) nrm.push(...v.n); else { hasN = false; nrm.push(0, 1, 0); }
      aux.push(...(v.aux || [0, 0, 0, 0]));
      ss.push(v.s ?? 0);
    }
  }
  const cw = wrap ? cols : cols - 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cw; j++) {
      const j1 = (j + 1) % cols;
      const a = i * cols + j, b = i * cols + j1, c = (i + 1) * cols + j, d = (i + 1) * cols + j1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aAux', new THREE.Float32BufferAttribute(aux, 4));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1));
  g.setIndex(idx);
  if (!hasN) g.computeVertexNormals();
  return g;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// 关键帧数组（每项为数字数组）按 sub 细分做 Catmull-Rom 插值
export function smoothKeys(keys, sub) {
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      out.push(k1.map((_, c) => catmull(k0[c], k1[c], k2[c], k3[c], t)));
    }
  }
  out.push(keys[keys.length - 1].slice());
  return out;
}

// 沿 +Z 的椭圆截面放样。keys: [z, 半宽 w, 半高 h, 中心 y]；auxFn(t, a, row) 可选
export function loftZ(keys, { radial = 16, sub = 4, aux } = {}) {
  const rows = smoothKeys(keys, sub);
  return gridGeo(rows.length, radial + 1, (i, j) => {
    const [z, w, h, yc] = rows[i];
    const a = (j / radial) * Math.PI * 2;
    const t = i / (rows.length - 1);
    return { p: [Math.max(0, w) * Math.cos(a), yc + Math.max(0, h) * Math.sin(a), z], aux: aux ? aux(t, a, z) : [t, a, 0, 0] };
  }, { flip: true });
}

// 平滑管道：points（[x,y,z] 数组）经 Catmull-Rom 细分，radii 与 points 对应；平行移动标架
export function tube(points, radii, { radial = 8, sub = 6, aux } = {}) {
  const keys = points.map((p, i) => [...p, radii[i]]);
  const rows = smoothKeys(keys, sub);
  const P = rows.map(r => new THREE.Vector3(r[0], r[1], r[2]));
  const T = P.map((p, i) => new THREE.Vector3().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
  const N = [];
  let n0 = new THREE.Vector3(0, 1, 0);
  if (Math.abs(n0.dot(T[0])) > 0.9) n0.set(1, 0, 0);
  n0.sub(T[0].clone().multiplyScalar(n0.dot(T[0]))).normalize();
  N.push(n0);
  for (let i = 1; i < P.length; i++) {
    const n = N[i - 1].clone();
    n.sub(T[i].clone().multiplyScalar(n.dot(T[i]))).normalize();
    N.push(n);
  }
  return gridGeo(rows.length, radial + 1, (i, j) => {
    const a = (j / radial) * Math.PI * 2;
    const B = new THREE.Vector3().crossVectors(T[i], N[i]);
    const d = N[i].clone().multiplyScalar(Math.cos(a)).add(B.multiplyScalar(Math.sin(a)));
    const r = rows[i][3];
    const t = i / (rows.length - 1);
    return { p: [P[i].x + d.x * r, P[i].y + d.y * r, P[i].z + d.z * r], n: [d.x, d.y, d.z], aux: aux ? aux(t, a) : [t, a, 0, 0] };
  }, { flip: true });
}

// 双面带状面：沿 points 的中心线，宽度方向 across（单位向量或函数）。返回两份绕序
export function ribbon(points, widths, across, { sub = 4, aux } = {}) {
  const keys = points.map((p, i) => [...p, widths[i]]);
  const rows = smoothKeys(keys, sub);
  const acr = typeof across === 'function' ? across : () => across;
  const mk = (flip) => gridGeo(rows.length, 3, (i, j) => {
    const [x, y, z, w] = rows[i];
    const t = i / (rows.length - 1);
    const c = acr(t);
    const u = j - 1;
    return { p: [x + c[0] * w * u, y + c[1] * w * u, z + c[2] * w * u], aux: aux ? aux(t, u) : [t, u, 0, 0] };
  }, { flip });
  return [mk(false), mk(true)];
}

export function setConst(g, name, value) {
  const n = g.attributes.position.count;
  g.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n).fill(value), 1));
  return g;
}

// [{geo, kind, s?}] → 合并后的几何（aKind 写入；s 给定时覆盖 aS）
export function mergeParts(parts) {
  const geos = parts.map(({ geo, kind, s }) => {
    setConst(geo, 'aKind', kind);
    if (s != null) setConst(geo, 'aS', s);
    return geo;
  });
  return mergeGeometries(geos, false);
}
