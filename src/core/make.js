// 常用构件工厂。模块优先用这些，而不是自己 new Mesh —— 保证风格与性能一致。
import * as THREE from 'three';

// 盒子几何：原点在底面中心；uvScale>0 时 UV 按米计（贴图每 uvScale 米重复一次）
export function boxGeo(w, h, d, uvScale = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (uvScale > 0) {
    const uv = g.attributes.uv, n = g.attributes.normal;
    // BoxGeometry 面顺序：+x -x +y -y +z -z，每面 4 顶点
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * dims[f][0] / uvScale, uv.getY(i) * dims[f][1] / uvScale);
      }
    }
    void n;
  }
  return g;
}

export class Maker {
  constructor(ctx) { this.ctx = ctx; this._uid = 0; }

  // 实心块：(x, y, z) = 底面中心；ry 绕 Y 旋转；solid=true 时登记碰撞（仅 ry 为 0/90° 时准确）
  block(w, h, d, material, { x = 0, y = 0, z = 0, ry = 0, uv = 0, solid = false, parent } = {}) {
    const m = new THREE.Mesh(boxGeo(w, h, d, uv), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    (parent || this.ctx.staticRoot).add(m);
    if (solid) {
      const swap = Math.abs(Math.sin(ry)) > 0.7;
      const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
      this.ctx.physics.addBox(x - hw, z - hd, x + hw, z + hd, y + h, y);
    }
    return m;
  }

  // 平面：中心在 (x,y,z)，默认法线 +Z，ry/rx 旋转
  quad(w, h, material, { x = 0, y = 0, z = 0, ry = 0, rx = 0, parent } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0, 'YXZ');
    (parent || this.ctx.staticRoot).add(m);
    return m;
  }

  // 霓虹招牌 / 灯箱
  // pos = 招牌顶部中心（挂点），招牌向下展开；ry = 朝向（招牌正面法线 = +Z 绕 Y 转 ry）
  // size = 单字边长（米）；double = 两面都有字（垂直于墙伸出的竖招牌）
  // flicker: 0..1 闪烁程度；broken: 某个字坏掉（0 基下标）
  neonSign({ text, pos, ry = 0, vertical = false, style = 'tube', color = 0xff2a3a, color2, size = 0.6,
             intensity = 2.2, sub = '', double = false, light = true, halo = true, flicker = 0, parent } = {}) {
    const { ctx } = this;
    const { texture, aspect } = ctx.tex.neonText(text, { vertical, style, color, color2, sub });
    const n = [...text].length;
    const h = vertical ? size * (n + 0.56) + (sub ? size * 0.4 : 0) : size * (1.56 + (sub ? 0.45 : 0));
    const w = h * aspect;
    const g = new THREE.Group();
    g.position.set(...pos);
    g.rotation.y = ry;
    const depth = double ? 0.22 : 0.12;
    const board = new THREE.Mesh(boxGeo(w + 0.08, h + 0.08, depth), ctx.mat.surface('metalDk', { wet: 0.5 }));
    board.position.y = -(h + 0.08);
    g.add(board);
    const k = style === 'box' ? intensity * 0.55 : intensity;
    const faceMat = flicker > 0
      ? ctx.mat.emissiveMap(texture, k, { uid: ++this._uid })
      : ctx.mat.emissiveMap(texture, k);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
    front.position.set(0, -h / 2 - 0.04, depth / 2 + 0.005);
    g.add(front);
    if (double) {
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
      back.position.set(0, -h / 2 - 0.04, -depth / 2 - 0.005); back.rotation.y = Math.PI;
      g.add(back);
    }
    (parent || ctx.staticRoot).add(g);
    g.updateMatrixWorld(true);

    const handles = [];
    if (light) {
      const area = Math.sqrt(w * h);
      const offs = double ? [0.7, -0.7] : [0.7];
      for (const o of offs) {
        const p = new THREE.Vector3(0, -h / 2, o).applyMatrix4(g.matrixWorld);
        handles.push(ctx.lights.add({ position: p, color, intensity: 1.2 * area * (style === 'box' ? 0.7 : 1), radius: 5 + area * 3.5 }));
      }
    }
    let haloH = null;
    if (halo) {
      const p = new THREE.Vector3(0, -h / 2, double ? 0 : 0.3).applyMatrix4(g.matrixWorld);
      haloH = ctx.halos.add({ position: p, color, size: Math.min(5, Math.max(w, h) * 1.4), intensity: 0.22 });
    }
    if (flicker > 0) {
      const rng = ctx.rng('flicker' + this._uid);
      const base = faceMat.color.clone();
      const seed = rng.range(0, 100);
      ctx.onUpdate((dt, t) => {
        const s = Math.sin(t * 13.1 + seed) + Math.sin(t * 31.7 + seed * 2.1) + Math.sin(t * 2.3 + seed);
        const off = s > 2.4 - flicker * 1.2 ? 0.08 : 1;
        faceMat.color.copy(base).multiplyScalar(off);
        for (const h of handles) h.intensity = h._base * off;
        if (haloH) haloH.intensity = 0.22 * off;
      });
      for (const h of handles) h._base = h.intensity;
    }
    return { group: g, width: w, height: h, lights: handles, halo: haloH };
  }

  // 体积光锥：从 pos 沿 dir 照射。所有光锥共用一个材质（颜色写在顶点色里）→ 可合批
  lightCone({ pos, dir = [0, -1, 0], length = 5, radius = 1.6, color = 0xffd9a0, intensity = 0.35, parent } = {}) {
    const { ctx } = this;
    const g = new THREE.ConeGeometry(radius, length, 20, 1, true);
    g.translate(0, -length / 2, 0);       // 尖端在原点，向 -Y 张开
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // 用 uv.y 存“沿光锥的进度”：0 = 尖端
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < n; i++) uv.setY(i, -p.getY(i) / length);
    const m = new THREE.Mesh(g, coneMaterial(ctx));
    m.position.set(...pos);
    const d = new THREE.Vector3(...dir).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
    (parent || ctx.staticRoot).add(m);
    return m;
  }
}

let _coneMat = null;
function coneMaterial(ctx) {
  if (_coneMat) return _coneMat;
  _coneMat = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.shared.uTime },
    vertexShader: /* glsl */`
      varying vec3 vCol; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        vCol = color; vT = uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float t = clamp(vT, 0.0, 1.0);
        float along = pow(1.0 - t, 1.4) * smoothstep(0.0, 0.08, t);
        gl_FragColor = vec4(vCol * edge * along, 1.0);
      }`,
    vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  return _coneMat;
}
export function _resetMakeCache() { _coneMat = null; }
