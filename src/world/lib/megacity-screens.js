// 巨型屏幕：LED 点阵 shader（近看是像素点、远看自动平滑）、扫描线、故障撕裂、色差，
// 内容来自 megacity-art 的程序化画面；动画全部由时间 t 决定。每块屏幕带雾中光晕与江面倒影。
import * as THREE from 'three';
import { COMMON_GLSL, MIRROR_VERT_GLSL, MIRROR_FRAG_GLSL, megaUniforms } from './megacity-gl.js';
import { SCREENS } from './megacity-plan.js';
import { maskAtlas, portraitAtlas, eyeTex, adAtlas, subTex, EYE } from './megacity-art.js';

const MODE = { atlas: 0, eye: 1, scroll: 2, qr: 3 };

const SCREEN_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform vec4 uAtlas;      // 帧数, 帧 A, 帧 B, 过渡进度
  uniform float uMode, uTrans, uGlitch, uBright, uScroll, uRep, uSeed;
  uniform vec2 uLed;
  uniform vec4 uEye;        // 虹膜中心 uv(x, y)、半径（u 单位）、纵横比 W/H
  uniform vec2 uEyeAnim;    // 眼睑闭合 0..1，瞳孔半径（相对虹膜）
  uniform vec3 uAura;

  vec3 samp(float f, vec2 uv, float bias){
    uv = clamp(uv, vec2(0.002), vec2(0.998));
    return texture2D(uTex, vec2((f + uv.x) / uAtlas.x, uv.y), bias).rgb;
  }
  // 眼睛：画布像素坐标里的上下眼睑抛物线（与 megacity-art 的贝塞尔眼形一致）
  float lidUp(float x){ return 0.000747 * (x - 779.0) * (x - 779.0) + 141.0; }
  float lidLo(float x){ return 486.0 - 0.000473 * (x - 786.0) * (x - 786.0); }
  vec3 eyeContent(vec2 uv, float bias){
    vec2 px = vec2(uv.x * 1536.0, (1.0 - uv.y) * 640.0);
    float up = lidUp(px.x), lo = lidLo(px.x);
    float inEye = step(250.0, px.x) * step(px.x, 1300.0);
    float edge = mix(up, lo, uEyeAnim.x);
    if (inEye > 0.5 && uEyeAnim.x > 0.001 && px.y < edge && px.y > up - 140.0) {
      float k = (px.y - (up - 140.0)) / max(edge - (up - 140.0), 1.0);
      float sy = px.y - (edge - up) * k;
      return texture2D(uTex, vec2(uv.x, 1.0 - sy / 640.0), bias).rgb;
    }
    // 虹膜：瞳孔缩放（径向重映射纹理）
    vec2 c = vec2(uEye.x, uEye.y);
    vec2 d = (uv - c) * vec2(1.0, 1.0 / uEye.w);
    float r = length(d) / uEye.z;
    if (r < 1.0) {
      float p = uEyeAnim.y;
      if (r < p) {
        vec3 pc = vec3(0.004, 0.006, 0.01);
        pc += vec3(0.1, 0.9, 1.0) * 0.25 * (1.0 - smoothstep(0.0, p, r)) * (0.5 + 0.5 * sin(uTime * 3.0));
        return pc;
      }
      float r2 = mix(0.28, 1.0, (r - p) / (1.0 - p));
      vec2 q = c + normalize(d + 1e-5) * r2 * uEye.z * vec2(1.0, uEye.w);
      vec3 ic = texture2D(uTex, q, bias).rgb;
      ic *= smoothstep(p, p + 0.04, r);
      // 角膜高光（固定在左上）
      vec2 hl = (d / uEye.z) - vec2(-0.32, 0.36);
      ic += vec3(1.0) * (1.0 - smoothstep(0.08, 0.11, length(hl * vec2(0.8, 1.2))));
      ic += vec3(0.8, 0.95, 1.0) * (1.0 - smoothstep(0.03, 0.05, length((d / uEye.z) - vec2(0.25, -0.3))));
      return ic;
    }
    return texture2D(uTex, uv, bias).rgb;
  }
  vec3 qrContent(vec2 uv){
    vec2 g = uv * 33.0 - 2.0;
    vec2 cell = floor(g);
    vec3 bg = vec3(0.03, 0.01, 0.07);
    float epoch = floor(uTime / 3.5);
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x > 28.0 || cell.y > 28.0) return bg;
    float on = step(0.5, mh2(cell + epoch * 17.0 + uSeed));
    // 三个定位角
    for (int k = 0; k < 3; k++) {
      vec2 o = k == 0 ? vec2(0.0) : (k == 1 ? vec2(22.0, 0.0) : vec2(0.0, 22.0));
      vec2 l = cell - o;
      if (l.x >= -1.0 && l.y >= -1.0 && l.x <= 7.0 && l.y <= 7.0) {
        float m = max(abs(l.x - 3.0), abs(l.y - 3.0));
        on = (m <= 1.0 || m == 3.0) ? 1.0 : 0.0;
      }
    }
    vec2 f = fract(g);
    float sq = step(0.08, f.x) * step(f.x, 0.92) * step(0.08, f.y) * step(f.y, 0.92);
    vec3 c = mix(vec3(0.75, 0.35, 1.0), vec3(0.3, 0.95, 1.0), uv.y);
    float scan = exp(-pow((uv.y - fract(uTime * 0.35)) * 25.0, 2.0));
    vec3 col = mix(bg, c, on * sq) + vec3(0.6, 1.0, 1.0) * scan * 0.8;
    float inv = step(0.92, mh1(floor(uTime * 2.0) + uSeed));
    return mix(col, vec3(0.9) - col * 0.8, inv);
  }
  vec3 content(vec2 uv, float bias){
    if (uMode < 0.5) {
      vec3 a = samp(uAtlas.y, uv, bias);
      if (uAtlas.w <= 0.0) return a;
      vec3 b = samp(uAtlas.z, uv, bias);
      if (uTrans > 0.5) {
        // 变脸：一道水袖从右上扫到左下，扫过处换脸
        float x = uv.x + (uv.y - 0.5) * 0.45;
        float dd = x - (uAtlas.w * 1.7 - 0.35);
        vec3 c = dd < 0.0 ? b : a;
        float band = 1.0 - smoothstep(0.0, 0.13, abs(dd));
        vec3 silk = vec3(0.55, 0.02, 0.05) * (0.55 + 0.45 * sin(uv.y * 70.0 + uv.x * 25.0 + uTime * 8.0));
        c = mix(c, silk, band * 0.95);
        c += vec3(1.0, 0.7, 0.3) * (1.0 - smoothstep(0.0, 0.012, abs(abs(dd) - 0.12))) * 1.5;
        return c;
      }
      float blk = mh2(floor(uv * vec2(16.0, 9.0)) + floor(uTime * 14.0));
      return blk < uAtlas.w ? b : a;
    }
    if (uMode < 1.5) return eyeContent(uv, bias);
    if (uMode < 2.5) return texture2D(uTex, vec2(uv.x, fract(uv.y * uRep + uScroll)), bias).rgb;
    return qrContent(uv);
  }
`;

function screenMaterial(ctx, uniforms, { mirror = false } = {}) {
  const U = megaUniforms(ctx);
  return ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK, uWaterY: U.uWaterY, uRiver: U.uRiver },
    defines: mirror ? { MIRROR: '' } : {},
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      #ifdef MIRROR
      ${MIRROR_VERT_GLSL}
      #endif
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        #ifdef MIRROR
        gl_Position = mirrorClip(wp.xyz);
        #else
        gl_Position = projectionMatrix * viewMatrix * wp;
        #endif
      }`,
    fragmentShader: /* glsl */`
      ${COMMON_GLSL}
      varying vec2 vUv; varying vec3 vW;
      #ifdef MIRROR
      ${MIRROR_FRAG_GLSL}
      #endif
      ${SCREEN_FRAG}
      void main(){
        vec2 uv = vUv;
        #ifdef MIRROR
        float m = mirrorMask(vW);
        if (m <= 0.0) discard;
        uv.x += (mnoise(vec2(vWater.z * 0.8, uTime * 2.0)) - 0.5) * 0.08;
        vec3 col = content(uv, 4.0) * uBright * m * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #else
        // 故障：按行错位 + 色差
        float gch = 0.0;
        if (uGlitch > 0.01) {
          float by = floor(uv.y * 28.0);
          float hit = step(1.0 - uGlitch * 0.7, mh2(vec2(by, floor(uTime * 15.0) + uSeed)));
          uv.x += (mh2(vec2(by * 1.3, floor(uTime * 30.0))) - 0.5) * 0.18 * hit;
          gch = uGlitch * (0.004 + 0.02 * hit);
        }
        // LED 点阵：像素足够大时量化 uv 并画出灯珠；远处自动淡出（防摩尔纹）
        vec2 cell = uv * uLed;
        float fw = max(fwidth(cell.x), fwidth(cell.y));
        float led = 1.0 - smoothstep(0.18, 0.55, fw);
        vec2 uvq = mix(uv, (floor(cell) + 0.5) / uLed, led);
        vec3 col;
        if (gch > 0.0) {
          col = vec3(content(uvq + vec2(gch, 0.0), 0.0).r, content(uvq, 0.0).g, content(uvq - vec2(gch, 0.0), 0.0).b);
        } else col = content(uvq, 0.0);
        vec2 f = fract(cell) - 0.5;
        float dotm = (1.0 - smoothstep(0.32, 0.46, abs(f.x))) * (1.0 - smoothstep(0.30, 0.46, abs(f.y)));
        col *= mix(1.0, dotm * 1.55 + 0.03, led);
        // 滚动扫描带 + 细扫描线
        col *= 1.0 + 0.22 * exp(-pow((fract(vUv.y * 0.8 - uTime * 0.11 + uSeed) - 0.5) * 9.0, 2.0));
        col *= 0.9 + 0.1 * (1.0 - led) * sin(vUv.y * uLed.y * 3.14159 * 0.5);
        col *= uBright;
        // 屏幕边缘发光框
        float e = min(min(vUv.x, 1.0 - vUv.x) * uLed.x, min(vUv.y, 1.0 - vUv.y) * uLed.y);
        col += uAura * (1.0 - smoothstep(0.0, 2.5, e)) * 1.5;
        float T = exp(-fogOptical(cameraPosition, vW));
        col = aerial(col, T, 0.9, vW.y);
        gl_FragColor = vec4(col, 1.0);
        #endif
      }`,
    ...(mirror ? { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } : {}),
  }));
}

function auraMaterial(ctx, uniforms, scale) {
  const U = megaUniforms(ctx);
  return ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uAura: uniforms.uAura, uScale: { value: new THREE.Vector2(...scale) }, uTime: U.uTime, uFogLow: U.uFogLow, uFogHigh: U.uFogHigh, uFogK: U.uFogK },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      ${COMMON_GLSL}
      uniform vec3 uAura; uniform vec2 uScale;
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 q = (vUv - 0.5) * uScale;
        vec2 o = max(abs(q) - 0.5, 0.0);
        float d = length(o);
        float g = exp(-d * 5.0) * 0.55 + exp(-d * 1.6) * 0.25;
        g *= smoothstep(0.5 * min(uScale.x, uScale.y), 0.0, d) ;
        g *= 1.0 - 0.6 * step(d, 0.0);
        float T = exp(-fogOptical(cameraPosition, vW));
        gl_FragColor = vec4(uAura * g * pow(T, 0.75), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

export function buildScreens(ctx, parent, mounts) {
  const T = {
    mask: maskAtlas(ctx.tex),
    portrait: portraitAtlas(ctx.tex),
    eye: eyeTex(ctx.tex),
    ad: adAtlas(ctx.tex),
    sub: [0, 1, 2].map(i => subTex(ctx.tex, i)),
  };
  const list = [];
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  SCREENS.forEach((sc, i) => {
    const m = mounts.get(sc.id);
    if (!m) return;
    const u = {
      uTex: { value: null }, uAtlas: { value: new THREE.Vector4(1, 0, 0, 0) }, uMode: { value: 0 }, uTrans: { value: 0 },
      uGlitch: { value: 0 }, uBright: { value: 2.6 }, uScroll: { value: 0 }, uRep: { value: 1 }, uSeed: { value: i * 7.31 },
      uLed: { value: new THREE.Vector2(Math.round(sc.w / 0.5), Math.round(sc.h / 0.5)) },
      uEye: { value: new THREE.Vector4(EYE.cx, EYE.cy, EYE.r, 1536 / 640 * (sc.h / sc.w)) },
      uEyeAnim: { value: new THREE.Vector2(0, 0.38) },
      uAura: { value: new THREE.Color(sc.color) },
    };
    // 眼睛 uv 纵横：屏幕宽高比与贴图不同时，按屏幕实际米数算圆
    u.uEye.value.w = sc.w / sc.h;
    if (sc.kind === 'mask') { u.uTex.value = T.mask.texture; u.uAtlas.value.x = 4; u.uTrans.value = 1; u.uBright.value = 2.4; }
    else if (sc.kind === 'portrait') { u.uTex.value = T.portrait.texture; u.uAtlas.value.x = 3; u.uBright.value = 2.4; }
    else if (sc.kind === 'eye') { u.uTex.value = T.eye.texture; u.uMode.value = MODE.eye; u.uBright.value = 2.6; }
    else if (sc.kind === 'ad') { u.uTex.value = T.ad.texture; u.uAtlas.value.x = T.ad.frames; u.uBright.value = 2.6; }
    else if (sc.kind === 'qr') { u.uTex.value = T.ad.texture; u.uMode.value = MODE.qr; u.uBright.value = 2.2; }
    else if (sc.kind === 'sub') {
      const st = T.sub[sc.sub];
      u.uTex.value = st.texture; u.uMode.value = MODE.scroll; u.uBright.value = 2.8;
      const texAspect = st.texture.image.height / st.texture.image.width || 15;   // 高/宽
      u.uRep.value = (sc.h / sc.w) / texAspect;
    }
    const geo = new THREE.PlaneGeometry(sc.w, sc.h);
    const mesh = new THREE.Mesh(geo, screenMaterial(ctx, u));
    mesh.position.set(m.x, m.y, m.z); mesh.rotation.y = m.ry;
    mesh.name = 'screen_' + sc.id; mesh.userData.noBatch = true;
    parent.add(mesh);
    const mir = new THREE.Mesh(geo, screenMaterial(ctx, u, { mirror: true }));
    mir.position.copy(mesh.position); mir.rotation.y = m.ry; mir.name = 'screenMirror_' + sc.id;
    mir.userData.noBatch = true; mir.frustumCulled = false; mir.renderOrder = 4;
    parent.add(mir);
    const sx = 1.9, sy = 1.7;
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(sc.w * sx, sc.h * sy), auraMaterial(ctx, u, [sx, sy]));
    const n = new THREE.Vector3(Math.sin(m.ry), 0, Math.cos(m.ry));
    aura.position.set(m.x, m.y, m.z).addScaledVector(n, 2.5); aura.rotation.y = m.ry;
    aura.name = 'screenAura_' + sc.id; aura.userData.noBatch = true; aura.renderOrder = 8;
    parent.add(aura);
    list.push({ sc, u, mesh, color: u.uAura.value, pos: mesh.position.clone(), base: new THREE.Color(sc.color) });
  });

  function update(t) {
    for (const s of list) {
      const { sc, u } = s;
      let glitch = 0;
      if (sc.kind === 'mask') {
        const P = 3.4, k = Math.floor(t / P), ph = t - k * P;
        const a = ((k % 4) + 4) % 4, b = (a + 1) % 4;
        const w = smooth(P - 0.7, P - 0.05, ph);
        u.uAtlas.value.set(4, a, b, w);
        glitch = w > 0 && w < 1 ? 0.25 : 0;
        tmpA.setHex(T.mask.colors[a]); tmpB.setHex(T.mask.colors[b]);
        s.color.copy(tmpA).lerp(tmpB, w);
      } else if (sc.kind === 'portrait') {
        const blink = (t % 4.3) < 0.16 || ((t + 0.4) % 9.7) < 0.14;
        const look = Math.floor(t / 6.5) % 3 === 1;
        u.uAtlas.value.set(3, blink ? 1 : (look ? 2 : 0), 0, 0);
        const g = t % 13;
        glitch = g < 0.35 ? 0.8 : 0;
      } else if (sc.kind === 'eye') {
        const ph = t % 5.2;
        const lid = ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI) : 0;
        u.uEyeAnim.value.set(Math.min(1, lid * 1.15), 0.3 + 0.1 * Math.sin(t * 0.6) + 0.05 * Math.sin(t * 2.3));
        glitch = (t % 17) < 0.25 ? 1 : 0;
      } else if (sc.kind === 'ad') {
        const P = 6.5, k = Math.floor((t + s.u.uSeed.value) / P), ph = (t + s.u.uSeed.value) - k * P;
        const ads = sc.ads, a = ads[k % ads.length], b = ads[(k + 1) % ads.length];
        const w = smooth(P - 0.45, P, ph);
        u.uAtlas.value.set(T.ad.frames, a, b, w);
        glitch = w > 0 && w < 1 ? 1 : (hash(Math.floor(t * 3) + u.uSeed.value) > 0.97 ? 0.5 : 0);
        tmpA.setHex(T.ad.colors[a]); tmpB.setHex(T.ad.colors[b]);
        s.color.copy(tmpA).lerp(tmpB, w);
      } else if (sc.kind === 'sub') {
        u.uScroll.value = (t * 0.05 + u.uSeed.value) % 1;
      } else if (sc.kind === 'qr') {
        glitch = (t % 3.5) < 0.2 ? 0.6 : 0;
      }
      u.uGlitch.value = glitch;
    }
  }
  return { list, update, tex: T };
}
