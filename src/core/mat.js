// 共享材质库 —— 模块只能通过 ctx.mat 拿材质（check.mjs 会拦截自建材质）。
// 所有"受光"材质 = MeshStandardMaterial + 注入：
//   1) 霓虹光场（lights.js）漫反射 + 高光
//   2) 雨天湿润：朝上的面变暗、变光滑，并带积水斑（与 post.js 的 SSR 共用同一 puddle 函数）
import * as THREE from 'three';
import { MAX_LIGHTS, LIGHTFIELD_DECL } from './lights.js';
import { BASE } from './palette.js';

// 与 post.js 保持一致的积水函数（世界 XZ → 0..1）
export const PUDDLE_GLSL = /* glsl */`
float cqHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cqNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(cqHash(i), cqHash(i+vec2(1,0)), u.x), mix(cqHash(i+vec2(0,1)), cqHash(i+vec2(1,1)), u.x), u.y);
}
float puddleField(vec2 xz){
  vec2 warp = vec2(cqNoise(xz*0.72), cqNoise(xz*0.72+17.0)) - 0.5;
  vec2 p = xz + warp * 0.65;
  return cqNoise(p*0.35)*0.58 + cqNoise(p*1.1)*0.3 + cqNoise(p*3.7)*0.12;
}
float puddle(vec2 xz){ return smoothstep(0.505, 0.545, puddleField(xz)); }
// 积水外围的一圈"半干湿痕"：比普通湿面更暗、更光滑，让水潭边缘自然过渡
float puddleDamp(vec2 xz){ return smoothstep(0.40, 0.52, puddleField(xz)); }
vec2 rippleLayer(vec2 xz, float time, float cellSize, float rate, float amp){
  vec2 grid = floor(xz / cellSize), slope = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = grid + vec2(float(x), float(y));
      float seed = cqHash(cell);
      vec2 center = (cell + 0.15 + vec2(seed, cqHash(cell+23.0))*0.7)*cellSize;
      vec2 delta = xz-center;
      float d = length(delta), age = fract(time*rate + seed*7.0);
      float radius = 0.03 + age*cellSize*0.5;
      float wave = (d-radius)*110.0;
      float distanceToRing = (d-radius)/0.03;
      float envelope = exp(-distanceToRing*distanceToRing) * sin(age*3.14159) * (1.0-age);
      slope += delta/max(d, 0.005) * cos(wave) * envelope * amp;
    }
  }
  return slope;
}
// 世界坐标下的连续雨滴波纹坡度（大小两层）；材质与 SSR 共用，避免反射与表面跳动不同步。
vec2 rainRipple(vec2 xz, float time){
  return rippleLayer(xz, time, 0.85, 0.72, 0.075) + rippleLayer(xz + 3.1, time + 0.37, 0.42, 1.05, 0.05);
}
`;

function injectStandard(material, field, shared, wet) {
  material.defines = material.defines || {};
  if (wet > 0) material.defines.WET = '';
  const uWet = { value: wet };
  material.userData.uWet = uWet;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLPos = field.uPos;
    shader.uniforms.uLCol = field.uCol;
    shader.uniforms.uLCount = field.uCount;
    shader.uniforms.uRain = shared.uRain;
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWet = uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 wp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
        vWPos = (modelMatrix * wp).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec3 vWPos;
      ${LIGHTFIELD_DECL}
      uniform float uRain;
      uniform float uTime;
      uniform float uWet;
      ${PUDDLE_GLSL}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
      #ifdef WET
      {
        float up = smoothstep(0.55, 0.92, nW.y);
        float pud = puddle(vWPos.xz);
        float damp = puddleDamp(vWPos.xz);
        float w = uWet * uRain;
        float wu = w * up * mix(0.55, 1.0, max(pud, damp * 0.6));
        roughnessFactor = mix(roughnessFactor, mix(mix(0.30, 0.16, damp), 0.025, pud), wu);
        diffuseColor.rgb *= mix(1.0, mix(mix(0.66, 0.5, damp), 0.34, pud), wu);
        diffuseColor.rgb *= mix(1.0, 0.78, w * (1.0 - up) * 0.6);
        if (up > 0.01 && w > 0.01) {
          vec2 edge = vec2(puddle(vWPos.xz+vec2(0.035,0.0))-pud, puddle(vWPos.xz+vec2(0.0,0.035))-pud);
          vec2 ripple = edge * 0.13;
          if (pud > 0.01) ripple += rainRipple(vWPos.xz, uTime) * pud;
          nW = normalize(nW + vec3(ripple.x, 0.0, ripple.y) * w * up);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }
      }
      #endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 Vw = normalize(cameraPosition - vWPos);
        float gl = 1.0 - roughnessFactor;
        float shin = mix(4.0, 260.0, gl * gl);
        vec3 acc = vec3(0.0), spc = vec3(0.0);
        for (int i = 0; i < ${MAX_LIGHTS}; i++) {
          if (i >= uLCount) break;
          vec4 lp = lfPos(i);
          vec3 d = lp.xyz - vWPos;
          float d2 = dot(d, d);
          if (d2 > lp.w * lp.w) continue;
          float dist = sqrt(d2);
          vec3 L = d / max(dist, 1e-3);
          float att = 1.0 - dist / lp.w; att *= att;
          att /= (1.0 + d2 * 0.05);
          float ndl = max(dot(nW, L), 0.0);
          vec3 lc = lfCol(i).rgb;
          acc += lc * att * (ndl * 0.85 + 0.15);
          vec3 H = normalize(L + Vw);
          spc += lc * att * ndl * pow(max(dot(nW, H), 0.0), shin);
        }
        reflectedLight.directDiffuse += diffuseColor.rgb * acc;
        reflectedLight.directSpecular += spc * gl * (shin + 8.0) * 0.04;
      }`);
  };
  material.customProgramCacheKey = () => 'cq-lf-' + (wet > 0 ? 'w' : 'd');
  material.userData.ctxMat = true;
  return material;
}

export class MaterialLib {
  constructor(field, shared) {
    this.field = field;
    this.shared = shared;
    this.cache = new Map();
  }

  _key(o) {
    // 先把纹理换成 uuid：JSON.stringify 会在 replacer 之前调用 Texture.toJSON（会 toDataURL 整张 canvas）
    const flat = {};
    for (const [k, v] of Object.entries(o)) flat[k] = v && v.isTexture ? 'tex:' + v.uuid : v;
    return JSON.stringify(flat);
  }

  // 通用受光材质
  // { color, roughness=0.85, metalness=0, wet=1, map, emissive, emissiveMap, emissiveIntensity, vertexColors, side, flat }
  std(o = {}) {
    const key = 'std' + this._key(o);
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: o.color ?? 0x808080,
      roughness: o.roughness ?? 0.85,
      metalness: o.metalness ?? 0,
      map: o.map || null,
      emissive: o.emissive ?? 0x000000,
      emissiveMap: o.emissiveMap || null,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      vertexColors: !!o.vertexColors,
      side: o.side ?? THREE.FrontSide,
      flatShading: !!o.flat,
      alphaTest: o.alphaTest ?? 0,       // 镂空（防盗网、栏杆格栅）用 alphaTest，不用半透明
      transparent: o.opacity != null && o.opacity < 1,   // 半透明（塑料伞、玻璃）：需排序，不参与合批
      opacity: o.opacity ?? 1,
      depthWrite: !(o.opacity != null && o.opacity < 1),
    });
    injectStandard(m, this.field, this.shared, o.wet ?? 1);
    this.cache.set(key, m);
    return m;
  }

  // 预设表面。name ∈ asphalt stone concrete concreteDk tile tilePink tileGreen plaster brick grime metal metalDk rust glass wood plastic tarpRed
  surface(name, extra = {}) {
    const P = {
      asphalt:    { color: BASE.asphalt, roughness: 0.9 },
      stone:      { color: BASE.stone, roughness: 0.8 },
      concrete:   { color: BASE.concrete, roughness: 0.92 },
      concreteDk: { color: BASE.concreteDk, roughness: 0.92 },
      tile:       { color: BASE.tileWhite, roughness: 0.45 },
      tilePink:   { color: BASE.tilePink, roughness: 0.5 },
      tileGreen:  { color: BASE.tileGreen, roughness: 0.5 },
      plaster:    { color: BASE.plaster, roughness: 0.95 },
      brick:      { color: BASE.brick, roughness: 0.9 },
      grime:      { color: BASE.grime, roughness: 0.95 },
      metal:      { color: BASE.metal, roughness: 0.45, metalness: 0.6 },
      metalDk:    { color: BASE.metalDk, roughness: 0.5, metalness: 0.5 },
      rust:       { color: BASE.rust, roughness: 0.8, metalness: 0.3 },
      glass:      { color: BASE.glassDk, roughness: 0.08, metalness: 0.2 },
      wood:       { color: BASE.wood, roughness: 0.85 },
      plastic:    { color: BASE.plastic, roughness: 0.5 },
      tarpRed:    { color: BASE.tarpRed, roughness: 0.6 },
    }[name];
    if (!P) throw new Error('unknown surface ' + name);
    return this.std({ ...P, ...extra });
  }

  // 霓虹灯管 / 发光体：不受光，HDR 颜色（intensity>1 会触发 bloom）
  neon(color, intensity = 3, extra = {}) {
    const key = 'neon' + this._key({ color, intensity, ...extra });
    if (this.cache.has(key)) return this.cache.get(key);
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const m = new THREE.MeshBasicMaterial({ color: c, map: extra.map || null, side: extra.side ?? THREE.FrontSide, fog: true, vertexColors: !!extra.vertexColors });
    m.userData.ctxMat = true;
    this.cache.set(key, m);
    return m;
  }

  // 带贴图的发光面（灯箱、LED 屏、窗户）
  emissiveMap(map, intensity = 2, extra = {}) {
    return this.neon(0xffffff, intensity, { ...extra, map });
  }

  // 加法混合的辉光（体积光锥、光晕、雾中灯光）：不写深度
  glow(color = 0xffffff, intensity = 1, extra = {}) {
    const key = 'glow' + this._key({ color, intensity, ...extra });
    if (this.cache.has(key)) return this.cache.get(key);
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: extra.map || null, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: extra.side ?? THREE.DoubleSide,
      vertexColors: !!extra.vertexColors, fog: false,   // 加法混合下雾会叠加出色块，故关闭
    });
    m.userData.ctxMat = true;
    this.cache.set(key, m);
    return m;
  }

  // 登记模块自定义 ShaderMaterial（雨、体积光等特殊效果）。必须走这里，check 才认。
  custom(material) {
    material.userData.ctxMat = true;
    material.userData.custom = true;
    return material;
  }
}
