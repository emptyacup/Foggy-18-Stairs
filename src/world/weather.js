// weather —— 雨：相机周围的雨丝（被光场染色）+ 地面溅射水花。全部在 GPU 上按时间 t 计算，截图可复现。
import * as THREE from 'three';
import { LIGHTFIELD_GLSL } from '../core/lights.js';
import { PUDDLE_GLSL } from '../core/mat.js';

export function build(ctx) {
  const { L, mat, lights, shared, quality } = ctx;
  const rng = ctx.rng('rain');
  const N = Math.round(10000 * (quality.rain ?? 1));
  const BOX = new THREE.Vector3(34, 26, 34);
  // 2D 高程同时覆盖两侧支巷、坡顶后街与滨江步道。最近邻保留真实台阶高度。
  // v4：扩到山坡后山梯道、坡顶后方新街区、滨江延伸段与趸船（x 0.5 m、z 0.17 m 一格）
  const XMIN = -205, XMAX = 205, ZMIN = -170, ZMAX = 116, HX = 820, HZ = 1682;
  const hdata = new Float32Array(HX * HZ * 4);
  const groundAt = L.walkHeightAt ?? L.heightAt;
  for (let z = 0; z < HZ; z++) {
    for (let x = 0; x < HX; x++) {
      const k = (z * HX + x) * 4;
      const h = groundAt(XMIN + (x + 0.5) * (XMAX-XMIN)/HX, ZMIN + (z + 0.5) * (ZMAX-ZMIN)/HZ);
      hdata[k] = h; hdata[k+1] = h; hdata[k+2] = 1;
    }
  }
  // 楼体与有顶碰撞盒是遮雨面；室内不生成地面水花，雨丝在屋顶以上结束。
  const shelters = [
    ...L.LOTS.map(b => ({ x0: Math.min(b.front,b.back), x1: Math.max(b.front,b.back), z0: b.z0, z1: b.z1, top: b.ground+b.height })),
    ...L.BLOCKS.map(b => ({ ...b, top: b.ground+b.height })),
    ...(ctx.physics?.boxes ?? []), ...(ctx.use('rainShelters') ?? []),
  ];
  for (const b of shelters) {
    const x0 = Math.max(0, Math.floor((b.x0-XMIN)/(XMAX-XMIN)*HX));
    const x1 = Math.min(HX-1, Math.ceil((b.x1-XMIN)/(XMAX-XMIN)*HX));
    const z0 = Math.max(0, Math.floor((Math.min(b.z0,b.z1)-ZMIN)/(ZMAX-ZMIN)*HZ));
    const z1 = Math.min(HZ-1, Math.ceil((Math.max(b.z0,b.z1)-ZMIN)/(ZMAX-ZMIN)*HZ));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = (z*HX+x)*4;
      if (b.top > hdata[k]+2.2) { hdata[k+1] = Math.max(hdata[k+1], b.top); hdata[k+2] = 0; }
    }
  }
  const htex = new THREE.DataTexture(hdata, HX, HZ, THREE.RGBAFormat, THREE.FloatType);
  htex.needsUpdate = true;

  // ------------------------------------------------------------ 雨丝
  const pos = new Float32Array(N * 4 * 3);
  const seed = new Float32Array(N * 4 * 4);
  const corner = new Float32Array(N * 4 * 2);
  const idx = new Uint32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const s = [rng(), rng(), rng(), rng()];
    const cs = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (let v = 0; v < 4; v++) {
      seed.set(s, (i * 4 + v) * 4);
      corner.set(cs[v], (i * 4 + v) * 2);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));

  const uniforms = {
    uTime: shared.uTime, uRain: shared.uRain,
    uDaylight: shared.uDaylight ?? { value: 0 },
    tH: { value: htex }, uBounds: { value: new THREE.Vector4(XMIN, ZMIN, XMAX, ZMAX) },
    uBox: { value: BOX }, uWind: { value: new THREE.Vector3(1.2, 0, 0.6) },
    uFog: { value: ctx.scene.fog.color },
    uLPos: lights.uPos, uLCol: lights.uCol, uLCount: lights.uCount,
  };
  const rainMat = mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uRain, uDaylight; uniform vec3 uBox, uWind, uFog;
      uniform sampler2D tH; uniform vec4 uBounds;
      varying float vA; varying vec3 vCol; varying float vX;
      ${LIGHTFIELD_GLSL}
      void main(){
        float speed = 9.0 + aSeed.w * 3.0;
        vec3 vel = vec3(uWind.x, -speed, uWind.z);
        vec3 base = cameraPosition - uBox * 0.5;
        vec3 q = aSeed.xyz * uBox + vel * uTime;
        vec3 wp = base + mod(q - base, uBox);
        vec3 axis = normalize(vel);
        vec3 toCam = normalize(cameraPosition - wp);
        vec3 side = normalize(cross(axis, toCam));
        float len = 0.22 + aSeed.w * 0.24;
        float wid = 0.002 + 0.002 * aSeed.x;
        vec3 p = wp + axis * (aCorner.y * len) + side * (aCorner.x * wid);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        float d = length(cameraPosition - wp);
        // 只有稍远一点的雨丝才看得清；离盒子边缘渐隐
        vec3 rel = abs(wp - cameraPosition) / (uBox * 0.5);
        float edge = 1.0 - smoothstep(0.7, 1.0, max(max(rel.x, rel.y), rel.z));
        vA = edge * smoothstep(2.5, 8.0, d) * step(aSeed.y, uRain + 0.001) * (1.0 - aCorner.y * 0.6);
        vec4 surface = texture2D(tH, (wp.xz-uBounds.xy)/(uBounds.zw-uBounds.xy));
        vA *= smoothstep(surface.g+0.1, surface.g+0.45, p.y);
        vec3 lf = lightFieldAt(wp);
        lf /= 1.0 + dot(lf, vec3(0.33));
        lf = mix(vec3(dot(lf, vec3(0.2126,0.7152,0.0722))), lf, 0.32);
        vCol = lf * 0.65 + uFog * 0.3 + mix(vec3(0.025), vec3(0.16), uDaylight);
        vX = aCorner.x;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying vec3 vCol; varying float vX;
      void main(){
        // MSAA 的像素中心可落在极细三角形外，插值 vX 可能超出 ±1；亮度必须非负。
        float a = max(vA, 0.0) * max(1.0 - vX * vX, 0.0) * 0.23;
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const rain = new THREE.Mesh(g, rainMat);
  rain.frustumCulled = false;
  rain.name = 'rain';
  rain.userData.followsCamera = true;
  rain.userData.noBatch = true;
  rain.renderOrder = 20;
  ctx.dynamicRoot.add(rain);

  // ------------------------------------------------------------ 地面水花
  const NS = Math.round(1400 * (quality.rain ?? 1));
  const sg = new THREE.BufferGeometry();
  const spos = new Float32Array(NS * 4 * 3), sseed = new Float32Array(NS * 4 * 4), scorner = new Float32Array(NS * 4 * 2);
  const sidx = new Uint32Array(NS * 6);
  for (let i = 0; i < NS; i++) {
    const s = [rng(), rng(), rng(), rng()];
    const cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let v = 0; v < 4; v++) { sseed.set(s, (i * 4 + v) * 4); scorner.set(cs[v], (i * 4 + v) * 2); }
    sidx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(sseed, 4));
  sg.setAttribute('aCorner', new THREE.BufferAttribute(scorner, 2));
  sg.setIndex(new THREE.BufferAttribute(sidx, 1));
  const splashMat = mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uRain, uDaylight; uniform vec3 uFog; uniform sampler2D tH; uniform vec4 uBounds;
      varying vec2 vC; varying float vAge; varying vec3 vCol; varying float vOn;
      ${LIGHTFIELD_GLSL}
      ${PUDDLE_GLSL}
      float h1(float x){ return fract(sin(x * 78.233) * 43758.5453); }
      void main(){
        float period = 0.8 + aSeed.w * 0.6;
        float tt = uTime / period + aSeed.z * 10.0;
        float cyc = floor(tt);
        vAge = fract(tt);
        float a = h1(cyc + aSeed.x * 100.0) * 6.2831, r = sqrt(h1(cyc * 1.7 + aSeed.y * 50.0)) * 14.0;
        vec3 c = vec3(cameraPosition.x + cos(a) * r, 0.0, cameraPosition.z + sin(a) * r);
        vec2 uv = (c.xz-uBounds.xy)/(uBounds.zw-uBounds.xy);
        vec4 surface = texture2D(tH, uv);
        c.y = surface.r + 0.018;
        float size = 0.04 + vAge * mix(0.13, 0.32, puddle(c.xz));
        vec3 p = c + vec3(aCorner.x, 0.0, aCorner.y) * size;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vC = aCorner;
        vec3 lf = lightFieldAt(c + vec3(0.0, 0.3, 0.0));
        vCol = lf / (1.0+dot(lf,vec3(0.33))) * 0.85 + uFog * 0.4 + mix(vec3(0.045),vec3(0.24),uDaylight);
        vOn = step(aSeed.y, uRain + 0.001) * (1.0-smoothstep(8.0,14.0,r)) * surface.b;
        vOn *= step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vC; varying float vAge; varying vec3 vCol; varying float vOn;
      void main(){
        float d = length(vC);
        float ring = (1.0-smoothstep(0.035,0.09,abs(d-0.86))) * 0.65;
        ring += (1.0-smoothstep(0.025,0.065,abs(d-0.55))) * 0.22 * smoothstep(0.15,0.35,vAge);
        float impact = (1.0-smoothstep(0.0,0.3,d)) * (1.0-smoothstep(0.08,0.2,vAge));
        float a = (ring + impact) * sin(vAge*3.14159) * (1.0-vAge) * vOn * 0.65;
        gl_FragColor = vec4(vCol, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const splash = new THREE.Mesh(sg, splashMat);
  splashMat.blending = THREE.NormalBlending;
  splash.frustumCulled = false;
  splash.name = 'splashes';
  splash.userData.followsCamera = true;
  splash.userData.noBatch = true;
  splash.renderOrder = 19;
  ctx.dynamicRoot.add(splash);

  // 台阶侧缘的细股径流与坎底飞溅，避开中央通行/取景区。
  const runoffPos = [], runoffUv = [], runoffSeed = [];
  function waterQuad(x, y, z, w, h, seed, mode) {
    for (const [u,v] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) {
      runoffPos.push(x+(u-0.5)*w, y+v*h, z);
      runoffUv.push(u,v); runoffSeed.push(seed,mode);
    }
  }
  for (const f of L.FLIGHTS) {
    if (f.type !== 'flight') continue;
    for (let i = 2; i < f.steps; i += 3) {
      const z = f.z0-(i+1)*f.run, y = f.y0-(i+1)*f.rise;
      for (const side of [-1,1]) {
        const x = side*(8.65+rng()*0.65), seed = rng();
        waterQuad(x,y+0.012,z-0.006,0.16,f.rise,seed,0);
        for (let d = 0; d < 3; d++) waterQuad(x+(rng()-0.5)*0.09,y+0.016,z-0.018,0.014,0.026,rng(),1);
      }
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position',new THREE.Float32BufferAttribute(runoffPos,3));
  rg.setAttribute('uv',new THREE.Float32BufferAttribute(runoffUv,2));
  rg.setAttribute('aWater',new THREE.Float32BufferAttribute(runoffSeed,2));
  const runoffMat = mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec2 aWater;
      uniform float uTime, uDaylight; uniform vec3 uFog;
      varying vec2 vC; varying vec3 vCol; varying float vFade, vMode;
      ${LIGHTFIELD_GLSL}
      void main(){
        vec3 p = position;
        float age = fract(uTime*(1.7+aWater.x)+aWater.x*17.0);
        vMode = aWater.y; vFade = 1.0;
        if (aWater.y > 0.5) {
          p.y += sin(age*3.14159)*0.095;
          p.x += (aWater.x-0.5)*age*0.2; p.z -= age*0.11;
          vFade = (1.0-age)*(1.0-age);
        }
        vec3 lf = lightFieldAt(p);
        vCol = lf/(1.0+dot(lf,vec3(0.33)))*0.65 + uFog*0.3 + mix(vec3(0.035),vec3(0.19),uDaylight);
        vC = uv + vec2(0.0,uTime*2.8+aWater.x*10.0);
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uRain; varying vec2 vC; varying vec3 vCol; varying float vFade, vMode;
      void main(){
        float center = 0.5+sin(vC.y*12.0)*0.05;
        float stream = (1.0-smoothstep(0.025,0.12,abs(vC.x-center))) * (0.45+0.55*sin(vC.y*21.0)*sin(vC.y*21.0));
        float bead = 1.0-smoothstep(0.2,0.5,abs(vC.x-0.5));
        gl_FragColor = vec4(vCol*mix(stream,bead,vMode)*vFade*uRain*0.38,1.0);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
  }));
  const runoff = new THREE.Mesh(rg,runoffMat);
  runoff.name = 'stair runoff and beads';
  runoff.userData.noBatch = true;
  ctx.dynamicRoot.add(runoff);
}
