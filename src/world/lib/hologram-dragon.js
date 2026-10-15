// 全息中国龙：绕雾都塔（L.MEGA.hero）盘旋，身长 ~430 m。
// 身体 = 顶点着色器里沿时间移动的样条管：中心线 Q(s, t)（s=0 龙头，1 龙尾），每个顶点存「局部偏移」(右, 上, 前) + aS，
// 在 Q(s) 处的标架上展开。头、下颌、角、须、鬃、背鳍、四爪都以局部坐标挂在对应 s 的标架上。
// 鳞片、腹甲、能量脉冲、扫描线都在片元着色器里画。
import * as THREE from 'three';
import { gridGeo, loftZ, tube, ribbon, mergeParts } from './hologram-geo.js';
import { HOLO_COMMON, HOLO_GLITCH, HOLO_SHADE } from './hologram-glsl.js';
import { NEON } from '../../core/palette.js';

const K = { body: 0, head: 1, jaw: 2, horn: 3, whisker: 4, fin: 5, mane: 6, leg: 7 };

export const DRAGON = { R: 195, Y0: 215, LEN: 430, PERIOD: 120 };

// 身体半径剖面（米）
function radiusAt(s) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let r = 5.4;
  r += (8.6 - 5.4) * sm(0.0, 0.14, s);
  r += (7.6 - 8.6) * sm(0.3, 0.6, s);
  r += (3.2 - 7.6) * sm(0.6, 0.92, s);
  r += (0.6 - 3.2) * sm(0.92, 1.0, s);
  return r;
}

function buildGeometry() {
  const parts = [];
  // ---- 身体管
  const NS = 360, NR = 20;
  parts.push({ kind: K.body, geo: gridGeo(NS + 1, NR + 1, (i, j) => {
    const s = i / NS, a = (j / NR) * Math.PI * 2, r = radiusAt(s);
    const c = Math.cos(a), sn = Math.sin(a);
    return { p: [r * c, r * sn, 0], n: [c, sn, 0], aux: [s, a, r, 0], s };
  }) });
  // ---- 背鳍（锯齿在片元里画），双面
  for (const flip of [false, true]) {
    parts.push({ kind: K.fin, geo: gridGeo(NS / 2 + 1, 2, (i, j) => {
      const s = 0.03 + (i / (NS / 2)) * 0.97, r = radiusAt(s);
      const h = 2.2 + 3.0 * Math.sin(Math.PI * Math.min(1, s * 1.3)) + 6.0 * Math.max(0, (s - 0.86) / 0.14);
      return { p: [0, r * 0.88 + j * h, 0], n: [flip ? -1 : 1, 0, 0], aux: [s, j, h, 0], s };
    }, { flip }) });
  }
  // ---- 头（上颌 + 颅骨）
  const headKeys = [
    [-6, 5.4, 5.4, 0], [-2, 6.4, 6.2, 0.6], [2.5, 7.0, 6.2, 1.3], [6.5, 6.2, 5.2, 1.8], [10, 5.0, 3.8, 1.0],
    [14, 4.2, 3.0, 0.3], [18, 4.4, 3.1, 0.4], [21, 4.6, 3.0, 0.5], [23.2, 3.4, 2.2, 0.2], [24.6, 1.2, 1.0, 0.0], [25, 0.05, 0.05, 0.0],
  ];
  parts.push({ kind: K.head, s: 0, geo: loftZ(headKeys, { radial: 24, sub: 4 }) });
  // 眉弓
  for (const sd of [-1, 1]) {
    parts.push({ kind: K.head, s: 0, geo: tube([[sd * 3.2, 4.4, 3], [sd * 4.6, 5.6, 7], [sd * 3.6, 4.6, 11]], [1.4, 1.5, 0.6], { radial: 8, sub: 4 }) });
    // 鼻孔鼓包
    parts.push({ kind: K.head, s: 0, geo: tube([[sd * 1.2, 2.4, 19.5], [sd * 2.6, 3.2, 22], [sd * 2.4, 2.0, 24.2]], [0.5, 1.3, 0.3], { radial: 8, sub: 3 }) });
  }
  // ---- 下颌（张嘴，着色器里绕支点开合）
  const jawKeys = [[0, 4.8, 1.6, -3.0], [6, 4.6, 1.6, -3.4], [12, 3.9, 1.3, -3.6], [18, 3.2, 1.1, -3.5], [21, 2.4, 0.9, -3.3], [22.4, 0.2, 0.2, -3.2]];
  parts.push({ kind: K.jaw, s: 0, geo: loftZ(jawKeys, { radial: 16, sub: 3 }) });
  // 獠牙
  for (const sd of [-1, 1]) {
    parts.push({ kind: K.horn, s: 0, geo: tube([[sd * 2.6, -0.8, 19.5], [sd * 2.9, -2.6, 19.8], [sd * 2.8, -3.8, 20.6]], [0.45, 0.3, 0.02], { radial: 6, sub: 2 }) });
  }
  // ---- 角（鹿角式，带分叉）
  for (const sd of [-1, 1]) {
    parts.push({ kind: K.horn, s: 0, geo: tube(
      [[sd * 2.6, 4.6, 3], [sd * 3.6, 8.2, -1], [sd * 5.0, 11.2, -7], [sd * 5.6, 12.6, -13], [sd * 5.0, 13.8, -19.5]],
      [1.4, 1.1, 0.8, 0.5, 0.06], { radial: 8, sub: 5 }) });
    parts.push({ kind: K.horn, s: 0, geo: tube([[sd * 4.2, 9.6, -3.5], [sd * 5.8, 13.4, -3.0], [sd * 6.6, 15.8, -0.6]], [0.65, 0.4, 0.05], { radial: 6, sub: 4 }) });
    parts.push({ kind: K.horn, s: 0, geo: tube([[sd * 5.4, 12.2, -11], [sd * 7.2, 15.2, -11.5], [sd * 8.2, 16.4, -9.8]], [0.45, 0.3, 0.04], { radial: 6, sub: 4 }) });
  }
  // ---- 龙须：两对，从鼻侧/嘴角甩出（aux.x = 沿须进度 → 着色器飘动）
  const wh = [
    [[3.8, -0.4, 21.5], [8, 0.6, 23], [14, 1.4, 18], [20, -0.6, 8], [24, -3, -6], [25, -5.5, -18]],
    [[3.6, -3.6, 15], [6, -6.5, 15], [9, -10, 10], [10, -14, 2], [9.5, -17, -6]],
  ];
  wh.forEach((pts, wi) => {
    for (const sd of [-1, 1]) {
      const P = pts.map(p => [sd * p[0], p[1], p[2]]);
      const n = P.length;
      parts.push({ kind: K.whisker, s: 0, geo: tube(P, P.map((_, i) => 0.42 * (1 - i / (n - 1)) + 0.05), {
        radial: 5, sub: 6, aux: (t) => [t, sd, wi * 2.1 + (sd > 0 ? 0 : 1.3), 0],
      }) });
    }
  });
  // ---- 鬃毛：后脑一圈向后飘的带状面
  const NM = 9;
  for (let m = 0; m < NM; m++) {
    const ang = Math.PI * (0.05 + 0.9 * (m / (NM - 1)));            // 上半圈
    const rx = Math.cos(ang), ry = Math.sin(ang);
    const root = [rx * 5.4, 1.5 + ry * 5.4, -3];
    const len = 22 + 8 * Math.sin(m * 1.7);
    const pts = [], w = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push([root[0] + rx * (2 + 6 * t), root[1] + ry * (1 + 4 * t) + 3 * t * t, root[2] - len * t]);
      w.push(1.8 * (1 - t) + 0.15);
    }
    const [g1, g2] = ribbon(pts, w, [-ry, rx, 0], { sub: 4, aux: (t, u) => [t, u, m * 1.3, 0] });
    parts.push({ kind: K.mane, s: 0, geo: g1 }, { kind: K.mane, s: 0, geo: g2 });
  }
  // ---- 尾端火焰状尾鬃
  for (let m = 0; m < 6; m++) {
    const ang = (m / 6) * Math.PI * 2 + 0.3;
    const rx = Math.cos(ang), ry = Math.sin(ang);
    const len = 20 + 6 * Math.sin(m * 2.1);
    const pts = [], w = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push([rx * (0.5 + 5 * t), ry * (0.5 + 5 * t) + 2 * t, -len * t]);
      w.push(2.2 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.08)) + 0.1);
    }
    const [g1, g2] = ribbon(pts, w, [-ry, rx, 0], { sub: 4, aux: (t, u) => [t, u, m * 0.9 + 4, 0] });
    parts.push({ kind: K.mane, s: 1, geo: g1 }, { kind: K.mane, s: 1, geo: g2 });
  }
  // ---- 四爪
  for (const [sLeg, ph] of [[0.13, 0], [0.52, 1.9]]) {
    const r = radiusAt(sLeg);
    for (const sd of [-1, 1]) {
      const phase = ph + (sd > 0 ? Math.PI : 0);
      const foot = [sd * (r + 4.6), -r - 8.5, 3];
      const aux = (t) => [t, sd, phase, r];
      parts.push({ kind: K.leg, s: sLeg, geo: tube(
        [[sd * r * 0.55, -r * 0.35, 0], [sd * (r + 2.5), -r - 1.2, -2.5], [sd * (r + 4.2), -r - 5.2, -1.5], foot],
        [2.6, 2.1, 1.5, 1.1], { radial: 8, sub: 5, aux }) });
      for (let c = -1; c <= 1; c++) {
        parts.push({ kind: K.leg, s: sLeg, geo: tube(
          [foot, [foot[0] + sd * 0.8 + c * 1.3, foot[1] - 0.6, foot[2] + 2.6], [foot[0] + sd * 1.2 + c * 1.9, foot[1] - 2.0, foot[2] + 3.6]],
          [0.55, 0.35, 0.04], { radial: 5, sub: 3, aux }) });
      }
    }
  }
  return mergeParts(parts);
}

const PATH_GLSL = /* glsl */`
uniform vec3 uC; uniform float uR, uY0, uLang, uOmega;
vec3 dragonQ(float s){
  float phi = uOmega * uTime - s * uLang;
  float R = uR + 38.0 * sin(phi * 3.0 + 1.0) + 13.0 * sin(6.2831 * s * 1.6 - uTime * 0.8);
  float y = uY0 + 55.0 * sin(phi * 2.0 + 0.6) + 16.0 * sin(6.2831 * s * 2.1 - uTime * 1.05);
  return vec3(uC.x + R * cos(phi), y, uC.z + R * sin(phi));
}
`;

// JS 版中心线（光场跟随龙头）
function dragonQ(t, s, C, R0, Y0, lang, omega) {
  const phi = omega * t - s * lang;
  const R = R0 + 38 * Math.sin(phi * 3 + 1) + 13 * Math.sin(6.2831 * s * 1.6 - t * 0.8);
  const y = Y0 + 55 * Math.sin(phi * 2 + 0.6) + 16 * Math.sin(6.2831 * s * 2.1 - t * 1.05);
  return [C.x + R * Math.cos(phi), y, C.z + R * Math.sin(phi)];
}

export function buildDragon(ctx, { uniforms, parent }) {
  const { L } = ctx;
  const C = L.MEGA.hero;
  const { R, Y0, LEN, PERIOD } = DRAGON;
  const omega = (Math.PI * 2) / PERIOD, lang = LEN / R;
  const geo = buildGeometry();
  const U = {
    ...uniforms,
    uC: { value: new THREE.Vector3(C.x, 0, C.z) }, uR: { value: R }, uY0: { value: Y0 },
    uLang: { value: lang }, uOmega: { value: omega }, uLen: { value: LEN },
  };
  const mat = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      ${HOLO_COMMON}
      ${HOLO_GLITCH}
      ${PATH_GLSL}
      attribute float aS; attribute float aKind; attribute vec4 aAux;
      varying vec3 vW; varying vec3 vN; varying float vS; varying float vKind; varying vec4 vAux; varying vec3 vL;
      void main(){
        float s = aS, kind = aKind;
        vec3 p = position, n = normal;
        vL = position;
        if (kind > 1.5 && kind < 2.5) {           // 下颌开合
          float ang = 0.22 + 0.12 * sin(uTime * 0.7);
          vec3 pv = vec3(0.0, -1.5, -1.0);
          p = pv + rotX(ang) * (p - pv); n = rotX(ang) * n;
        } else if (kind > 3.5 && kind < 4.5) {    // 龙须飘动
          float v = aAux.x, ph = aAux.z;
          p += vec3(sin(uTime * 0.9 - v * 4.0 + ph) * 3.5, sin(uTime * 1.3 - v * 5.0 + ph) * 3.0, 0.0) * v;
        } else if (kind > 5.5 && kind < 6.5) {    // 鬃毛 / 尾鬃
          float v = aAux.x, ph = aAux.z;
          p += vec3(sin(uTime * 1.1 - v * 3.5 + ph) * 2.5, sin(uTime * 1.4 - v * 4.0 + ph) * 2.5 + v * 1.5, 0.0) * v;
        } else if (kind > 6.5) {                  // 爪子划水
          float side = aAux.y, ph = aAux.z, r = aAux.w;
          vec3 pv = vec3(side * r * 0.55, -r * 0.35, 0.0);
          float ang = 0.55 * sin(uTime * 1.3 + ph);
          p = pv + rotX(ang) * (p - pv); n = rotX(ang) * n;
        }
        vec3 F = normalize(dragonQ(s - 0.003) - dragonQ(s + 0.003));
        vec3 Rt = normalize(cross(vec3(0.0, 1.0, 0.0), F));   // (Rt, Up, F) 右手系：局部绕序不翻转
        vec3 Up = cross(F, Rt);
        // 侧倾：沿身体缓慢翻滚，避免像火车
        float roll = 0.35 * sin(6.2831 * s * 1.2 - uTime * 0.6);
        vec3 R2 = cos(roll) * Rt + sin(roll) * Up;
        vec3 U2 = -sin(roll) * Rt + cos(roll) * Up;
        vec3 wp = dragonQ(s) + R2 * p.x + U2 * p.y + F * p.z;
        vec3 wn = normalize(R2 * n.x + U2 * n.y + F * n.z);
        wp = glitchOffset(wp, Rt, 4.7, 8.0, 10.0);
        vW = wp; vN = wn; vS = s; vKind = kind; vAux = aAux;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${HOLO_COMMON}
      ${HOLO_SHADE}
      uniform float uLen;
      varying vec3 vW; varying vec3 vN; varying float vS; varying float vKind; varying vec4 vAux; varying vec3 vL;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN);
        float rim = pow(1.0 - abs(dot(N, V)), 2.0);
        vec3 gold = vec3(1.0, 0.68, 0.20), cyan = vec3(0.25, 0.90, 1.0), white = vec3(1.0, 0.95, 0.85);
        float k = vKind;
        float I = 0.05 + rim * 1.3;
        vec3 base = gold;
        // 能量脉冲：从头流向尾
        float pulse = pow(0.5 + 0.5 * sin(vS * 40.0 - uTime * 2.2), 10.0) * 0.6;
        if (k < 0.5) {
          // 鳞片：错位排列的弧线
          float u = vS * uLen / 3.0;
          float v = vAux.y * vAux.z / 3.0;
          float row = floor(u);
          vec2 c = vec2(fract(v + 0.5 * mod(row, 2.0)) - 0.5, fract(u));
          float d = length(c * vec2(1.0, 1.15));
          float fw = fwidth(d) + 1e-3;
          float sc = 1.0 - smoothstep(0.06, 0.06 + fw * 1.5, abs(d - 0.5));
          float belly = smoothstep(-0.35, -0.75, sin(vAux.y));
          float plates = aaLine(vS * uLen / 4.0, 0.12);
          I += mix(sc * 0.32, plates * 0.45 + 0.08, belly) + pulse;
          base = mix(gold, white, belly * 0.6);
          base = mix(base, cyan, rim * 0.6);
        } else if (k < 2.5) {
          // 头：眼睛发光
          vec3 e = vec3(abs(vL.x) - 4.5, vL.y - 3.2, vL.z - 7.0);
          float eye = exp(-dot(e, e) / 1.2);
          I = 0.16 + rim * 1.6 + eye * 6.0;
          base = mix(mix(gold, cyan, rim * 0.5), vec3(1.0, 0.3, 0.15), eye);
          I += aaLine(vL.z / 2.5, 0.15) * 0.25;
        } else if (k < 3.5) {
          I = 0.35 + rim * 1.2;
          base = mix(white, gold, 0.4);
        } else if (k < 4.5) {
          I = 1.6 * (1.0 - vAux.x * 0.7);
          base = mix(gold, cyan, vAux.x);
        } else if (k < 5.5) {
          // 背鳍：锯齿
          float saw = fract(vS * uLen / 6.0);
          float mask = step(vAux.y, 1.0 - saw * 0.9);
          I = mask * (0.25 + 0.9 * vAux.y) * (1.0 - 0.5 * saw);
          base = mix(gold, cyan, 0.5 + 0.5 * vAux.y);
        } else if (k < 6.5) {
          I = (1.1 - vAux.x * 0.8) * (0.5 + 0.5 * aaLine(vAux.y * 2.0 + 0.5, 0.3));
          base = mix(cyan, gold, vAux.x * 0.6);
        } else {
          I = 0.12 + rim * 1.3 + pulse * 0.5;
          base = mix(gold, cyan, rim * 0.5);
        }
        float lines = aaLine(vW.y / 2.2 - uTime * 0.3, 0.3);
        I *= 0.85 + 0.35 * lines;
        vec3 col = base * I * holoFlicker(4.7);
        col *= holoFog(vW, 0.105) * 1.15;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'holoDragon';
  mesh.position.set(C.x, 0, C.z);  // 仅供包围盒；顶点在着色器里放到世界坐标（不用 modelMatrix）
  mesh.frustumCulled = false;
  mesh.userData.noBatch = true;
  mesh.renderOrder = 7;
  parent.add(mesh);

  // 光场：跟随龙头（金色），由 t 直接计算位置
  const head = ctx.lights.add({ position: new THREE.Vector3(...dragonQ(0, 0, C, R, Y0, lang, omega)), color: NEON.amber, intensity: 70, radius: 110 });
  const mid = ctx.lights.add({ position: new THREE.Vector3(...dragonQ(0, 0.4, C, R, Y0, lang, omega)), color: NEON.amber, intensity: 45, radius: 110 });
  ctx.onUpdate((dt, t) => {
    head.position.set(...dragonQ(t, 0.02, C, R, Y0, lang, omega));
    mid.position.set(...dragonQ(t, 0.4, C, R, Y0, lang, omega));
  });
  return mesh;
}
