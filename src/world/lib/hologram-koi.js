// 全息锦鲤：两群共 24 条，8–20 m，红白 / 金色 / 少量青白。InstancedMesh（1 draw call）。
// 每条鱼的世界位置、朝向、尾巴摆动都在顶点着色器里由 uTime 计算：
//   群 0：绕全息巨人螺旋游动；群 1：在江对岸塔楼之间反向巡游。
import * as THREE from 'three';
import { gridGeo, loftZ, ribbon, mergeParts } from './hologram-geo.js';
import { HOLO_COMMON, HOLO_SHADE } from './hologram-glsl.js';
import { NEON } from '../../core/palette.js';

const K = { body: 0, tail: 1, dorsal: 2, pect: 3 };

function buildFish() {
  const parts = [];
  const bodyKeys = [
    [-0.40, 0.026, 0.040, 0.0], [-0.33, 0.034, 0.050, 0.0], [-0.20, 0.062, 0.085, 0.0], [-0.05, 0.095, 0.120, 0.004],
    [0.12, 0.115, 0.145, 0.010], [0.28, 0.108, 0.135, 0.010], [0.40, 0.080, 0.095, 0.004], [0.47, 0.045, 0.050, 0.0], [0.50, 0.004, 0.004, 0.0],
  ];
  parts.push({ kind: K.body, geo: loftZ(bodyKeys, { radial: 14, sub: 3, aux: (t, a, z) => [t, a, z, 0] }) });
  const topAt = (z) => {
    for (let i = 0; i < bodyKeys.length - 1; i++) {
      const a = bodyKeys[i], b = bodyKeys[i + 1];
      if (z >= a[0] && z <= b[0]) { const t = (z - a[0]) / (b[0] - a[0]); return (a[2] + (b[2] - a[2]) * t) + (a[3] + (b[3] - a[3]) * t); }
    }
    return 0;
  };
  // 蝴蝶尾：竖直的长飘带（分叉在片元里画）
  const tailPts = [], tailW = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    tailPts.push([0, 0, -0.36 - 0.46 * t]);
    tailW.push(0.04 + 0.24 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62));
  }
  for (const g of ribbon(tailPts, tailW, [0, 1, 0], { sub: 3, aux: (t, u) => [t, u, 0, 0] })) parts.push({ kind: K.tail, geo: g });
  // 背鳍
  for (const flip of [false, true]) {
    parts.push({ kind: K.dorsal, geo: gridGeo(12, 2, (i, j) => {
      const z = 0.24 - (i / 11) * 0.46;
      const h = 0.07 * Math.sin(Math.PI * (i / 11)) + 0.02;
      return { p: [0, topAt(z) - 0.01 + j * h, z], n: [flip ? -1 : 1, 0, 0], aux: [i / 11, j, 0, 0] };
    }, { flip }) });
  }
  // 胸鳍（长、飘逸）
  for (const sd of [-1, 1]) {
    const pts = [[sd * 0.08, -0.07, 0.26], [sd * 0.17, -0.12, 0.17], [sd * 0.25, -0.16, 0.04]];
    for (const g of ribbon(pts, [0.02, 0.06, 0.05], [0, 0, 1], { sub: 3, aux: (t, u) => [t, u, sd, 0] })) parts.push({ kind: K.pect, geo: g });
  }
  return mergeParts(parts);
}

const SCHOOL_GLSL = /* glsl */`
uniform vec3 uG; uniform vec3 uS1;
vec3 schoolPath(float school, float phi){
  if (school < 0.5) {
    float R = 74.0 + 14.0 * sin(phi * 2.0 + 0.7);
    float y = 70.0 + 34.0 * sin(phi * 1.5 + 0.3);
    return uG + vec3(R * cos(phi), y, R * sin(phi));
  }
  float y = 150.0 + 30.0 * sin(phi * 2.0 + 1.1);
  return uS1 + vec3(200.0 * cos(phi), y, 85.0 * sin(phi));
}
`;

export function buildKoi(ctx, { uniforms, parent }) {
  const { L } = ctx;
  const rng = ctx.rng('koi');
  const geo = buildFish();
  const N0 = 14, N1 = 10, N = N0 + N1;
  const aI = new Float32Array(N * 4), aO = new Float32Array(N * 3);
  const G = new THREE.Vector3(L.MEGA.holo.x, L.Y_RIVER, L.MEGA.holo.z);
  const S1 = new THREE.Vector3(L.MEGA.hero.x - 90, 0, L.MEGA.hero.z + 140);
  const inst = new THREE.InstancedMesh(geo, null, N);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const school = i < N0 ? 0 : 1;
    // 分成 3 小群：相位聚集
    const cluster = rng.int(0, 2);
    const phase = cluster * 2.1 + rng.range(-0.22, 0.22);
    const scale = rng.range(8, 20);
    aI.set([phase, school, scale, rng()], i * 4);
    aO.set([rng.range(-14, 14), rng.range(-10, 10), rng.range(-6, 6)], i * 3);
    const c = school === 0 ? G : S1;
    m4.makeTranslation(c.x, school === 0 ? 70 : 150, c.z);
    inst.setMatrixAt(i, m4);
  }
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 4));
  geo.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 3));

  const U = { ...uniforms, uG: { value: G }, uS1: { value: S1 } };
  inst.material = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      ${HOLO_COMMON}
      ${SCHOOL_GLSL}
      attribute float aKind; attribute vec4 aAux; attribute vec4 aI; attribute vec3 aO;
      varying vec3 vW; varying vec3 vN; varying float vKind; varying vec4 vAux; varying vec3 vL; varying float vSeed;
      void main(){
        float school = aI.y, scale = aI.z, seed = aI.w;
        float omega = school < 0.5 ? 6.2831 / 60.0 : -6.2831 / 95.0;
        float phi = omega * uTime + aI.x;
        vec3 p = position, n = normal;
        vL = position;
        // 尾巴摆动：越往后越大；鳍随之拖动
        float sw = sin(uTime * (2.4 + seed) + seed * 6.28 - p.z * 7.0);
        float amp = 0.10 * smoothstep(0.3, -0.8, p.z) + 0.012;
        p.x += sw * amp;
        if (aKind > 0.5 && aKind < 1.5) p.y += 0.03 * sin(uTime * 1.7 + seed * 5.0 - p.z * 6.0) * smoothstep(-0.4, -0.8, p.z);
        if (aKind > 2.5) p.y += 0.03 * sin(uTime * 2.2 + seed * 3.0) * aAux.x;
        vec3 C = schoolPath(school, phi);
        vec3 Fw = normalize(schoolPath(school, phi + sign(omega) * 0.01) - C);
        vec3 Rt = normalize(cross(vec3(0.0, 1.0, 0.0), Fw));
        vec3 Up = cross(Fw, Rt);
        float roll = 0.25 * sin(uTime * 0.7 + seed * 6.0);
        vec3 R2 = cos(roll) * Rt + sin(roll) * Up, U2 = -sin(roll) * Rt + cos(roll) * Up;
        // 群内偏移 + 各自缓慢漂移
        vec3 o = aO + vec3(sin(uTime * 0.31 + seed * 9.0) * 4.0, sin(uTime * 0.27 + seed * 7.0) * 3.0, sin(uTime * 0.2 + seed * 5.0) * 3.0);
        C += R2 * o.x + U2 * o.y + Fw * o.z;
        vec3 wp = C + (R2 * p.x + U2 * p.y + Fw * p.z) * scale;
        vN = normalize(R2 * n.x + U2 * n.y + Fw * n.z);
        vW = wp; vKind = aKind; vAux = aAux; vSeed = seed;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${HOLO_COMMON}
      ${HOLO_SHADE}
      varying vec3 vW; varying vec3 vN; varying float vKind; varying vec4 vAux; varying vec3 vL; varying float vSeed;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        vec3 white = vec3(1.0, 0.92, 0.88), red = vec3(1.0, 0.16, 0.08), gold = vec3(1.0, 0.66, 0.16), cyan = vec3(0.3, 0.9, 1.0);
        float type = vSeed;   // < 0.55 红白，< 0.85 金，其余 青白
        float pat = vnoise(vec2(vL.z * 9.0 + vSeed * 40.0, vL.x * 7.0 + vL.y * 9.0)) * 0.7 + vnoise(vec2(vL.z * 21.0, vL.y * 18.0 + vSeed * 13.0)) * 0.3;
        float spot = smoothstep(0.45, 0.55, pat) * step(0.0, vL.y + 0.04);  // 红斑多在背上
        vec3 bodyC = type < 0.55 ? mix(white, red, spot) : (type < 0.85 ? mix(gold, vec3(1.0, 0.85, 0.5), spot * 0.6) : mix(white, cyan, spot));
        float I;
        vec3 col;
        if (vKind < 0.5) {
          // 鳞片网格
          float sc = aaLine(vL.z * 26.0, 0.12) * 0.15;
          I = 0.30 + rim * 1.5 + sc;
          col = mix(bodyC, cyan, rim * 0.35) * I;
          // 眼睛
          vec3 e = vec3(abs(vL.x) - 0.06, vL.y - 0.03, vL.z - 0.40);
          col += vec3(1.0) * exp(-dot(e, e) / 0.0004) * 2.0;
        } else {
          // 鳍：半透明、鳍条、分叉尾
          float t = vAux.x, u = vAux.y;
          float rays = 0.55 + 0.45 * aaLine(u * 6.0 + 0.5, 0.25);
          float fork = vKind < 1.5 ? smoothstep(0.0, 0.25, abs(u) - (1.0 - t) * 0.2 + 0.05 * t) : 1.0;
          float edge = vKind < 1.5 ? smoothstep(1.0, 0.85, abs(u)) : 1.0;
          I = (0.55 + 0.6 * t) * rays * fork * edge * (1.0 - 0.5 * t);
          col = mix(bodyC, white, 0.4) * I;
        }
        col *= holoFlicker(vSeed * 10.0) * holoFog(vW, 0.13) * 1.1;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  inst.name = 'holoKoi';
  inst.frustumCulled = false;
  inst.userData.noBatch = true;
  inst.renderOrder = 7;
  parent.add(inst);

  // 光场：跟随巨人身边那群（品红偏暖）
  const lt = ctx.lights.add({ position: new THREE.Vector3(G.x, 70, G.z), color: NEON.pink, intensity: 30, radius: 70 });
  ctx.onUpdate((dt, t) => {
    const phi = (Math.PI * 2 / 60) * t + 2.1;
    lt.position.set(G.x + 74 * Math.cos(phi), 70 + 34 * Math.sin(phi * 1.5 + 0.3), G.z + 74 * Math.sin(phi));
  });
  return inst;
}
