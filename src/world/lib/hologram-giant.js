// 全息巨人：江面上 140 m 的风格化女性（致敬 Joi）。
// 几何（局部坐标，脚底在原点，+Y 上，+Z 面朝方向）：
//   part 0 身体：椭圆截面放样（颈 → 肩 → 胸 → 腰 → 胯 → 鱼尾长裙），胸部/臀部用截面形变
//   part 1 头：参数球 + 下颌收窄 + 鼻/下巴/眼窝形变
//   part 2 波波头发壳；part 3 飘动的发带
//   part 4 手臂：在顶点着色器里沿 肩→肘→腕→指尖 折线程序化生成（抬手动画无裂缝）
// 动画（只由 uTime 决定）：呼吸、裙摆、转头看向镜头、右手抬起再放下（32 s）、发带飘动、glitch。
import * as THREE from 'three';
import { HOLO_COMMON, HOLO_GLITCH, HOLO_SHADE, HOLO_MIRROR } from './hologram-glsl.js';

const PART = { body: 0, head: 1, hairCap: 2, hairRibbon: 3, arm: 4 };

// ---------------------------------------------------------------- 几何构建
class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.part = []; this.aux = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  // grid：rows × cols 个顶点（行优先），fn(i, j) → {p:[x,y,z], aux:[4]}；wrap=true 时列首尾相接
  grid(rows, cols, part, fn, { wrap = false, flip = false } = {}) {
    const base = this.count;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = fn(i, j);
        this.pos.push(...v.p);
        this.nrm.push(0, 0, 0);
        this.part.push(part);
        this.aux.push(...(v.aux || [0, 0, 0, 0]));
      }
    }
    const cw = wrap ? cols : cols - 1;
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cw; j++) {
        const j1 = (j + 1) % cols;
        const a = base + i * cols + j, b = base + i * cols + j1, c = base + (i + 1) * cols + j, d = base + (i + 1) * cols + j1;
        if (flip) this.idx.push(a, b, c, b, d, c); else this.idx.push(a, c, b, b, c, d);
      }
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.aux, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// 均匀 Catmull-Rom（按关键帧下标插值）
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleKeys(keys, y, col) {
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1][0]) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (y - k1[0]) / (k2[0] - k1[0])));
  return catmull(k0[col], k1[col], k2[col], k3[col], t);
}
const g2 = (x) => Math.exp(-x * x);
const bell = (x, c, w) => g2((x - c) / w);

// 身体截面关键帧（单位：身高百分比）[y, 半宽 rx, 前深 zf, 后深 zb, 中心 z 偏移]
const BODY_KEYS = [
  [0.0, 14.8, 9.0, 11.5, -0.6],
  [3.0, 13.4, 8.2, 10.0, -0.4],
  [9.0, 10.4, 6.6, 7.4, -0.2],
  [16.0, 7.6, 5.0, 5.4, 0.0],
  [24.0, 6.3, 4.2, 4.4, 0.0],     // 膝（鱼尾裙收紧）
  [32.0, 7.0, 4.4, 4.7, 0.0],
  [41.0, 8.4, 4.8, 5.3, 0.0],
  [48.0, 9.1, 5.0, 5.8, 0.0],
  [53.0, 9.2, 4.8, 5.9, -0.1],    // 胯
  [57.5, 7.8, 4.3, 4.8, -0.2],
  [62.0, 6.1, 3.9, 3.9, -0.1],    // 腰
  [66.0, 6.6, 4.2, 3.8, 0.1],
  [70.0, 7.6, 4.8, 3.9, 0.3],     // 下胸
  [73.5, 8.4, 5.4, 4.0, 0.4],     // 胸
  [76.5, 9.0, 4.8, 4.0, 0.3],
  [79.0, 9.6, 3.9, 3.8, 0.1],     // 肩
  [80.8, 8.6, 3.4, 3.5, 0.0],
  [82.3, 5.2, 2.9, 3.1, 0.1],     // 斜方肌
  [84.0, 2.7, 2.5, 2.7, 0.4],     // 颈
  [87.0, 2.5, 2.4, 2.6, 0.7],
  [89.0, 2.3, 2.2, 2.4, 0.9],     // 伸进头里
];

export const GIANT = {
  pivot: [0, 86.4, 0.4],     // 头部转动支点（%）
  head: { c: [0, 93.6, 1.0], rx: 4.5, ry: 6.3, zf: 5.4, zb: 5.7 },
  shoulder: [8.4, 79.4, -0.2],
  arm: { L1: 17, L2: 15, L3: 9 },
};

function headPoint(P, phi, th, scale = 1, flare = 0) {
  const H = GIANT.head;
  const sp = Math.sin(phi), cp = Math.cos(phi);
  let rx = H.rx, zf = H.zf, zb = H.zb;
  if (sp < 0) {
    const q = -sp;
    rx *= 1 - 0.36 * q ** 1.6;
    zf *= 1 - 0.10 * q ** 2;
    zb *= 1 - 0.42 * q ** 1.2;
  }
  const front = Math.cos(th) >= 0;
  let x = rx * cp * Math.sin(th);
  let y = H.ry * sp;
  let z = (front ? zf : zb) * cp * Math.cos(th);
  if (scale === 1) {
    // 面部形变（只作用于脸，头发壳不需要）
    const ath = Math.abs(th);
    const nose = 0.85 * g2(th / 0.15) * bell(phi, -0.12, 0.17);
    const brow = 0.25 * g2(th / 0.7) * bell(phi, 0.18, 0.08);
    const chin = 0.35 * g2(th / 0.32) * bell(phi, -1.0, 0.16);
    const lips = 0.22 * g2(th / 0.25) * bell(phi, -0.55, 0.08);
    const eye = -0.45 * bell(ath, 0.42, 0.15) * bell(phi, 0.03, 0.11);
    const cheek = 0.25 * bell(ath, 0.75, 0.25) * bell(phi, -0.25, 0.2);
    const d = (nose + brow + chin + lips + eye + cheek);
    z += d * Math.max(0, Math.cos(th));
    x += d * 0.3 * Math.sin(th) * Math.max(0, Math.cos(th));
  } else {
    x *= scale + flare; z *= scale + flare; y *= scale;
  }
  return [H.c[0] + x, H.c[1] + y, H.c[2] + z];
}

export function buildGiantGeometry(heightM) {
  const P = heightM / 100;
  const B = new GeoBuilder();
  const S = (v) => v.map(n => n * P);

  // ---- 身体
  const RING = 56, ROWS = 120, yTop = BODY_KEYS[BODY_KEYS.length - 1][0];
  B.grid(ROWS, RING, PART.body, (i, j) => {
    const y = (i / (ROWS - 1)) * yTop;
    const rx = sampleKeys(BODY_KEYS, y, 1), zf = sampleKeys(BODY_KEYS, y, 2), zb = sampleKeys(BODY_KEYS, y, 3), zc = sampleKeys(BODY_KEYS, y, 4);
    const a = (j / RING) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let z = (sa >= 0 ? zf : zb) * sa;
    // 胸部：两个前凸
    if (sa > 0) z += 1.7 * bell(y, 73.2, 2.6) * (g2((ca - 0.42) / 0.24) + g2((ca + 0.42) / 0.24)) * sa;
    // 臀部
    if (sa < 0) z -= 0.9 * bell(y, 52, 4) * (g2((ca - 0.45) / 0.35) + g2((ca + 0.45) / 0.35)) * -sa;
    // 锁骨/肩：肩头更圆
    const x = rx * ca * (1 + 0.04 * bell(y, 79, 1.5));
    return { p: S([x, y, z + zc]), aux: [a, y / 100, 0, 0] };
  }, { wrap: true });

  // ---- 头
  const LAT = 30, LON = 44;
  B.grid(LAT, LON, PART.head, (i, j) => {
    const phi = -Math.PI / 2 + (i / (LAT - 1)) * Math.PI;
    const th = -Math.PI + (j / LON) * Math.PI * 2;
    return { p: S(headPoint(P, phi, th)), aux: [th, phi, 0, 0] };
  }, { wrap: true, flip: true });

  // ---- 波波头：头顶壳。前沿发际线在额头中间较高（露出额头），两侧较低
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  B.grid(14, LON, PART.hairCap, (i, j) => {
    const th = -Math.PI + (j / LON) * Math.PI * 2;
    const ph0 = 0.66 - 0.36 * sm(0.25, 1.4, Math.abs(th));
    const phi = ph0 + (i / 13) * (Math.PI / 2 - ph0);
    return { p: S(headPoint(P, phi, th, 1.06)), aux: [th, phi, 0, 0] };
  }, { wrap: true, flip: true });
  // 两侧与后脑的发帘（及下颌的波波头）：发梢略外翻
  const CR = 16, CC = 36;
  B.grid(CR, CC, PART.hairCap, (i, j) => {
    const v = i / (CR - 1);                        // 0 = 上沿, 1 = 发梢
    const phi = 0.46 - v * 1.08;
    const u = j / (CC - 1);
    const thE = 1.15 + 0.3 * (1 - v);              // 前沿：越往下越靠前（包住脸颊）
    const th = thE + u * (Math.PI * 2 - 2 * thE);
    const flare = 0.07 * v * v + 0.02 * Math.sin(th * 7.0) * v;
    const p = headPoint(P, phi, th, 1.07, flare);
    return { p: S(p), aux: [th, phi, v, 0] };
  });

  // ---- 发带：从后脑垂下、被风吹向她的左侧（+X），在着色器里飘动
  const NR = 11, RS = 28;
  for (let r = 0; r < NR; r++) {
    const th = 2.15 + (r / (NR - 1)) * (Math.PI * 2 - 4.3);
    const len = 26 + 14 * Math.abs(Math.sin(r * 2.3 + 0.7));
    const root = headPoint(P, -0.32, th, 1.06);
    const out = [Math.sin(th), 0, Math.cos(th)], acr = [Math.cos(th), 0, -Math.sin(th)];
    const phase = r * 1.7;
    const ribbon = (i, j) => {
      const v = i / (RS - 1);
      const w = 3.0 * (1 - 0.75 * v) * (j - 1) / P;      // 宽度（米 → %）
      const o = (0.8 + 4.0 * v ** 0.8) / P;               // 向外散开（米 → %）
      const yy = -0.78 * v * len / P;
      const wind = 0.55 * len * v ** 1.5 / P;             // 风向 +X
      return {
        p: S([root[0] + out[0] * o + acr[0] * w + wind, root[1] + yy, root[2] + out[2] * o + acr[2] * w - 0.2 * wind]),
        aux: [v, phase, (j - 1), r],
      };
    };
    B.grid(RS, 3, PART.hairRibbon, ribbon);                 // 双面：两种绕序各一份
    B.grid(RS, 3, PART.hairRibbon, ribbon, { flip: true });
  }

  // ---- 手臂：两条程序化管（位置由着色器计算；这里写入近似静止姿态供包围盒）
  const AS = 56, AR = 20;
  for (const side of [-1, 1]) {
    B.grid(AS, AR + 1, PART.arm, (i, j) => {
      const s = -0.05 + (i / (AS - 1)) * 1.05;
      const a = (j / AR) * Math.PI * 2;
      const L = GIANT.arm.L1 + GIANT.arm.L2 + GIANT.arm.L3;
      const p = [side * (GIANT.shoulder[0] + 2), GIANT.shoulder[1] - s * L, 0];
      return { p: S(p), aux: [s, a, side, 0] };
    }, { flip: true });
  }
  return B.build();
}

// ---------------------------------------------------------------- 着色器
export function giantMaterial(THREE_, { uniforms, mirror = false }) {
  const VERT = /* glsl */`
  ${HOLO_COMMON}
  ${HOLO_GLITCH}
  ${HOLO_MIRROR}
  attribute float aPart; attribute vec4 aAux;
  uniform float uH; uniform float uYw; uniform float uSeed;
  varying vec3 vW; varying vec3 vN; varying float vH; varying float vPart; varying vec3 vL; varying vec4 vAux; varying float vMirD;
  #define P (uH / 100.0)

  float raiseK(){                       // 右手抬起：32 s 周期
    float p = mod(uTime + 17.0, 32.0);
    return smoothstep(5.0, 11.0, p) * (1.0 - smoothstep(21.0, 27.5, p));
  }
  float lookK(){                        // 看向镜头：40 s 周期
    float q = mod(uTime - 4.0, 40.0);
    return smoothstep(3.0, 10.0, q) * (1.0 - smoothstep(29.0, 36.0, q));
  }
  float breath(){ return sin(uTime * 6.2831 / 5.5); }

  // 手臂：s ∈ [-0.05, 1]，a = 截面角，side = ±1（+1 = 她的左手 = +X）
  vec3 armPoint(float s, float a, float side, out vec3 nrm){
    float k = side < 0.0 ? raiseK() : 0.0;
    float idle = 0.03 * sin(uTime * 0.37 + side);
    vec3 S = vec3(side * ${GIANT.shoulder[0].toFixed(2)}, ${GIANT.shoulder[1].toFixed(2)} + 0.25 * breath(), ${GIANT.shoulder[2].toFixed(2)}) * P;
    float e = mix(0.16 + idle, 1.95, k), az = mix(1.5708, 0.55, k);
    vec3 d1 = vec3(side * sin(e) * sin(az), -cos(e), sin(e) * cos(az));
    vec3 ref = normalize(mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), k));
    vec3 nb = normalize(ref - d1 * dot(ref, d1));
    float b = mix(0.22, 0.6, k) + 0.04 * sin(uTime * 0.5), c = mix(0.10, 0.75, k);
    vec3 d2 = cos(b) * d1 + sin(b) * nb;
    vec3 nb2 = -sin(b) * d1 + cos(b) * nb;
    vec3 d3 = cos(c) * d2 + sin(c) * nb2;
    vec3 bn = normalize(cross(d1, nb));
    float L1 = ${GIANT.arm.L1.toFixed(1)} * P, L2 = ${GIANT.arm.L2.toFixed(1)} * P, L3 = ${GIANT.arm.L3.toFixed(1)} * P;
    float Lt = L1 + L2 + L3, s1 = L1 / Lt, s2 = (L1 + L2) / Lt;
    vec3 E = S + d1 * L1, W = E + d2 * L2;
    vec3 C;
    if (s < s1) C = S + d1 * (s * Lt);
    else if (s < s2) C = E + d2 * ((s - s1) * Lt);
    else C = W + d3 * ((s - s2) * Lt);
    vec3 T = normalize(mix(mix(d1, d2, smoothstep(s1 - 0.04, s1 + 0.04, s)), d3, smoothstep(s2 - 0.03, s2 + 0.03, s)));
    vec3 A = normalize(bn - T * dot(bn, T));
    vec3 B = cross(T, A);
    // 半径剖面（%）
    float r = 2.35;
    r = mix(r, 2.15, smoothstep(0.0, 0.22, s));
    r = mix(r, 1.6, smoothstep(0.22, s1, s));
    r = mix(r, 1.75, smoothstep(s1, s1 + 0.1, s));
    r = mix(r, 1.0, smoothstep(s1 + 0.12, s2 - 0.01, s));
    float rA = r, rB = r;
    float hw = mix(1.0, 1.4, smoothstep(s2, s2 + 0.07, s));
    hw = mix(hw, 0.8, smoothstep(0.93, 1.0, s));
    float ht = 0.55;
    float hand = smoothstep(s2 - 0.01, s2 + 0.04, s);
    rA = mix(r, mix(ht, hw, k), hand);
    rB = mix(r, mix(hw, ht, k), hand);
    float cap = 1.0;
    if (s < 0.0) cap = sqrt(max(0.0, 1.0 - pow(s / 0.05, 2.0)));
    if (s > 0.955) cap = sqrt(max(0.0, 1.0 - pow((s - 0.955) / 0.045, 2.0)));
    rA *= cap * P; rB *= cap * P;
    if (s < 0.0) C = S + d1 * (s * Lt);
    nrm = normalize(cos(a) * A / max(rA, 0.01) + sin(a) * B / max(rB, 0.01));
    return C + cos(a) * A * rA + sin(a) * B * rB;
  }

  void main(){
    vec3 p = position; vec3 n = normal;
    float part = aPart;
    vL = position / P;
    vAux = aAux;
    float br = breath();
    if (part < 0.5) {
      // 身体：呼吸 + 裙摆摆动
      float wB = exp(-pow((p.y / P - 74.0) / 7.0, 2.0));
      p.z = mix(p.z, p.z * (1.0 + 0.03 * br), wB);
      p.x *= 1.0 + 0.008 * br * wB;
      p.y += 0.25 * br * P * smoothstep(70.0, 82.0, p.y / P);
      float f = pow(max(0.0, 1.0 - p.y / (34.0 * P)), 2.0);
      float ang = aAux.x;
      p.x += f * 2.6 * sin(uTime * 0.7 + ang * 2.0 + p.y * 0.05);
      p.z += f * 1.8 * sin(uTime * 0.55 + ang * 3.0 + 1.3);
      p.y += f * 1.2 * sin(uTime * 0.9 + ang * 5.0);
    } else if (part < 4.5 && part > 3.5) {
      p = armPoint(aAux.x, aAux.y, aAux.z, n);
    } else {
      // 头 / 头发：绕颈部支点转动，看向镜头
      vec3 pv = vec3(${GIANT.pivot[0].toFixed(2)}, ${GIANT.pivot[1].toFixed(2)}, ${GIANT.pivot[2].toFixed(2)}) * P;
      pv.y += 0.25 * br * P;
      vec3 camL = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
      vec3 toC = camL - pv;
      float yawC = clamp(atan(toC.x, toC.z), -0.95, 0.95);
      float pitC = clamp(atan(toC.y, length(toC.xz)), -0.35, 0.2);
      float lk = lookK();
      float yaw = mix(0.55 + 0.08 * sin(uTime * 0.23), yawC, lk);
      float pitch = mix(-0.08 + 0.04 * sin(uTime * 0.31), -pitC * 0.8, lk);
      float roll = 0.05 * sin(uTime * 0.19) + 0.10 * lk;
      mat3 R = rotY(yaw) * rotX(pitch) * rotZ(roll);
      if (part > 2.5) {
        // 发带：风吹飘动；越往下越不跟随头部转动
        float v = aAux.x, ph = aAux.y;
        p.x += pow(v, 1.5) * 4.0 * sin(uTime * 0.9 - v * 4.5 + ph);
        p.z += -pow(v, 1.4) * 3.0 * (0.7 + 0.3 * sin(uTime * 0.6 + ph));
        p.y += pow(v, 2.0) * 1.5 * sin(uTime * 1.1 - v * 3.0 + ph);
        vec3 q = p - pv;
        p = pv + mix(R * q, rotY(yaw * 0.3) * q, smoothstep(0.0, 0.7, v));
        n = R * n;
      } else {
        p = pv + R * (p - pv);
        n = R * n;
      }
    }
    vPart = part;
    vH = p.y / uH;
    vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
    vec3 wn = normalize(mat3(modelMatrix) * n);
    wp = glitchOffset(wp, normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0)), uSeed, 6.0, 9.0);
    vMirD = 0.0;
    #ifdef MIRROR
      vMirD = (wp.y - uYw) / uH;
      wp = mirrorToWater(wp, uYw);
      wp.x += sin(wp.z * 0.21 + uTime * 1.6) * 1.6 + sin(wp.z * 0.67 - uTime * 2.3) * 0.6;
      wn.y = -wn.y;
    #endif
    vW = wp; vN = wn;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

  const FRAG = /* glsl */`
  ${HOLO_COMMON}
  ${HOLO_SHADE}
  uniform float uH; uniform float uSeed; uniform float uGain;
  varying vec3 vW; varying vec3 vN; varying float vH; varying float vPart; varying vec3 vL; varying vec4 vAux; varying float vMirD;
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    vec3 N = normalize(vN);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, 2.3);
    vec3 cyan = vec3(0.10, 0.78, 1.0), mag = vec3(1.0, 0.20, 0.78), vio = vec3(0.55, 0.30, 1.0);
    float g = vH + 0.05 * sin(vW.x * 0.04 + uTime * 0.4);
    vec3 base = mix(cyan, vio, smoothstep(0.15, 0.55, g));
    base = mix(base, mag, smoothstep(0.6, 0.95, g));
    // 柔和主光（来自南岸上方）：让鼻梁、脸颊、胸腰的起伏可读
    float key = clamp(dot(N, normalize(vec3(-0.25, 0.55, 0.8))), 0.0, 1.0);
    float I = 0.05 + rim * 1.45 + key * key * 0.32;
    // 扫描线（世界 y，细线抗锯齿）+ 粗带
    float lines = aaLine(vW.y / 1.7 - uTime * 0.25, 0.32);
    float band = pow(0.5 + 0.5 * sin(vW.y * 0.16 - uTime * 1.4), 8.0);
    I += lines * 0.20 + band * 0.18;
    // 自下而上的扫光
    float hs = fract(uTime / 9.0) * 1.35 - 0.15;
    float sw = exp(-pow((vH - hs) / 0.006, 2.0));
    float trail = step(vH, hs) * exp(-(hs - vH) / 0.06) * 0.5;
    I += sw * 1.8 + trail * 0.3;
    vec3 col;
    if (vPart > 1.5 && vPart < 3.5) {
      // 头发：品红-紫，发丝纹
      float strand = vPart > 2.5 ? aaLine(vAux.z * 1.5 + 0.5, 0.25) : aaLine(vAux.x * 9.0, 0.22);
      base = mix(mag, vio, 0.35 + 0.35 * sin(vAux.x * 3.0 + uTime * 0.3));
      I = 0.06 + rim * 1.1 + key * 0.2 + strand * 0.3 + band * 0.12 + sw * 1.4;
      if (vPart > 2.5) I *= 0.8 * (1.0 - smoothstep(0.7, 1.0, vAux.x));
    } else if (vPart > 0.5 && vPart < 1.5) {
      // 脸：眼、唇
      float front = smoothstep(0.0, 2.0, vL.z - 1.0);
      float dx = abs(vL.x) - 1.75, dy = vL.y - 93.9;
      float eyes = exp(-(dx * dx / 0.30 + dy * dy / 0.04)) * front;
      float lips = exp(-(vL.x * vL.x / 1.1 + pow(vL.y - 90.2, 2.0) / 0.06)) * front;
      float brows = exp(-(pow(abs(vL.x) - 1.9 + 0.15 * (vL.y - 95.0), 2.0) / 0.6 + pow(vL.y - 95.05 + 0.12 * abs(vL.x), 2.0) / 0.012)) * front;
      I += eyes * 1.1 + brows * 0.45;
      base = mix(base, vec3(0.75, 0.95, 1.0), eyes);
      I += lips * 0.5;
      base = mix(base, mag * 1.1, lips);
    } else if (vPart < 0.5) {
      // 裙子：竖向褶线
      float pleat = aaLine(vAux.x * 14.0 / 6.2831, 0.18) * (1.0 - smoothstep(0.30, 0.55, vAux.y));
      I += pleat * 0.25;
      // 腰带
      I += exp(-pow((vAux.y - 0.62) / 0.006, 2.0)) * 1.2;
    }
    col = base * I + vec3(0.75, 0.95, 1.0) * pow(rim, 5.0) * 0.9 + vec3(0.9, 1.0, 1.0) * sw * 0.6;
    col *= holoFlicker(uSeed);
    // 脚下渐隐进投影光环
    col *= mix(0.55, 1.0, smoothstep(0.0, 0.05, vH));
    #ifdef MIRROR
      float rip = 0.45 + 0.55 * sin(vW.z * 1.1 + uTime * 2.4 + sin(vW.x * 0.15 + uTime) * 2.0);
      float brk = step(0.3, hh2(vec2(floor(vW.z * 0.5), floor(uTime * 5.0))));
      col *= 0.30 * rip * mix(0.5, 1.0, brk) * exp(-vMirD * 1.8);
    #endif
    col *= holoFog(vW, 0.19) * uGain;
    gl_FragColor = vec4(col, 1.0);
  }`;

  const m = new THREE_.ShaderMaterial({
    uniforms,
    vertexShader: VERT, fragmentShader: FRAG,
    defines: mirror ? { MIRROR: '' } : {},
    transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending,
    side: mirror ? THREE_.BackSide : THREE_.FrontSide,
  });
  return m;
}
