// 光柱（塔顶刺入云层）、探照灯（扫云底）、被城市照亮的低云层。全部加法 / 透明 shader，动画只由 t 决定。
import * as THREE from 'three';
import { COMMON_GLSL, megaUniforms, CLOUD_Y } from './megacity-gl.js';
import { ATMO } from '../../core/palette.js';

const MAXL = 24;

// ------------------------------------------------------------------ 体积光束（光柱 / 探照灯共用）
function beamMaterial(ctx, color, intensity, { pillar = false } = {}) {
  const U = megaUniforms(ctx);
  return ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK,
      uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uCloudY: { value: CLOUD_Y },
    },
    defines: pillar ? { PILLAR: '' } : {},
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying float vT;
      void main(){
        vT = uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${COMMON_GLSL}
      uniform vec3 uColor; uniform float uCloudY;
      varying vec3 vW; varying vec3 vN; varying float vT;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float core = pow(abs(dot(normalize(vN), V)), 2.2);
        float t = clamp(vT, 0.0, 1.0);
        #ifdef PILLAR
        float along = smoothstep(0.0, 0.02, t) * (1.0 - 0.6 * t);
        #else
        float along = smoothstep(0.0, 0.03, t) * pow(1.0 - t, 1.3);
        #endif
        // 雨雾里的颗粒 / 流动
        float n = mnoise(vec2(vW.y * 0.02 - uTime * 0.6, (vW.x + vW.z) * 0.05)) * 0.5 + 0.6;
        float cloud = 1.0 - 0.75 * smoothstep(uCloudY - 20.0, uCloudY + 120.0, vW.y);
        float T = exp(-fogOptical(cameraPosition, vW) * 0.6);
        gl_FragColor = vec4(uColor * core * along * n * cloud * T, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
}

// 圆锥 / 圆柱，原点在底部，沿 +Y；uv.y = 0..1 沿长度
function beamGeo(r0, r1, len) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 24, 8, true);
  g.translate(0, len / 2, 0);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setY(i, p.getY(i) / len);
  return g;
}

// ------------------------------------------------------------------ 低云层
function cloudMaterial(ctx) {
  const U = megaUniforms(ctx);
  const lit = new THREE.Color(ATMO.skyHor);
  return ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK,
      uBase: { value: lit },
      uLP: { value: Array.from({ length: MAXL }, () => new THREE.Vector4(0, 0, 1, 0)) },   // x, z, 半径, 强度
      uLC: { value: Array.from({ length: MAXL }, () => new THREE.Color()) },
      uLN: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      ${COMMON_GLSL}
      uniform vec3 uBase; uniform vec4 uLP[${MAXL}]; uniform vec3 uLC[${MAXL}]; uniform int uLN;
      varying vec3 vW;
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * mnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main(){
        vec2 p = vW.xz * 0.0028 + vec2(uTime * 0.006, uTime * 0.003);
        float c = fbm(p);
        float c2 = fbm(p * 2.7 + 3.0);
        float dens = smoothstep(0.3, 0.75, c * 0.75 + c2 * 0.35);
        vec3 light = vec3(0.0);
        for (int i = 0; i < ${MAXL}; i++) {
          if (i >= uLN) break;
          vec2 d = vW.xz - uLP[i].xy;
          float r = uLP[i].z;
          light += uLC[i] * uLP[i].w * exp(-dot(d, d) / (r * r));
        }
        vec3 col = uBase * (0.35 + 0.5 * dens) + light * (0.35 + 0.9 * dens);
        float dist = length(vW - cameraPosition);
        float a = (0.55 + 0.4 * dens) * smoothstep(2600.0, 1500.0, dist) * smoothstep(-2900.0, -2300.0, vW.z) * smoothstep(1900.0, 1300.0, abs(vW.x));
        float T = exp(-fogOptical(cameraPosition, vW) * 0.35);
        col = col * T + fogCol(vW.y) * (1.0 - T) * 0.6;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
}

// tops: 塔顶列表；screens: [{pos, color}]；返回 update(t)
export function buildBeams(ctx, parent, tops, screens, glows) {
  const rng = ctx.rng('beams');
  const items = [];

  // ---- 光柱：雾都塔 + 3 座高塔
  const hero = tops.find(t => t.hero);
  const cand = tops.filter(t => !t.hero && t.y > 330 && Math.abs(t.x) < 700).sort((a, b) => b.y - a.y);
  const pillars = [];
  if (hero) pillars.push({ x: hero.x, y: hero.y, z: hero.z, r: 7, color: 0xdfeeff, i: 1.6 });
  const pc = [0x22e6ff, 0xff2fd0, 0x8a5cff];
  for (let k = 0, n = 0; k < cand.length && n < 3; k++) {
    const t = cand[k];
    if (pillars.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 250)) continue;
    pillars.push({ x: t.x, y: t.y, z: t.z, r: 4.5, color: pc[n], i: 1.3 }); n++;
  }
  for (const p of pillars) {
    const len = 2100 - p.y;
    for (const [rr, ii] of [[p.r, p.i], [p.r * 3.5, p.i * 0.18]]) {
      const m = new THREE.Mesh(beamGeo(rr, rr * 1.3, len), beamMaterial(ctx, p.color, ii, { pillar: true }));
      m.position.set(p.x, p.y, p.z); m.name = 'lightPillar'; m.userData.noBatch = true; m.renderOrder = 7; m.frustumCulled = false;
      parent.add(m);
    }
    glows.add([p.x, p.y + 3, p.z], p.color, 30, 3.5);
    items.push({ kind: 'pillar', x: p.x, z: p.z, color: new THREE.Color(p.color), r: 160, i: 1.2 });
  }

  // ---- 探照灯：6 束，从塔顶射向云底缓慢扫动
  const sl = tops.filter(t => !t.hero && t.y > 220 && t.y < 620 && Math.abs(t.x) < 800 && !pillars.some(p => p.x === t.x && p.z === t.z));
  const lights = [];
  for (let k = 0; k < 6 && sl.length; k++) {
    const t = sl.splice(Math.floor(rng() * sl.length), 1)[0];
    const color = rng.pick([0xdfeeff, 0xdfeeff, 0x22e6ff, 0xff5fa8]);
    const g = new THREE.Group();
    g.position.set(t.x, t.y + 2, t.z);
    const len = 1100;
    const m = new THREE.Mesh(beamGeo(1.5, 46, len), beamMaterial(ctx, color, 0.5));
    m.userData.noBatch = true; m.renderOrder = 7; m.frustumCulled = false; m.name = 'searchlight';
    g.add(m);
    parent.add(g);
    glows.add([t.x, t.y + 3, t.z], color, 14, 4);
    lights.push({ g, color: new THREE.Color(color), ph: rng.range(0, 6.28), sp: rng.range(0.12, 0.25), tilt: rng.range(0.25, 0.55), az0: rng.range(-0.8, 0.8), sw: rng.range(0.5, 1.1) });
  }

  // ---- 云层
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(4200, 3400, 1, 1), cloudMaterial(ctx));
  cloud.rotation.x = Math.PI / 2;
  cloud.position.set(0, CLOUD_Y, -1150);
  cloud.name = 'megaCloud'; cloud.userData.noBatch = true; cloud.renderOrder = 6; cloud.frustumCulled = false;
  parent.add(cloud);
  const cu = cloud.material.uniforms;

  const q = new THREE.Quaternion(), e = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  function update(t) {
    let n = 0;
    const put = (x, z, r, i, c) => { if (n >= MAXL) return; cu.uLP.value[n].set(x, z, r, i); cu.uLC.value[n].copy(c); n++; };
    for (const it of items) put(it.x, it.z, it.r, it.i, it.color);
    for (const s of screens) put(s.pos.x, s.pos.z, 220, 0.9, s.color);
    for (const L of lights) {
      const az = L.az0 + Math.sin(t * L.sp + L.ph) * L.sw;
      const tilt = L.tilt + 0.12 * Math.sin(t * L.sp * 1.7 + L.ph * 2.0);
      e.set(tilt * Math.cos(az), 0, tilt * Math.sin(az));
      q.setFromEuler(e);
      L.g.quaternion.copy(q);
      dir.copy(up).applyQuaternion(q);
      const p = L.g.position;
      const k = (CLOUD_Y - p.y) / Math.max(dir.y, 0.05);
      put(p.x + dir.x * k, p.z + dir.z * k, 90, 1.6, L.color);
    }
    cu.uLN.value = n;
  }
  return { update, pillars, lights };
}
