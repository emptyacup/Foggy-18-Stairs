// 全息巨人脚下：江面投影光环（同心环 + 旋转刻度）、向上的投影光柱、朝相机拉长的水面倒影光带。
// 全部是加法混合、不写深度的 ShaderMaterial；动画只依赖 uTime。
import * as THREE from 'three';
import { HOLO_COMMON, HOLO_SHADE } from './hologram-glsl.js';

export function buildBase(ctx, { x, z, yw, uniforms, parent }) {
  const R0 = 6, R1 = 64;

  // ---- 光环（水平圆盘）
  const ringGeo = new THREE.RingGeometry(R0, R1, 128, 4);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec2 vP;
      void main(){ vP = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${HOLO_COMMON}
      ${HOLO_SHADE}
      varying vec3 vW; varying vec2 vP;
      void main(){
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        float rr = r / ${R1.toFixed(1)};
        // 同心环
        float rings = aaLine(r / 4.0 - uTime * 0.12, 0.12) * 0.5;
        float main1 = exp(-pow((r - 22.0) / 0.8, 2.0)) * 2.2;
        float main2 = exp(-pow((r - 40.0) / 0.6, 2.0)) * 1.6;
        float main3 = exp(-pow((r - 58.0) / 1.2, 2.0)) * 0.9;
        // 旋转刻度：两圈方向相反
        float t1 = step(0.55, fract(a * 48.0 / 6.2831 + uTime * 0.05)) * smoothstep(1.2, 0.0, abs(r - 30.0) - 1.6);
        float t2 = step(0.8, fract(a * 96.0 / 6.2831 - uTime * 0.03)) * smoothstep(1.0, 0.0, abs(r - 46.0) - 2.4);
        // 扇形扫描
        float sweep = pow(fract((a / 6.2831) - uTime * 0.08), 6.0) * smoothstep(48.0, 20.0, r) * 0.8;
        float glow = exp(-r / 14.0) * 0.9;
        float I = rings + main1 + main2 + main3 + t1 * 0.9 + t2 * 0.7 + sweep + glow;
        I *= smoothstep(1.0, 0.85, rr);
        vec3 col = mix(vec3(0.15, 0.85, 1.0), vec3(1.0, 0.25, 0.8), smoothstep(30.0, 60.0, r) * 0.8);
        col *= I * holoFlicker(3.0) * holoFog(vW, 0.19) * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })));
  ring.position.set(x, yw + 0.25, z);
  ring.name = 'holoRing';

  // ---- 投影光柱（开口圆台）：从光环升起，向上淡出
  const beamH = 55;
  const beamGeo = new THREE.CylinderGeometry(19, 30, beamH, 72, 1, true);
  beamGeo.translate(0, beamH / 2, 0);
  const beam = new THREE.Mesh(beamGeo, ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${HOLO_COMMON}
      ${HOLO_SHADE}
      varying vec3 vW; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float edge = 1.0 - abs(dot(normalize(vN), V));
        float h = vUv.y;
        float fall = pow(1.0 - h, 2.2);
        float streak = 0.5 + 0.5 * vnoise(vec2(vUv.x * 90.0, h * 2.0 - uTime * 0.6));
        float I = fall * (0.10 + 0.35 * pow(edge, 2.0)) * streak;
        vec3 col = vec3(0.2, 0.75, 1.0) * I * holoFog(vW, 0.19);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })));
  beam.position.set(x, yw, z);
  beam.name = 'holoBeam';

  // ---- 水面倒影光带：从脚下朝相机方向拉长（方向在着色器里按相机实时计算）
  const strGeo = new THREE.PlaneGeometry(1, 1, 1, 16);
  const streak = new THREE.Mesh(strGeo, ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform vec3 uOrigin;
      varying vec3 vW; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec2 d = cameraPosition.xz - uOrigin.xz;
        float L = length(d);
        vec2 f = d / max(L, 1.0);
        vec2 s = vec2(-f.y, f.x);
        float len = clamp(L - 40.0, 40.0, 240.0);
        float along = uv.y * len;
        float w = mix(34.0, 18.0, uv.y);
        vec2 xz = uOrigin.xz + f * along + s * (uv.x - 0.5) * w;
        vW = vec3(xz.x, uOrigin.y + 0.15, xz.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${HOLO_COMMON}
      ${HOLO_SHADE}
      varying vec3 vW; varying vec2 vUv;
      void main(){
        float x = abs(vUv.x - 0.5) * 2.0;
        float along = vUv.y;
        float rip = 0.55 + 0.45 * sin(along * 160.0 + uTime * 3.0 + sin(vUv.x * 9.0 + uTime) * 1.5);
        float br = floor(along * 70.0);
        float gap = step(0.3, hh1(br + floor(uTime * 5.0) * 3.1));
        float core = exp(-x * x * 6.0);
        float a = core * pow(1.0 - along, 1.3) * rip * gap;
        vec3 c = mix(vec3(0.15, 0.8, 1.0), vec3(1.0, 0.25, 0.8), 0.35 + 0.35 * sin(along * 6.0 + uTime * 0.4));
        gl_FragColor = vec4(c * a * 0.75 * holoFog(vW, 0.19), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })));
  streak.name = 'holoStreak';
  streak.position.set(x, yw, z);   // 仅供包围盒；实际顶点在着色器中生成

  for (const m of [ring, beam, streak]) {
    m.frustumCulled = false;
    m.userData.noBatch = true;
    m.renderOrder = 6;
    parent.add(m);
  }
  return { ring, beam, streak };
}
