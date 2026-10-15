// aircraft-fx —— 飞行器模块共用的 shader 与几何工具。
// 远处的飞行器（母舰 300–1100 m、飞艇 300 m）若用 ctx.mat.std 会被场景 FogExp2(0.012) 完全吞掉，
// 所以这里自带一套"远景机体" shader：自己算雾（密度乘系数 fogK）、城市底光、面板缝、舷窗。
// 移动的发光体（航灯、车灯、警灯）用实例化 billboard（核心 halos 只支持静态位置）。
import * as THREE from 'three';

// 色值 → 线性颜色缓存：热路径里每帧大量 Color.set(hex) 会反复做 sRGB→线性转换（性能整合时加）
const _colorCache = new Map();
function cachedColor(hex) {
  let c = _colorCache.get(hex);
  if (!c) { c = new THREE.Color(hex); _colorCache.set(hex, c); }
  return c;
}
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------ 雾
export function fogUniforms(ctx, fogK) {
  const f = ctx.scene.fog;
  return {
    uFogColor: { value: f ? f.color : new THREE.Color(0x252036) },
    uFogDensity: { value: f ? f.density : 0.012 },
    uFogK: { value: fogK },
  };
}
const FOG_GLSL = /* glsl */`
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogK;
float fogAmt(float d){ float fd = uFogDensity * uFogK * d; return 1.0 - exp(-fd * fd); }
float fogLin(float d){ return exp(-d * uFogDensity * uFogK); }
`;
const NOISE_GLSL = /* glsl */`
float acH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float acH3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float acN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(acH(i), acH(i + vec2(1, 0)), f.x), mix(acH(i + vec2(0, 1)), acH(i + vec2(1, 1)), f.x), f.y); }
float acFbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * acN(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

// ------------------------------------------------------------ 远景机体材质
// 顶点色 = 基础反照率；instanceColor（若有）再乘一次。
// 光照：天空半球（上冷紫）+ 城市底光（下暖品红，母舰腹部的主光）+ 掠射边缘光；
// 面板：以机体局部坐标做三平面网格 → 面板色差 + 暗缝；舷窗：侧面小格随机点亮。
// o: { fogK, panel(面板尺寸 m), windows(点亮率), under(底光强度), winColor, seamDark }
export function hullMaterial(ctx, o = {}) {
  const u = {
    ...fogUniforms(ctx, o.fogK ?? 0.1),
    uTime: ctx.shared.uTime,
    uPanel: { value: o.panel ?? 9.0 },
    uWin: { value: o.windows ?? 0.05 },
    uWinCol: { value: new THREE.Color(o.winColor ?? 0xffc27a) },
    uUnder: { value: new THREE.Color(o.underColor ?? 0xb04a6a).multiplyScalar(o.under ?? 1.0) },
    uSky: { value: new THREE.Color(o.skyColor ?? 0x3a3560).multiplyScalar(o.sky ?? 1.0) },
    uSeam: { value: o.seamDark ?? 0.55 },
    uSpec: { value: o.spec ?? 0.35 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexColors: true,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vL; varying vec3 vN; varying vec3 vLN; varying vec3 vC;
      void main(){
        vec4 lp = vec4(position, 1.0);
        vec3 ln = normal;
        vec3 c = color;
      #ifdef USE_INSTANCING
        lp = instanceMatrix * lp;
        ln = mat3(instanceMatrix) * ln;
      #endif
      #ifdef USE_INSTANCING_COLOR
        c *= instanceColor;
      #endif
        vL = lp.xyz; vLN = normalize(ln); vC = c;
        vec4 wp = modelMatrix * lp;
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * ln);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec3 vL; varying vec3 vN; varying vec3 vLN; varying vec3 vC;
      uniform float uTime, uPanel, uWin, uSeam, uSpec;
      uniform vec3 uWinCol, uUnder, uSky;
      ${FOG_GLSL}
      ${NOISE_GLSL}
      void main(){
        vec3 N = normalize(vN);
        vec3 an = abs(normalize(vLN));
        // 三平面：取主轴投影面
        vec2 q = an.x > an.y && an.x > an.z ? vL.zy : (an.y > an.z ? vL.xz : vL.xy);
        // 两级面板：大板 + 小板，带随机色差和暗缝
        vec2 g1 = q / uPanel;
        vec2 c1 = floor(g1), f1 = fract(g1);
        vec2 g2 = q / (uPanel * 0.37) + acH(c1) * 3.0;
        vec2 c2 = floor(g2), f2 = fract(g2);
        float seam1 = min(min(f1.x, 1.0 - f1.x), min(f1.y, 1.0 - f1.y)) * uPanel;
        float seam2 = min(min(f2.x, 1.0 - f2.x), min(f2.y, 1.0 - f2.y)) * uPanel * 0.37;
        float seam = smoothstep(0.12, 0.45, seam1) * mix(0.82, 1.0, smoothstep(0.05, 0.22, seam2));
        float tone = 0.8 + 0.32 * acH(c1 + 7.3) + 0.14 * (acH(c2) - 0.5);
        vec3 alb = vC * tone * mix(uSeam, 1.0, seam);
        // 光照
        float up = N.y * 0.5 + 0.5;
        float dn = clamp(-N.y, 0.0, 1.0), upw = clamp(N.y, 0.0, 1.0);
        vec3 amb = uSky * (0.22 + 0.78 * upw) + uUnder * (pow(dn, 1.5) + 0.07);
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 4.0);
        vec3 col = alb * amb + uSky * fres * 0.6 * uSpec + uUnder * fres * 0.4 * uSpec * (1.0 - up);
        // 舷窗：侧面（法线水平）小格随机点亮
        float side = 1.0 - an.y;
        if (uWin > 0.0 && side > 0.6) {
          vec2 wg = vec2(an.x > an.z ? vL.z : vL.x, vL.y) / vec2(2.2, 2.6);
          vec2 wc = floor(wg), wf = fract(wg);
          float box = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.3, wf.y) * step(wf.y, 0.7);
          float bandOn = step(0.45, acH(vec2(wc.y * 0.13, floor(wc.x / 9.0))));   // 成段亮灭，不是满墙均匀
          float lit = step(acH(wc + 31.7), uWin * 3.0) * bandOn * seam;
          col += uWinCol * box * lit * (0.6 + 1.4 * acH(wc + 3.1)) * 1.6;
        }
        float d = length(vW - cameraPosition);
        col = mix(col, uFogColor, fogAmt(d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return ctx.mat.custom(m);
}

// ------------------------------------------------------------ 远景自发光（顶点色 HDR）
export function emitMaterial(ctx, o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms(ctx, o.fogK ?? 0.08), uTime: ctx.shared.uTime, uGain: { value: o.gain ?? 1 } },
    vertexColors: true,
    vertexShader: /* glsl */`
      varying vec3 vC; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec4 lp = vec4(position, 1.0);
        vec3 c = color;
      #ifdef USE_INSTANCING
        lp = instanceMatrix * lp;
      #endif
      #ifdef USE_INSTANCING_COLOR
        c *= instanceColor;
      #endif
        vC = c; vUv = uv;
        vec4 wp = modelMatrix * lp; vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying vec3 vW; varying vec2 vUv;
      uniform float uGain;
      ${FOG_GLSL}
      void main(){
        float d = length(vW - cameraPosition);
        vec3 col = mix(vC * uGain, uFogColor, fogAmt(d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return ctx.mat.custom(m);
}

// ------------------------------------------------------------ 发光精灵：实例化 billboard
// 支持：父节点变换（跟随母舰浮动）、闪烁（由 uTime 决定）、方向性（车灯朝向）、最小像素尺寸（远处不消失）
// items: [{ pos:[x,y,z], color, intensity, size, blink:[period, phase, duty], dir:[x,y,z], dirMix }]
export class Glows {
  constructor(ctx, n, { parent, fogK = 0.12, minPx = 2.2, streak = 0.0, stretch = 1.0, name = 'glows', dynamic = false } = {}) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCol = new Float32Array(n * 3);
    this.aSize = new Float32Array(n);
    this.aBlink = new Float32Array(n * 3);
    this.aDir = new Float32Array(n * 4);
    const use = dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage;
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(this.aCol, 3).setUsage(use));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.aSize, 1).setUsage(use));
    geo.setAttribute('aBlink', new THREE.InstancedBufferAttribute(this.aBlink, 3).setUsage(use));
    geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(this.aDir, 4).setUsage(use));
    this.uniforms = {
      ...fogUniforms(ctx, fogK), uTime: ctx.shared.uTime,
      uMinPx: { value: minPx }, uViewH: { value: 720 }, uStreak: { value: streak }, uStretch: { value: stretch },
    };
    const m = ctx.mat.custom(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec3 aCol; attribute float aSize; attribute vec3 aBlink; attribute vec4 aDir;
        varying vec2 vUv; varying vec3 vCol;
        uniform float uTime, uMinPx, uViewH, uFogDensity, uFogK, uStretch;
        void main(){
          vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec4 mv = viewMatrix * c;
          float d = max(-mv.z, 0.05);
          float k = 1.0;
          vec2 ax = vec2(1.0, 0.0); float st = 1.0;
          if (aDir.w > 0.0 || uStretch > 1.0) {
            vec3 dw = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * aDir.xyz + vec3(0.0, 1e-5, 0.0));
            // 沿屏幕空间运动方向拉长（车流光迹）
            vec2 sd = (viewMatrix * vec4(dw, 0.0)).xy;
            float sl = length(sd);
            if (sl > 1e-3) { ax = sd / sl; st = 1.0 + (uStretch - 1.0) * clamp(sl, 0.0, 1.0); }
            float facing = dot(dw, normalize(cameraPosition - c.xyz));
            k = mix(1.0, 0.18 + 0.82 * smoothstep(-0.15, 0.8, facing), aDir.w);
          }
          vec2 ay = vec2(-ax.y, ax.x);
          float on = 1.0;
          if (aBlink.x > 0.0) {
            float ph = fract(uTime / aBlink.x + aBlink.y);
            on = smoothstep(0.0, 0.02, ph) * (1.0 - smoothstep(aBlink.z, aBlink.z + 0.03, ph));
          }
          float pxWorld = d / (projectionMatrix[1][1] * uViewH * 0.5);
          float sz = max(aSize, pxWorld * uMinPx);
          float energy = sqrt(aSize / sz);
          mv.xy += ax * position.x * sz * st + ay * position.y * sz;
          mv.z += min(sz * 0.45, d * 0.3);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          float fog = exp(-d * uFogDensity * uFogK);
          vCol = aCol * k * on * energy * fog * smoothstep(0.3, 2.0, d);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vCol;
        uniform float uStreak;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float r2 = dot(p, p);
          float a = exp(-r2 * 6.0) * 0.55 + exp(-r2 * 45.0) * 2.0;
          a += uStreak * exp(-p.y * p.y * 300.0) * (1.0 - abs(p.x)) * 0.6;
          a *= smoothstep(1.0, 0.8, max(abs(p.x), abs(p.y)));
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.InstancedMesh(geo, m, n);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    mesh.userData.noBatch = true;
    if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const M4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, M4.makeTranslation(0, -500, 0));
    (parent || ctx.dynamicRoot).add(mesh);
    this.mesh = mesh; this.geo = geo; this._m = M4; this._c = new THREE.Color(); this.count = 0;
    // 视口高度：用于最小像素尺寸（无头检查时没有真实 renderer）
    ctx.onUpdate(() => {
      const h = ctx.renderer?.domElement?.height;
      if (h) this.uniforms.uViewH.value = h;
    });
  }
  set(i, x, y, z, color, intensity, size, { blink, dir, dirMix = 0 } = {}) {
    this.mesh.setMatrixAt(i, this._m.makeTranslation(x, y, z));
    const C = typeof color === 'number' ? cachedColor(color) : this._c.set(color);
    this.aCol[i * 3] = C.r * intensity; this.aCol[i * 3 + 1] = C.g * intensity; this.aCol[i * 3 + 2] = C.b * intensity;
    this.aSize[i] = size;
    if (blink) this.aBlink.set(blink, i * 3);
    if (dir) { this.aDir[i * 4] = dir[0]; this.aDir[i * 4 + 1] = dir[1]; this.aDir[i * 4 + 2] = dir[2]; this.aDir[i * 4 + 3] = dirMix; }
  }
  setPos(i, x, y, z) { this.mesh.setMatrixAt(i, this._m.makeTranslation(x, y, z)); }
  setDir(i, dx, dy, dz, mix) { const a = this.aDir; a[i * 4] = dx; a[i * 4 + 1] = dy; a[i * 4 + 2] = dz; a[i * 4 + 3] = mix; }
  setColor(i, color, intensity) {
    const C = typeof color === 'number' ? cachedColor(color) : this._c.set(color);
    this.aCol[i * 3] = C.r * intensity; this.aCol[i * 3 + 1] = C.g * intensity; this.aCol[i * 3 + 2] = C.b * intensity;
  }
  add(item) {
    const i = this.count++;
    const [x, y, z] = item.pos;
    this.set(i, x, y, z, item.color, item.intensity ?? 3, item.size ?? 2, item);
    return i;
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const k of ['aCol', 'aSize', 'aBlink', 'aDir']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ------------------------------------------------------------ 体积光束（雨雾中的光柱）
// 单位圆锥：尖端在原点，沿 -Y 长 1，末端半径 1；mesh.scale = (半径, 长度, 半径)
let _coneGeo = null;
export function unitCone(seg = 24) {
  if (_coneGeo) return _coneGeo;
  const g = new THREE.CylinderGeometry(0.02, 1, 1, seg, 6, true);
  g.translate(0, -0.5, 0);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setY(i, -p.getY(i));
  _coneGeo = g;
  return g;
}
export function beamMaterial(ctx, { color = 0xdfeeff, intensity = 0.6, fogK = 0.1, falloff = 1.3, rain = 0.25, core = 0.0 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms(ctx, fogK), uTime: ctx.shared.uTime,
      uCol: { value: new THREE.Color(color).multiplyScalar(intensity) },
      uFall: { value: falloff }, uRainK: { value: rain }, uCore: { value: core },
    },
    vertexShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vT = uv.y;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vW;
      uniform vec3 uCol; uniform float uTime, uFall, uRainK, uCore;
      ${FOG_GLSL}
      ${NOISE_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float ndv = clamp(abs(dot(normalize(vN), V)), 0.0, 1.0);
        float edge = pow(ndv, 1.6) + uCore * pow(ndv, 12.0);
        float t = clamp(vT, 0.0, 1.0);
        float along = pow(1.0 - t, uFall) * smoothstep(0.0, 0.03, t);
        float dust = 0.7 + 0.3 * acN(vW.xz * 0.15 + vW.y * 0.05 + uTime * 0.2);
        float rain = 1.0 - uRainK + uRainK * smoothstep(0.55, 1.0, acN(vec2(vW.x * 2.3 + vW.z * 1.7, vW.y * 0.08 + uTime * 9.0)));
        float d = length(vW - cameraPosition);
        float fog = fogLin(d);
        gl_FragColor = vec4(uCol * edge * along * dust * rain * fog, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return ctx.mat.custom(m);
}
export function makeBeam(ctx, parent, opts = {}) {
  const mesh = new THREE.Mesh(unitCone(), beamMaterial(ctx, opts));
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.userData.noBatch = true;
  mesh.name = opts.name || 'beam';
  parent.add(mesh);
  return mesh;
}
const _up = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3();
// 把光束从 from 指向 to（父节点局部坐标），末端半径 radius
export function aimBeam(mesh, from, to, radius) {
  _d.subVectors(to, from);
  const len = Math.max(0.01, _d.length());
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  mesh.scale.set(radius, len, radius);
}

// ------------------------------------------------------------ 几何工具
// 统一属性（position/normal/uv/color），非索引，便于合并
export function prep(g, color = [1, 1, 1]) {
  let n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  const cnt = n.attributes.position.count;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  const c = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) { c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  n.clearGroups();
  return n;
}
export function merge(list) {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('aircraft merge failed');
  g.computeBoundingSphere();
  return g;
}
export function rgb(hex, k = 1) { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; }

// 中心盒子（cx, cy, cz 为中心）
export function cbox(w, h, d, cx, cy, cz, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  return prep(g, color);
}

// 放样舰体：sections = [{ x, w(半宽), t(顶), b(底), ct(顶倒角), cb(底倒角) }]，沿 X 排列
// 截面是 8 边形（上下倒角），平直着色。返回非索引几何体。
export function loft(sections, color, { capStart = true, capEnd = true } = {}) {
  const ring = (s) => {
    const ct = s.ct ?? Math.min(s.w, (s.t - s.b)) * 0.25, cb = s.cb ?? Math.min(s.w, (s.t - s.b)) * 0.35;
    const ctv = Math.min(ct, (s.t - s.b) * 0.45), cbv = Math.min(cb, (s.t - s.b) * 0.45);
    return [
      [s.t, -s.w + ct], [s.t, s.w - ct], [s.t - ctv, s.w], [s.b + cbv, s.w],
      [s.b, s.w - cb], [s.b, -s.w + cb], [s.b + cbv, -s.w], [s.t - ctv, -s.w],
    ].map(([y, z]) => [s.x, y, z]);
  };
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const rings = sections.map(ring);
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      // 截面按 x 升序：此绕序法线朝外
      tri(A[k], B[k1], B[k]); tri(A[k], A[k1], B[k1]);
    }
  }
  const cap = (R, flip) => {
    const c = R.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
    for (let k = 0; k < 8; k++) { const k1 = (k + 1) % 8; flip ? tri(c, R[k1], R[k]) : tri(c, R[k], R[k1]); }
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return prep(g, color);
}
