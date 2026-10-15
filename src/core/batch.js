// 静态合批：构建结束后，把 staticRoot 下所有普通 Mesh 按材质合并 → draw call 从几千降到几十。
// 不参与合批：InstancedMesh、Sprite、userData.noBatch、普通混合的透明物体（需要排序）。
// 颜色折叠（传入 { mat } 时启用）：只是颜色不同的无贴图材质合并成一个共享材质，颜色烘进顶点色。
//   仅折叠材质库缓存里的共享材质；带 uid 的独立材质（运行时会改颜色做闪烁/动画）不折叠。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function normalizeGeo(src, matrix, needColor, fill = null) {
  let g = src.clone();
  g.applyMatrix4(matrix);
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (fill) {                                   // 颜色折叠：用原材质颜色填满顶点色（覆盖原有）
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = fill.r; c[i * 3 + 1] = fill.g; c[i * 3 + 2] = fill.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  } else if (needColor && !g.attributes.color) {
    const c = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  } else if (needColor && g.attributes.color.itemSize !== 3) {
    g.deleteAttribute('color');
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  for (const k of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    else if (k === 'color' && !needColor) g.deleteAttribute(k);
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

// 返回 [共享材质, 颜色] 或 null（不可折叠）
function collapsible(m, lib, keyOf) {
  if (!lib || !m.userData?.ctxMat || m.userData.custom || m.vertexColors) return null;
  const key = keyOf.get(m);
  if (key == null || key.includes('"uid"')) return null;           // 非缓存材质 / 独立材质：可能被动画修改
  if (m.map || m.emissiveMap || m.alphaMap || m.normalMap || m.roughnessMap || m.aoMap || m.lightMap) return null;
  if (m.isMeshStandardMaterial) {
    if (m.transparent) return null;
    return [lib.std({
      color: 0xffffff, vertexColors: true, roughness: m.roughness, metalness: m.metalness,
      wet: m.userData.uWet?.value ?? 1, side: m.side, flat: m.flatShading, alphaTest: m.alphaTest,
      emissive: m.emissive.getHex(), emissiveIntensity: m.emissiveIntensity,
    }), m.color];
  }
  if (m.isMeshBasicMaterial) {
    if (m.blending === THREE.AdditiveBlending) return [lib.glow(0xffffff, 1, { vertexColors: true, side: m.side }), m.color];
    if (m.transparent || !m.fog) return null;
    return [lib.neon(0xffffff, 1, { vertexColors: true, side: m.side }), m.color];
  }
  return null;
}

// 空间分格：同材质的网格再按 XZ 格子分组，合并后的大网格仍能被视锥剔除（镜头背后/画面外的楼不画）
const CELL = 48;
const _box = new THREE.Box3(), _c = new THREE.Vector3();
function cellOf(o) {
  const g = o.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  _box.copy(g.boundingBox).applyMatrix4(o.matrixWorld).getCenter(_c);
  const size = _box.getSize(new THREE.Vector3());
  if (Math.max(size.x, size.z) > CELL * 2) return 'big';      // 本身就很大的（地面、江、长梁）单独一组
  return Math.floor(_c.x / CELL) + ',' + Math.floor(_c.z / CELL);
}

export function batchStatic(root, { mat: lib = null, cell = false } = {}) {
  root.updateMatrixWorld(true);
  const keyOf = new Map();
  if (lib) for (const [k, v] of lib.cache) keyOf.set(v, k);
  const fills = new Map();      // mesh → 折叠颜色
  const groups = new Map();
  const keep = [];
  let before = 0;
  root.traverse(o => {
    if (o === root) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.userData.noBatch && !Array.isArray(o.material)) {
      const m = o.material;
      const sortNeeded = m.transparent && m.blending !== THREE.AdditiveBlending;
      if (!sortNeeded) {
        before++;
        const c = collapsible(m, lib, keyOf);
        const target = c ? c[0] : m;
        if (c) fills.set(o, c[1]);
        const gk = cell ? target.uuid + '|' + cellOf(o) : target.uuid;
        if (!groups.has(gk)) groups.set(gk, { m: target, list: [] });
        groups.get(gk).list.push(o);
        return;
      }
    }
    if (o.isMesh || o.isSprite || o.isPoints || o.isLine) keep.push(o);
  });

  const merged = [];
  for (const { m, list: meshes } of groups.values()) {
    const needColor = !!m.vertexColors;
    const geos = meshes.map(o => normalizeGeo(o.geometry, o.matrixWorld, needColor, fills.get(o) || null));
    // 单次合并上限，避免巨型缓冲
    const CH = 400000;
    let cur = [], cnt = 0;
    const flush = () => {
      if (!cur.length) return;
      const g = mergeGeometries(cur, false);
      if (!g) throw new Error('mergeGeometries failed for material ' + (m.name || m.type));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, m);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = meshes[0].renderOrder;
      merged.push(mesh);
      cur = []; cnt = 0;
    };
    for (const g of geos) {
      cur.push(g); cnt += g.attributes.position.count;
      if (cnt > CH) flush();
    }
    flush();
  }

  // 保留不合批对象（带世界变换搬到根下）
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const mw = o.matrixWorld.clone();
    o.parent && o.parent.remove(o);
    mw.decompose(o.position, o.quaternion, o.scale);
  }
  root.clear();
  for (const m of merged) root.add(m);
  for (const o of keep) root.add(o);
  return { meshesBefore: before, drawsAfter: merged.length, kept: keep.length, collapsed: fills.size };
}
