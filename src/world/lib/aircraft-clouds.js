// aircraft-clouds —— 母舰周围的雨云：几片朝向主镜头的大型噪声云片，半遮挡舰体，
// 颜色按天空穹顶同一公式计算（与 core/sky.js 一致），再叠加母舰灯光从下方照亮的暖色。
import * as THREE from 'three';
import { ATMO } from '../../core/palette.js';

export function buildClouds(ctx, carrierRoot) {
  const { L } = ctx;
  const C = L.MEGA.carrier;
  const rng = ctx.rng('clouds');
  const cam = new THREE.Vector3(L.CAMS.hero[0], L.CAMS.hero[1], L.CAMS.hero[2]);
  // [dx, dy, dz, 宽, 高, 不透明度]（相对母舰中心；dz>0 = 更靠近镜头）
  const SPEC = [
    [-330, -10, 150, 420, 120, 0.9],
    [210, 30, 140, 380, 110, 0.85],
    [-60, 75, 120, 520, 120, 0.8],
    [-180, -95, 190, 460, 70, 0.55],
    [120, -110, 210, 520, 60, 0.5],
    [-460, 40, 60, 360, 140, 0.9],
    [380, 60, 40, 360, 160, 0.85],
  ];
  const pos = [], uv = [], seed = [], op = [], asp = [];
  const S = C.scale ?? 1;
  for (const [dx0, dy0, dz0, w0, h0, o] of SPEC) {
    const dx = dx0 * S, dy = dy0 * S, dz = dz0 * S, w = w0 * S, h = h0 * S;
    const c = new THREE.Vector3(C.x + dx, C.y - 30 * S + dy, C.z + dz);
    const ry = Math.atan2(cam.x - c.x, cam.z - c.z);
    const right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const sd = rng() * 50;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of corners) {
      pos.push(c.x + right.x * a * w / 2, c.y + b * h / 2, c.z + right.z * a * w / 2);
      uv.push((a + 1) / 2, (b + 1) / 2);
      seed.push(sd); op.push(o); asp.push(w / h);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute('aOp', new THREE.Float32BufferAttribute(op, 1));
  g.setAttribute('aAsp', new THREE.Float32BufferAttribute(asp, 1));
  g.computeVertexNormals();

  const uGlow = { value: new THREE.Vector3(C.x, C.y - 80, C.z) };
  const m = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.shared.uTime,
      uTop: { value: new THREE.Color(ATMO.skyTop) }, uHor: { value: new THREE.Color(ATMO.skyHor) },
      uCloud: { value: new THREE.Color(ATMO.cloudLit) }, uGlow,
      uGlowCol: { value: new THREE.Color(0xff9a6a).multiplyScalar(0.22) },
    },
    vertexShader: /* glsl */`
      attribute float aSeed, aOp, aAsp;
      varying vec2 vUv; varying vec3 vW; varying float vSeed, vOp, vAsp;
      void main(){
        vUv = uv; vSeed = aSeed; vOp = aOp; vAsp = aAsp;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW; varying float vSeed, vOp, vAsp;
      uniform float uTime; uniform vec3 uTop, uHor, uCloud, uGlow, uGlowCol;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float shape = 1.0 - smoothstep(0.35, 1.0, length(q * vec2(1.0, 1.15)));
        vec2 p = vec2(vUv.x * vAsp, vUv.y) * 1.6 + vSeed + vec2(uTime * 0.006, 0.0);
        float d = fbm(p + 0.6 * vec2(fbm(p * 1.7 + 3.1), fbm(p * 1.3 - 1.7)));
        float a = smoothstep(0.42, 0.78, d * (0.55 + 0.75 * shape)) * shape * vOp;
        // 与天空穹顶同公式的底色 + 云底被母舰/城市照亮
        vec3 dir = normalize(vW - cameraPosition);
        float y = max(dir.y, 0.0);
        vec3 sky = mix(uHor, uTop, pow(y, 0.45));
        vec3 col = sky * 0.9 + uCloud * 0.32 * d;
        float g = exp(-length(vW - uGlow) / 260.0);
        col += uGlowCol * g * (1.0 - vUv.y * 0.6) * (0.6 + d);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'carrier-clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = 13;          // 画在母舰灯点/光束之后，才能真正遮挡
  mesh.userData.noBatch = true;
  ctx.dynamicRoot.add(mesh);
  // 云底光源跟随母舰浮动
  ctx.onUpdate(() => { if (carrierRoot) uGlow.value.set(carrierRoot.position.x, carrierRoot.position.y - 80, carrierRoot.position.z); });
  return mesh;
}
