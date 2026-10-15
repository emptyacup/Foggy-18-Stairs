// 渲染管线：
//   scene → HDR(MSAA + 深度) → SSR 湿地反射(半分辨率) → 合成(反射竖向拉丝) → Bloom → 调色/色差/暗角/颗粒 → 屏幕
// 模块不碰这里；画面整体调性只在本文件和 palette.js 调整。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PUDDLE_GLSL } from './mat.js';

const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Pipeline {
  constructor(renderer, quality, shared) {
    this.renderer = renderer;
    this.q = quality;
    this.shared = shared;
    this.params = { nan: 0, exposure: 1.0, bloom: 0.45, bloomRadius: 0.35, bloomThreshold: 1.2, ssr: quality.ssr, ca: 1.0, grain: 0.05, vignette: 0.9 };
    const w = 2, h = 2;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: quality.msaa,
      depthTexture: new THREE.DepthTexture(w, h),
    });
    this.rtSSR = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.rtComp = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), this.params.bloom, this.params.bloomRadius, this.params.bloomThreshold);

    this.ssrQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2() }, uRain: shared.uRain, uTime: shared.uTime,
        uDryAreas: shared.uDryAreas, uDryCount: shared.uDryCount,
        uFog: { value: new THREE.Color() },
        uSkyTop: shared.uSkyTop ?? { value: new THREE.Color() }, uSkyHor: shared.uSkyHor ?? { value: new THREE.Color() },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tColor, tDepth;
        uniform mat4 uProj, uInvProj, uInvView;
        uniform vec2 uRes; uniform float uRain, uTime; uniform vec3 uFog, uSkyTop, uSkyHor;
        uniform vec4 uDryAreas[8]; uniform int uDryCount;
        ${PUDDLE_GLSL}
        vec3 viewPos(vec2 uv){
          float d = texture2D(tDepth, uv).x;
          vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          return v.xyz / v.w;
        }
        float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          float d0 = texture2D(tDepth, vUv).x;
          if (d0 >= 0.99999) { gl_FragColor = vec4(0.0); return; }
          vec2 px = 1.0 / uRes;
          vec3 P = viewPos(vUv);
          if (-P.z > 140.0) { gl_FragColor = vec4(0.0); return; }
          vec3 Pr = viewPos(vUv + vec2(px.x, 0.0)), Pl = viewPos(vUv - vec2(px.x, 0.0));
          vec3 Pu = viewPos(vUv + vec2(0.0, px.y)), Pd = viewPos(vUv - vec2(0.0, px.y));
          vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
          vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
          vec3 N = normalize(cross(dx, dy));
          vec3 Nw = (uInvView * vec4(N, 0.0)).xyz;
          float up = smoothstep(0.82, 0.97, Nw.y);
          if (up <= 0.0) { gl_FragColor = vec4(0.0); return; }
          vec3 Pw = (uInvView * vec4(P, 1.0)).xyz;
          for (int i = 0; i < 8; i++) {
            if (i >= uDryCount) break;
            vec4 area = uDryAreas[i];
            if (Pw.x >= area.x && Pw.x <= area.z && Pw.z >= area.y && Pw.z <= area.w) {
              gl_FragColor = vec4(0.0); return;
            }
          }
          float pud = puddle(Pw.xz);
          float damp = puddleDamp(Pw.xz);
          float mask = up * uRain;
          float rough = mix(mix(0.16, 0.09, damp), 0.012, pud);
          vec3 V = normalize(P);
          // 雨滴涟漪扰动法线
          vec2 rip = rainRipple(Pw.xz, uTime) * pud * uRain;
          vec3 rippleView = (vec4(vec3(rip.x, 0.0, rip.y), 0.0) * uInvView).xyz;
          vec3 Np = normalize(N + rippleView);
          vec3 R = reflect(V, Np);
          vec3 j = vec3(h12(vUv * uRes + uTime), h12(vUv * uRes + 17.0 + uTime), h12(vUv * uRes + 37.0 + uTime)) - 0.5;
          R = normalize(R + j * rough);
          float F = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
          float strength = mask * mix(0.28, 1.0, max(pud, damp * 0.45)) * F;
          vec3 pos = P + N * 0.03;
          float stepLen = 0.18 + h12(vUv * uRes) * 0.12;
          vec2 hitUv = vec2(-1.0);
          float fade = 0.0;
          for (int i = 0; i < 56; i++) {
            pos += R * stepLen;
            stepLen *= 1.07;
            vec4 c = uProj * vec4(pos, 1.0);
            vec2 suv = c.xy / c.w * 0.5 + 0.5;
            if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 || pos.z > -0.1) break;
            float sz = viewPos(suv).z;
            float dz = sz - pos.z;
            if (dz > 0.0 && dz < max(0.35, stepLen * 2.0)) {
              vec3 a = pos - R * stepLen, b = pos;
              for (int k = 0; k < 5; k++) {
                vec3 m = (a + b) * 0.5;
                vec4 cm = uProj * vec4(m, 1.0);
                vec2 mu = cm.xy / cm.w * 0.5 + 0.5;
                if (viewPos(mu).z - m.z > 0.0) b = m; else a = m;
              }
              vec4 cb = uProj * vec4(b, 1.0);
              hitUv = cb.xy / cb.w * 0.5 + 0.5;
              vec2 e = smoothstep(0.0, 0.08, hitUv) * smoothstep(1.0, 0.92, hitUv);
              fade = e.x * e.y * (1.0 - float(i) / 56.0);
              break;
            }
          }
          // 未命中：先沿反射方向投到"无穷远"，若屏幕上该处是比已追踪距离更远的景物（对岸巨构城/天空）就直接取色；
          // 再不行用天空渐变兜底。原来只退回暗雾色，积水映不出远处霓虹，成片发黑。
          if (hitUv.x < 0.0) {
            vec4 ci = uProj * vec4(P + R * 1800.0, 1.0);
            if (ci.w > 0.0) {
              vec2 iu = ci.xy / ci.w * 0.5 + 0.5;
              if (iu.x > 0.0 && iu.x < 1.0 && iu.y > 0.0 && iu.y < 1.0 && viewPos(iu).z < min(pos.z, P.z - 60.0)) {
                vec2 e = smoothstep(0.0, 0.06, iu) * smoothstep(1.0, 0.94, iu);
                hitUv = iu; fade = e.x * e.y;
              }
            }
          }
          vec3 Rw = (uInvView * vec4(R, 0.0)).xyz;
          vec3 refl = mix(uSkyHor, uSkyTop, smoothstep(0.05, 0.95, Rw.y) * 0.6);
          if (hitUv.x >= 0.0) refl = mix(refl, texture2D(tColor, hitUv).rgb, fade);
          gl_FragColor = vec4(min(refl, vec3(30.0)) * strength, mask);
        }`,
    }));

    this.compQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tSSR: { value: null }, uRes: { value: new THREE.Vector2() }, uSSR: { value: 1 }, uNaN: { value: 0 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tColor, tSSR; uniform vec2 uRes; uniform float uSSR, uNaN;
        bool bad(vec3 v){ return !(v.r < 6.0e4 && v.g < 6.0e4 && v.b < 6.0e4 && v.r > -1.0 && v.g > -1.0 && v.b > -1.0); }
        void main(){
          vec3 c = texture2D(tColor, vUv).rgb;
          // NaN/Inf 保护：一个坏像素经 bloom 模糊会污染整屏
          if (bad(c)) { gl_FragColor = uNaN > 0.5 ? vec4(50.0, 0.0, 50.0, 1.0) : vec4(0.0, 0.0, 0.0, 1.0); return; }
          if (uSSR > 0.5) {
            vec2 px = 2.0 / uRes;    // SSR 是半分辨率
            vec3 r = vec3(0.0); float wsum = 0.0;
            for (int i = -6; i <= 6; i++) {
              float w = exp(-float(i * i) / 14.0);
              r += texture2D(tSSR, vUv + vec2(float(i) * 0.15, float(i)) * px * 1.6).rgb * w;
              wsum += w;
            }
            r /= wsum;
            if (!bad(r)) c += r;
          }
          gl_FragColor = vec4(min(c, vec3(64.0)), 1.0);
        }`,
    }));

    this.finalQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, uTime: shared.uTime, uRes: { value: new THREE.Vector2() },
        uExposure: { value: 1 }, uCA: { value: 1 }, uGrain: { value: 0.05 }, uVig: { value: 0.9 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tColor; uniform float uTime, uExposure, uCA, uGrain, uVig; uniform vec2 uRes;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        float lin2srgb(float c){ return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0/2.4) - 0.055; }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 d = vUv - 0.5;
          float r2 = dot(d, d);
          vec2 off = d * r2 * 0.012 * uCA;
          vec3 c;
          c.r = texture2D(tColor, vUv - off).r;
          c.g = texture2D(tColor, vUv).g;
          c.b = texture2D(tColor, vUv + off).b;
          c *= uExposure;
          // 分离色调：暗部偏青蓝，亮部偏洋红暖
          float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c += vec3(-0.004, 0.006, 0.016) * (1.0 - smoothstep(0.0, 0.25, L));
          c = mix(c, c * vec3(1.06, 0.97, 1.02), smoothstep(0.3, 2.0, L));
          c = aces(c);
          c = mix(vec3(dot(c, vec3(0.2126,0.7152,0.0722))), c, 1.08);   // 轻微增饱和
          c *= mix(1.0, 1.0 - uVig, smoothstep(0.12, 0.72, r2 * 2.0));
          c = vec3(lin2srgb(c.r), lin2srgb(c.g), lin2srgb(c.b));
          c += (h(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    for (const q of [this.ssrQuad, this.compQuad, this.finalQuad]) q.material.userData.ctxMat = true;
    this.info = { calls: 0, triangles: 0 };
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.rtScene.setSize(w, h);
    this.rtComp.setSize(w, h);
    this.rtSSR.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.bloom.setSize(w, h);
    this.compQuad.material.uniforms.uRes.value.set(w, h);
    this.ssrQuad.material.uniforms.uRes.value.set(w >> 1, h >> 1);
    this.finalQuad.material.uniforms.uRes.value.set(w, h);
  }

  render(scene, camera) {
    const r = this.renderer, P = this.params;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    this.info = { calls: r.info.render.calls, triangles: r.info.render.triangles };

    const useSSR = P.ssr && this.shared.uRain.value > 0.01;
    if (useSSR) {
      const u = this.ssrQuad.material.uniforms;
      u.tColor.value = this.rtScene.texture;
      u.tDepth.value = this.rtScene.depthTexture;
      u.uProj.value.copy(camera.projectionMatrix);
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uInvView.value.copy(camera.matrixWorld);
      if (scene.fog) u.uFog.value.copy(scene.fog.color);
      r.setRenderTarget(this.rtSSR);
      this.ssrQuad.render(r);
    }
    const cu = this.compQuad.material.uniforms;
    cu.tColor.value = this.rtScene.texture;
    cu.tSSR.value = this.rtSSR.texture;
    cu.uSSR.value = useSSR ? 1 : 0;
    cu.uNaN.value = P.nan;
    r.setRenderTarget(this.rtComp);
    this.compQuad.render(r);

    this.bloom.strength = P.bloom; this.bloom.radius = P.bloomRadius; this.bloom.threshold = P.bloomThreshold;
    if (P.bloom > 0) this.bloom.render(r, null, this.rtComp, 0, false);

    const fu = this.finalQuad.material.uniforms;
    fu.tColor.value = this.rtComp.texture;
    fu.uExposure.value = P.exposure; fu.uCA.value = P.ca; fu.uGrain.value = P.grain; fu.uVig.value = P.vignette;
    r.setRenderTarget(null);
    this.finalQuad.render(r);
  }
}
