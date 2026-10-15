// 天空与大气：低垂的雨云被城市灯光从下方照亮（光污染），加上指数雾。
import * as THREE from 'three';
import { ATMO, LIGHTING } from './palette.js';

export function createSky(scene, shared) {
  scene.fog = new THREE.FogExp2(ATMO.fog, 0.012);
  scene.background = new THREE.Color(ATMO.skyTop);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uTop: { value: new THREE.Color(ATMO.skyTop) },
      uHor: { value: new THREE.Color(ATMO.skyHor) },
      uCloud: { value: new THREE.Color(ATMO.cloudLit) },
      uFog: { value: new THREE.Color(ATMO.fog) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uTime; uniform vec3 uTop, uHor, uCloud, uFog;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(uHor, uTop, pow(y, 0.45));
        // 云底：投影到云层平面
        vec2 uv = d.xz / max(d.y, 0.04) * 0.6 + vec2(uTime * 0.004, uTime * 0.002);
        float c = fbm(uv * 1.3);
        float lit = smoothstep(0.35, 0.85, c) * (1.0 - smoothstep(0.0, 0.7, y));
        col += uCloud * lit * 0.55;
        // 地平线以下融入雾色
        col = mix(col, uFog, smoothstep(0.08, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  mat.userData.ctxMat = true; mat.userData.custom = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), mat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  dome.userData.noBatch = true;
  scene.add(dome);

  // 环境光：天空紫、地面暗；一盏很弱的"城市辉光"方向光给体积感
  const hemi = new THREE.HemisphereLight(0x6a5a9a, 0x1c1822, 1.5);
  scene.add(hemi);
  const glow = new THREE.DirectionalLight(0x8a6aa0, 0.45);
  glow.position.set(-30, 60, -120);
  scene.add(glow);

  const bases = new WeakMap();
  function setDaylight(day) {
    const p = day ? LIGHTING.day : LIGHTING.night;
    if (shared.uDaylight) shared.uDaylight.value = day ? 1 : 0;
    scene.fog.color.setHex(p.fog);
    scene.fog.density = p.density;
    scene.background.setHex(p.skyTop);
    mat.uniforms.uTop.value.setHex(p.skyTop);
    mat.uniforms.uHor.value.setHex(p.skyHor);
    mat.uniforms.uCloud.value.setHex(p.cloudLit);
    mat.uniforms.uFog.value.copy(scene.fog.color);
    shared.uSkyTop?.value.setHex(p.skyTop);
    shared.uSkyHor?.value.setHex(p.skyHor);
    hemi.color.setHex(p.skyLight); hemi.groundColor.setHex(p.groundLight); hemi.intensity = p.hemi;
    glow.color.setHex(p.glowColor); glow.intensity = p.glow;
    // 远景自定义 shader 不读取 Three.js 雾，保留其 uniform 对象并原位更新。
    const seen = new Set();
    scene.traverse(o => {
      for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
        const u = m.uniforms;
        if (!u || seen.has(u)) continue;
        seen.add(u);
        if (u.uFogDensity) u.uFogDensity.value = p.density;
        if (u.fogDensity) u.fogDensity.value = p.density;
        if (u.uFogColor) u.uFogColor.value.copy(scene.fog.color);
        if (u.uFogK?.value?.isVector4) {
          if (!bases.has(u.uFogK)) bases.set(u.uFogK, u.uFogK.value.clone());
          const b = bases.get(u.uFogK);
          u.uFogK.value.set(b.x * p.megaFog, b.y * p.megaFog, b.z, b.w);
        }
        for (const [key, color] of [['uFogLow', p.fog], ['uFogHigh', p.skyTop], ['uBase', p.skyHor], ['uSky', p.skyLight]]) {
          if (!u[key]?.value?.isColor) continue;
          const uniform = u[key];
          if (!bases.has(uniform)) bases.set(uniform, uniform.value.clone());
          if (day) uniform.value.setHex(color); else uniform.value.copy(bases.get(uniform));
        }
      }
    });
    return p;
  }
  setDaylight(shared.uDaylight?.value > 0.5);
  return {
    dome, hemi, glow,
    setDaylight,
    update(t, camera) { dome.position.copy(camera.position); },
  };
}
