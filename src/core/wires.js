// 架空电线：悬链线 → 细管，全部合并成一个网格。山城街巷的灵魂之一。
import * as THREE from 'three';

export class Wires {
  constructor(mat, getModule = () => null) { this.mat = mat; this.getModule = getModule; this.list = []; this.mesh = null; }

  // a, b: [x,y,z] 或 Vector3；sag: 中点下垂（米）；r: 半径；color: 线色（默认近黑）
  add(a, b, { sag = 0.8, r = 0.014, color = 0x15161a } = {}) {
    const A = a.isVector3 ? a.clone() : new THREE.Vector3(...a);
    const B = b.isVector3 ? b.clone() : new THREE.Vector3(...b);
    this.list.push({ A, B, sag, r, color: new THREE.Color(color), module: this.getModule() });
  }

  // 某模块登记的电线将生成的三角面数（check.mjs 记账用）
  trisOf(module) {
    let n = 0;
    for (const w of this.list) if (w.module === module) n += this._seg(w) * 4 * 2;
    return n;
  }
  _seg(w) { return Math.max(4, Math.min(14, Math.ceil(w.A.distanceTo(w.B) / 1.5))); }

  build() {
    if (!this.list.length) return null;
    const pos = [], nor = [], idx = [], col = [];
    const SEG = 14, SIDES = 4;
    const t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(), s2 = new THREE.Vector3();
    for (const w of this.list) {
      const pts = [];
      const len = w.A.distanceTo(w.B);
      const seg = Math.max(4, Math.min(SEG, Math.ceil(len / 1.5)));
      for (let i = 0; i <= seg; i++) {
        const k = i / seg;
        const p = w.A.clone().lerp(w.B, k);
        p.y -= w.sag * 4 * k * (1 - k);
        pts.push(p);
      }
      const base = pos.length / 3;
      for (let i = 0; i <= seg; i++) {
        const p = pts[i];
        t.subVectors(pts[Math.min(seg, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        s1.crossVectors(t, up); if (s1.lengthSq() < 1e-4) s1.set(1, 0, 0); s1.normalize();
        s2.crossVectors(t, s1).normalize();
        for (let j = 0; j < SIDES; j++) {
          const a = (j / SIDES) * Math.PI * 2;
          const nx = s1.x * Math.cos(a) + s2.x * Math.sin(a);
          const ny = s1.y * Math.cos(a) + s2.y * Math.sin(a);
          const nz = s1.z * Math.cos(a) + s2.z * Math.sin(a);
          pos.push(p.x + nx * w.r, p.y + ny * w.r, p.z + nz * w.r);
          nor.push(nx, ny, nz);
          col.push(w.color.r, w.color.g, w.color.b);
        }
      }
      for (let i = 0; i < seg; i++) {
        for (let j = 0; j < SIDES; j++) {
          const a = base + i * SIDES + j, b = base + i * SIDES + (j + 1) % SIDES;
          const c = a + SIDES, d = b + SIDES;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.mat.std({ color: 0xffffff, vertexColors: true, roughness: 0.35, wet: 0 }));
    this.mesh.name = 'wires';
    return this.mesh;
  }
}
