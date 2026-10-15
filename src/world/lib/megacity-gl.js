// megacity / environment 共用的远景渲染工具：
//   - 远景高度雾（场景 FogExp2 在 300 m 外就把一切吃成雾色，远景必须自己算雾）
//   - 江面镜像（SSR 只管 140 m 内；远景倒影用"镜像几何 + 投影到水面深度"的加法 pass）
//   - MegaGeo：带立面坐标属性的合并几何（棱柱 / 收分 / 斜切顶）
//   - 塔楼立面 shader（程序化窗户、LED 带、边缘霓虹）
//   - 远景发光体 / 实体材质（顶点色）
//   - Glows：远景光点（自带雾与闪烁；镜像版拉成竖向光柱）
import * as THREE from 'three';
import { ATMO, NEON } from '../../core/palette.js';
import { Y_RIVER, RIVER } from '../layout.js';

export const WATER_Y = Y_RIVER;
export const RIVER_NEAR = RIVER.zEdge - 2;   // 江面北缘（本岸）
export const RIVER_FAR = -378;               // 对岸江堤
export const LAND_Y = 2;                     // 对岸地面
export const CLOUD_Y = 640;                  // 云底高度

// ------------------------------------------------------------------ 共享 uniform
let _U = null;
export function megaUniforms(ctx) {
  if (_U && _U._ctx === ctx) return _U;
  const lin = c => new THREE.Color(c);
  const fogLow = lin(ATMO.skyHor).lerp(lin(ATMO.fog), 0.35);
  const fogHigh = lin(ATMO.skyHor).lerp(lin(ATMO.skyTop), 0.55);
  _U = {
    _ctx: ctx,
    uTime: ctx.shared.uTime,
    uFogLow: { value: fogLow },
    uFogHigh: { value: fogHigh },
    // x 基础消光 /m，y 近地额外消光 /m，z 标高（m），w 镜像倒影亮度
    uFogK: { value: new THREE.Vector4(0.0011, 0.0045, 150, 0.55) },
    uWaterY: { value: WATER_Y },
    uRiver: { value: new THREE.Vector2(RIVER_NEAR, RIVER_FAR) },
    uPal: { value: ['cyan', 'magenta', 'violet', 'hotpot', 'amber', 'teal', 'pink', 'blue'].map(k => lin(NEON[k])) },
  };
  return _U;
}

export const COMMON_GLSL = /* glsl */`
uniform float uTime;
uniform vec3 uFogLow, uFogHigh;
uniform vec4 uFogK;
float mh1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float mh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(mh2(i), mh2(i+vec2(1,0)), u.x), mix(mh2(i+vec2(0,1)), mh2(i+vec2(1,1)), u.x), u.y); }
// 高度雾：沿视线积分 k0 + k1*exp(-y/H)
float fogOptical(vec3 a, vec3 b){
  float d = length(b - a);
  float y0 = max(a.y, 0.0), y1 = max(b.y, 0.0);
  float H = uFogK.z;
  float dy = y1 - y0;
  float avg = abs(dy) < 1.0 ? exp(-0.5 * (y0 + y1) / H) : H * (exp(-y0 / H) - exp(-y1 / H)) / dy;
  return d * (uFogK.x + uFogK.y * avg);
}
vec3 fogCol(float y){ return mix(uFogLow, uFogHigh, smoothstep(0.0, 520.0, y)); }
// 空气透视（整合时加）：远处发光体随透射率 T 变暗、褪色，再叠雾色。k 越小越"穿透"雾
vec3 aerial(vec3 c, float T, float k, float y){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, vec3(l), (1.0 - T) * 0.6) * pow(T, k) + fogCol(y) * (1.0 - T);
}
`;

// 镜像：把世界点 p 关于水面镜像后投影；深度改成"水面上方 0.6 m"处，保证被岸上物体正确遮挡
export const MIRROR_VERT_GLSL = /* glsl */`
uniform float uWaterY;
varying vec3 vWater;
vec4 mirrorClip(vec3 p){
  vec3 mp = vec3(p.x, 2.0 * uWaterY - p.y, p.z);
  vec3 ro = cameraPosition;
  vec3 rd = mp - ro;
  float ry = min(rd.y, -1e-3);
  vWater = ro + rd * ((uWaterY - ro.y) / ry);
  vec3 wq = ro + rd * ((uWaterY + 0.6 - ro.y) / ry);
  vec4 c = projectionMatrix * viewMatrix * vec4(mp, 1.0);
  vec4 cw = projectionMatrix * viewMatrix * vec4(wq, 1.0);
  c.z = cw.z / cw.w * c.w;
  return c;
}
`;
export const MIRROR_FRAG_GLSL = /* glsl */`
uniform float uWaterY;
uniform vec2 uRiver;
varying vec3 vWater;
// 返回倒影强度（0 = 不在江面上）。涟漪把倒影切成横向碎条 → 竖向拉长的光柱
float mirrorMask(vec3 src){
  if (vWater.z > uRiver.x || vWater.z < uRiver.y) return 0.0;
  float edge = smoothstep(uRiver.x, uRiver.x - 25.0, vWater.z) * smoothstep(uRiver.y, uRiver.y + 10.0, vWater.z);
  vec2 q = vWater.xz;
  float n = mnoise(vec2(q.x * 0.05, q.y * 0.9 + uTime * 0.6)) * 0.6 + mnoise(vec2(q.x * 0.11 + 3.0, q.y * 2.3 - uTime * 1.1)) * 0.4;
  float rip = smoothstep(0.25, 0.75, n);
  float dCam = length(vWater - cameraPosition);
  float T = exp(-fogOptical(cameraPosition, vWater) - fogOptical(vWater, src) * 0.35);
  return edge * (0.25 + 0.95 * rip) * T * uFogK.w * smoothstep(60.0, 160.0, dCam);
}
`;

// ------------------------------------------------------------------ 合并几何
// 属性：aF = (u 沿立面米数 | -1 顶面, 立面宽, 段底 y, 段顶 y)；aInfo = (seed, style, lit, hue)
export class MegaGeo {
  constructor() { this.pos = []; this.nrm = []; this.f = []; this.info = []; this.idx = []; this.n = 0; }

  _v(p, n, f, info) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]);
    this.f.push(f[0], f[1], f[2], f[3]); this.info.push(info[0], info[1], info[2], info[3]);
    return this.n++;
  }

  // 四边形 a b c d（逆时针，从外看）
  quad(a, b, c, d, f4, info) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n) || 1; n[0] /= l; n[1] /= l; n[2] /= l;
    const i0 = this._v(a, n, f4[0], info), i1 = this._v(b, n, f4[1], info), i2 = this._v(c, n, f4[2], info), i3 = this._v(d, n, f4[3], info);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  // 棱柱段：中心 (cx, cz)，底 y0 顶 y1，半宽 rx/rz（底），顶部缩放 taper，sides=4 为方形，rot 绕 Y
  // slant：斜切顶 —— 顶面沿方向 slantDir 抬升 ±slant 米
  prism({ cx, cz, y0, y1, rx, rz, taper = 1, sides = 4, rot = 0, info, slant = 0, slantDir = 0, cap = true, open = false }) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (sides === 4 ? Math.PI / 4 : 0) + (i / sides) * Math.PI * 2;
      const lx = Math.cos(a) * (sides === 4 ? Math.SQRT2 : 1) * rx;
      const lz = Math.sin(a) * (sides === 4 ? Math.SQRT2 : 1) * rz;
      const c = Math.cos(rot), s = Math.sin(rot);
      pts.push([lx * c + lz * s, -lx * s + lz * c]);
    }
    const topY = p => y1 + slant * ((p[0] * Math.cos(slantDir) + p[1] * Math.sin(slantDir)) / Math.max(rx, rz));
    const top = pts.map(p => [cx + p[0] * taper, topY(p), cz + p[1] * taper]);
    const bot = pts.map(p => [cx + p[0], y0, cz + p[1]]);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      // 外法线方向：pts 逆时针（从上看）→ 侧面顶点顺序 bot[j], bot[i], top[i], top[j]
      const w = Math.hypot(bot[j][0] - bot[i][0], bot[j][2] - bot[i][2]);
      this.quad(bot[j], bot[i], top[i], top[j],
        [[0, w, y0, top[j][1]], [w, w, y0, top[i][1]], [w, w, y0, top[i][1]], [0, w, y0, top[j][1]]], info);
    }
    if (cap && !open) {
      const c = [cx, top.reduce((s, p) => s + p[1], 0) / sides, cz];
      const ci = this._v(c, [0, 1, 0], [-1, 1, y0, y1], info);
      const ids = top.map(p => this._v(p, [0, 1, 0], [-1, 1, y0, y1], info));
      for (let i = 0; i < sides; i++) this.idx.push(ci, ids[(i + 1) % sides], ids[i]);
    }
  }

  box(cx, y0, cz, w, h, d, rot, info, o = {}) {
    this.prism({ cx, cz, y0, y1: y0 + h, rx: w / 2, rz: d / 2, rot, info, ...o });
  }

  get tris() { return this.idx.length / 3; }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(this.f, 4));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// style 编码：低 3 位 = 立面类型；+8 边缘霓虹；+16 顶部灯带；+32 横向灯带
export const ST = { OFFICE: 0, RESI: 1, MONO: 2, MEDIA: 3, BANDS: 4, DARK: 5, EDGE: 8, TOP: 16, RING: 32 };

// ------------------------------------------------------------------ 塔楼立面材质
export function towerMaterial(ctx, { mirror = false } = {}) {
  const U = megaUniforms(ctx);
  return ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK, uWaterY: U.uWaterY, uRiver: U.uRiver, uPal: U.uPal },
    defines: mirror ? { MIRROR: '' } : {},
    vertexShader: /* glsl */`
      attribute vec4 aF; attribute vec4 aInfo;
      uniform vec3 uPal[8];
      varying vec3 vW; varying vec3 vN; varying vec4 vF; varying vec4 vI; varying vec3 vHue; varying vec3 vHue2;
      #ifdef MIRROR
      ${MIRROR_VERT_GLSL}
      #endif
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vF = aF; vI = aInfo;
        int hi = int(clamp(aInfo.w, 0.0, 0.999) * 8.0);
        vHue = uPal[hi]; vHue2 = uPal[int(mod(float(hi) + 3.0, 8.0))];
        #ifdef MIRROR
        gl_Position = mirrorClip(wp.xyz);
        #else
        gl_Position = projectionMatrix * viewMatrix * wp;
        #endif
      }`,
    fragmentShader: /* glsl */`
      ${COMMON_GLSL}
      varying vec3 vW; varying vec3 vN; varying vec4 vF; varying vec4 vI; varying vec3 vHue; varying vec3 vHue2;
      #ifdef MIRROR
      ${MIRROR_FRAG_GLSL}
      #endif
      // 抗锯齿细线：dist 到线的距离（米），w 线宽（米）
      float aline(float dist, float w){ float fw = max(fwidth(dist), 1e-4); float ww = max(w, fw * 1.2); return (1.0 - smoothstep(0.0, ww, dist)) * w / ww; }
      void main(){
        vec3 N = normalize(vN);
        float u = vF.x, fw = vF.y, y0 = vF.z, y1 = vF.w;
        float seed = vI.x, sAll = vI.y, lit = vI.z;
        float st = mod(sAll, 8.0);
        float fEdge = step(8.0, mod(sAll, 16.0)), fTop = step(16.0, mod(sAll, 32.0)), fRing = step(32.0, sAll);
        vec3 surf = vec3(0.0), emis = vec3(0.0);
        float t = uTime;
        if (u < -0.5) {
          surf = vec3(0.006, 0.006, 0.010);
        } else {
          // 暗色玻璃/混凝土；侧面更暗；底部被城市灯光染成品红
          float face = 0.65 + 0.35 * max(dot(N, normalize(vec3(0.25, 0.0, 1.0))), 0.0);
          surf = vec3(0.012, 0.012, 0.020) * face;
          surf += vec3(0.060, 0.020, 0.050) * exp(-max(vW.y, 0.0) / 70.0);
          // 竖向分格（幕墙竖梃）
          float mull = aline(abs(fract(u / 1.8) - 0.5) * 1.8, 0.12);
          surf += vec3(0.010, 0.012, 0.020) * mull * face;
          // ---- 窗户
          if (st < 2.5 || st > 3.5) {
            float fh = st == 1.0 ? 3.2 : 4.0;
            float bw = st == 1.0 ? 3.0 : (st == 2.0 ? 6.0 : 3.6);
            vec2 g = vec2(u / bw, vW.y / fh);
            vec2 cell = floor(g), f = fract(g);
            float ww = st == 0.0 || st == 4.0 ? 0.9 : 0.6;
            float win = smoothstep(0.5 - ww * 0.5, 0.5 - ww * 0.5 + 0.06, f.x) * smoothstep(0.5 + ww * 0.5, 0.5 + ww * 0.5 - 0.06, f.x)
                      * smoothstep(0.2, 0.26, f.y) * smoothstep(0.82, 0.76, f.y);
            float blockL = st == 0.0 || st == 4.0 ? floor(cell.y / (2.0 + floor(mh1(seed) * 4.0))) : cell.y;
            float floorLit = mh2(vec2(blockL, seed * 13.1));
            float r = mh2(cell + seed * 91.7);
            float on;
            if (st == 0.0 || st == 4.0) on = step(floorLit, lit) * step(0.12, r);      // 整层办公灯
            else on = step(r, lit * (0.5 + floorLit));
            if (st == 5.0) on *= step(0.85, r);
            float tone = mh2(cell * 1.7 + seed);
            vec3 warm = vec3(1.0, 0.62, 0.30), cool = vec3(0.62, 0.82, 1.0), tv = vec3(0.45, 0.6, 1.0);
            vec3 wc = st == 0.0 || st == 4.0 ? mix(cool, warm, step(0.7, mh1(blockL + seed * 3.0)))
                                             : (tone < 0.65 ? warm : (tone < 0.85 ? cool : (tone < 0.93 ? tv : vHue)));
            float k = 0.45 + 0.9 * mh2(cell + 3.1);
            vec3 detail = win * on * wc * k;
            // 远处窗户小于像素 → 换成平均亮度，避免闪烁摩尔纹
            float px = max(fwidth(g.x), fwidth(g.y));
            vec3 avg = wc * lit * 0.42 * (st == 5.0 ? 0.15 : 1.0) * (st == 1.0 ? 0.5 : 0.6);
            emis += mix(detail, avg, smoothstep(0.35, 0.9, px)) * 1.15;
          }
          // ---- 黑色巨石：竖向 LED 肋，光脉冲向上爬
          if (st == 2.0) {
            float rib = aline(abs(fract(u / 6.0) - 0.5) * 6.0, 0.35);
            float pulse = pow(0.5 + 0.5 * sin(vW.y * 0.035 - t * 1.6 + floor(u / 6.0) * 1.7 + seed * 20.0), 6.0);
            emis += vHue * rib * (0.35 + 2.2 * pulse);
          }
          // ---- 媒体立面：低分辨率点阵上的流动色彩
          if (st == 3.0) {
            vec2 q = vec2(u, vW.y) / 2.2;
            vec2 c = floor(q); vec2 f = fract(q) - 0.5;
            float dotm = 1.0 - smoothstep(0.25, 0.42, length(f));
            float px = fwidth(q.x);
            dotm = mix(dotm, 0.45, smoothstep(0.3, 0.8, px));
            float w1 = sin(c.x * 0.09 + c.y * 0.05 - t * 1.3 + seed * 30.0);
            float w2 = sin(c.y * 0.13 - t * 0.7 + sin(c.x * 0.04 + t * 0.3) * 3.0);
            float m = 0.5 + 0.5 * w1 * w2;
            vec3 mc = mix(vHue, vHue2, smoothstep(0.2, 0.8, m));
            emis += mc * dotm * (0.25 + 1.6 * pow(m, 3.0));
          }
          // ---- 横向灯带（追光）
          if (st == 4.0 || fRing > 0.5) {
            float period = 26.0 + floor(mh1(seed * 5.0) * 3.0) * 8.0;
            float yy = mod(vW.y - y0, period);
            float band = aline(abs(yy - period * 0.5), 0.9);
            float chase = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(u * 0.08 - t * 2.5 + floor((vW.y - y0) / period) * 2.0), 3.0);
            emis += vHue * band * 2.2 * chase;
          }
          // ---- 边缘霓虹 + 顶部灯带
          if (fEdge > 0.5) {
            float e = aline(min(u, fw - u), 0.7);
            emis += vHue * e * 2.4;
          }
          if (fTop > 0.5) {
            float e = aline(abs(y1 - 1.5 - vW.y), 0.8);
            emis += mix(vHue, vec3(1.0), 0.3) * e * 2.6;
          }
        }
        #ifdef MIRROR
        if (vW.y < uWaterY) discard;
        float m = mirrorMask(vW);
        if (m <= 0.0) discard;
        gl_FragColor = vec4(emis * m, 1.0);
        #else
        float tau = fogOptical(cameraPosition, vW);
        float T = exp(-tau);
        vec3 col = surf * T + aerial(emis, T, 1.0, vW.y);
        gl_FragColor = vec4(col, 1.0);
        #endif
      }`,
    ...(mirror ? { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } : {}),
  }));
}

// ------------------------------------------------------------------ 远景实体 / 发光体（顶点色）
// emit=false：暗色实体（颜色 = 反照率的近似，只有雾与城市底光）；emit=true：发光（颜色为 HDR 线性值）
export function farMaterial(ctx, { emit = false, mirror = false, anim = false } = {}) {
  const U = megaUniforms(ctx);
  const defs = {};
  if (emit) defs.EMIT = '';
  if (mirror) defs.MIRROR = '';
  if (anim) defs.ANIM = '';
  return ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK, uWaterY: U.uWaterY, uRiver: U.uRiver },
    defines: defs,
    vertexColors: true,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vCol; varying vec3 vN; varying vec2 vUv;
      #ifdef MIRROR
      ${MIRROR_VERT_GLSL}
      #endif
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vCol = color; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
        #ifdef MIRROR
        gl_Position = mirrorClip(wp.xyz);
        #else
        gl_Position = projectionMatrix * viewMatrix * wp;
        #endif
      }`,
    fragmentShader: /* glsl */`
      ${COMMON_GLSL}
      varying vec3 vW; varying vec3 vCol; varying vec3 vN; varying vec2 vUv;
      #ifdef MIRROR
      ${MIRROR_FRAG_GLSL}
      #endif
      void main(){
        vec3 c = vCol;
        #ifdef ANIM
        // 车流光带：uv.x 沿路，uv.y 方向（0/1）
        float dir = vUv.y > 0.5 ? 1.0 : -1.0;
        float x = vUv.x * 0.08 - uTime * 2.2 * dir;
        float car = smoothstep(0.55, 0.75, fract(x + mh1(floor(x) * 3.1) * 0.3)) * step(0.35, mh1(floor(x) + vUv.y * 7.0));
        c *= 0.15 + car * 1.6;
        #endif
        #ifdef MIRROR
        float m = mirrorMask(vW);
        if (m <= 0.0) discard;
        gl_FragColor = vec4(c * m, 1.0);
        #else
        float T = exp(-fogOptical(cameraPosition, vW));
        #ifdef EMIT
        vec3 col = aerial(c, T, 1.0, vW.y);
        #else
        vec3 N = normalize(vN);
        vec3 s = c * (0.35 + 0.25 * max(N.y, 0.0) + 0.4 * max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0)) * 0.08;
        s += vec3(0.05, 0.018, 0.045) * exp(-max(vW.y, 0.0) / 50.0) * 0.5;
        vec3 col = s * T + fogCol(vW.y) * (1.0 - T);
        #endif
        gl_FragColor = vec4(col, 1.0);
        #endif
      }`,
    ...(mirror || emit === 'add' ? { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } : {}),
  }));
}

// 顶点色几何收集器（远景实体 / 发光线）
export class ColorGeo {
  constructor() { this.parts = []; }
  add(geo, color, intensity = 1, matrix = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    this.parts.push(g);
    return g;
  }
  // 两点之间的细长方柱（拉索、灯线）
  beam(a, b, r, color, intensity = 1) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.BoxGeometry(r * 2, len, r * 2);
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1));
    return this.add(g, color, intensity, m);
  }
  box(cx, y0, cz, w, h, d, color, intensity = 1, ry = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, y0 + h / 2, cz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.BoxGeometry(w, h, d), color, intensity, m);
  }
  get tris() { return this.parts.reduce((s, g) => s + g.attributes.position.count / 3, 0); }
  merged() {
    if (!this.parts.length) return null;
    let n = 0; for (const g of this.parts) n += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
      const arr = new Float32Array(n * size); let o = 0;
      for (const g of this.parts) { const a = g.attributes[k]; arr.set(a.array, o); o += a.array.length; }
      out.setAttribute(k, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    return out;
  }
}

// 把同一几何体同时以"正常 + 江面倒影"两种材质加入场景
export function addWithMirror(ctx, parent, geo, matN, matM, name) {
  const a = new THREE.Mesh(geo, matN); a.name = name; a.userData.noBatch = true; a.frustumCulled = false;
  parent.add(a);
  if (matM) {
    const b = new THREE.Mesh(geo, matM); b.name = name + 'Mirror'; b.userData.noBatch = true; b.frustumCulled = false;
    b.renderOrder = 4;
    parent.add(b);
  }
  return a;
}

// ------------------------------------------------------------------ 远景光点
// blink: [周期 s, 亮的占空比 0..1, 相位 0..1]；周期 0 = 常亮
export class Glows {
  constructor() { this.items = []; }
  add(position, color, size, intensity = 1, blink = [0, 1, 0]) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    this.items.push({ p: position, c, size, blink });
    return this.items.length - 1;
  }
  build(ctx, parent, name = 'megaGlows', { mirror = true } = {}) {
    const n = this.items.length;
    if (!n) return null;
    const U = megaUniforms(ctx);
    const geo = new THREE.PlaneGeometry(1, 1);
    const aC = new Float32Array(n * 4), aB = new Float32Array(n * 3);
    this.items.forEach((it, i) => { aC.set([it.c.r, it.c.g, it.c.b, it.size], i * 4); aB.set(it.blink, i * 3); });
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 3));
    this.aC = geo.attributes.aC;
    const mk = (mir) => ctx.mat.custom(new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK, uWaterY: U.uWaterY, uRiver: U.uRiver },
      defines: mir ? { MIRROR: '' } : {},
      vertexShader: /* glsl */`
        ${COMMON_GLSL}
        attribute vec4 aC; attribute vec3 aB;
        varying vec2 vUv; varying vec3 vCol; varying vec3 vSrc;
        #ifdef MIRROR
        ${MIRROR_VERT_GLSL}
        #endif
        void main(){
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vSrc = c;
          float on = 1.0;
          if (aB.x > 0.0) on = step(fract(uTime / aB.x + aB.z), aB.y);
          float T = exp(-fogOptical(cameraPosition, c));
          vCol = aC.rgb * on * pow(T, 0.8);
          vUv = uv;
          #ifdef MIRROR
          vec4 cc = mirrorClip(c);
          cc.xy += position.xy * vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * aC.w * vec2(0.8, 3.5);
          gl_Position = cc;
          #else
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * aC.w;
          gl_Position = projectionMatrix * mv;
          #endif
        }`,
      fragmentShader: /* glsl */`
        ${COMMON_GLSL}
        varying vec2 vUv; varying vec3 vCol; varying vec3 vSrc;
        #ifdef MIRROR
        ${MIRROR_FRAG_GLSL}
        #endif
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float a = exp(-r * r * 6.0) * 0.8 + exp(-r * r * 60.0) * 1.2;
          a *= smoothstep(1.0, 0.85, r);
          #ifdef MIRROR
          float m = mirrorMask(vSrc);
          if (m <= 0.0) discard;
          a *= m * 1.5;
          #endif
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const mkMesh = (mir) => {
      const m = new THREE.InstancedMesh(geo, mk(mir), n);
      const m4 = new THREE.Matrix4();
      this.items.forEach((it, i) => { m4.makeTranslation(it.p[0], it.p[1], it.p[2]); m.setMatrixAt(i, m4); });
      m.frustumCulled = false; m.userData.noBatch = true; m.renderOrder = mir ? 4 : 9; m.name = name + (mir ? 'Mirror' : '');
      parent.add(m);
      return m;
    };
    const main = mkMesh(false);
    if (mirror) mkMesh(true);
    return main;
  }
}
