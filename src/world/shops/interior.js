// shops / interior —— "假室内"（interior mapping）：店面开口只是一张面片，
// 片元着色器里沿视线与一个虚拟房间盒求交，得到后墙 / 侧墙 / 顶棚 / 地面 + 一层中景剪影，
// 不挖基座就有 2–4 m 的纵深与视差。
//
// 合批友好：房间参数全部放在 uniform 数组里，面片只靠 uv.x = 2*cell + u 携带编号，
// 法线给出朝向（合批后 position / normal / uv 都会保留）。
import * as THREE from 'three';

export const MAX_CELLS = 64;
export const ATLAS = { cols: 8, rows: 8, cw: 384, ch: 384 };   // 每格上半 = 后墙，下半 = 中景（带 alpha）

export function createInteriors(ctx) {
  const { cols, rows, cw, ch } = ATLAS;
  const canvas = ctx.tex.canvas(cols * cw, rows * ch);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const V4 = () => Array.from({ length: MAX_CELLS }, () => new THREE.Vector4());
  const V3 = () => Array.from({ length: MAX_CELLS }, () => new THREE.Vector3());
  const uniforms = {
    tAtlas: { value: tex },
    uSize: { value: V4() },     // w, h, depth, intensity
    uOpt: { value: V4() },      // shelves(0/1), midDepth(0..1), glass(0/1), tubes(0/1)
    uWall: { value: V3() }, uFloor: { value: V3() }, uCeil: { value: V3() }, uLamp: { value: V3() },
    uFogColor: { value: ctx.scene.fog ? ctx.scene.fog.color : new THREE.Color(0x1d1a2c) },
    uFogDensity: { value: ctx.scene.fog ? ctx.scene.fog.density : 0.012 },
    uTime: ctx.shared.uTime,
  };
  const material = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      #define NC ${MAX_CELLS}
      varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      uniform sampler2D tAtlas;
      uniform vec4 uSize[NC]; uniform vec4 uOpt[NC];
      uniform vec3 uWall[NC]; uniform vec3 uFloor[NC]; uniform vec3 uCeil[NC]; uniform vec3 uLamp[NC];
      uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 cellUv(int c, vec2 q, bool mid){
        float col = float(c - (c / ${cols}) * ${cols});
        float row = float(c / ${cols});
        q = clamp(q, vec2(0.004), vec2(0.996));
        float py = row * ${ch}.0 + (mid ? ${ch / 2}.0 : 0.0) + (1.0 - q.y) * ${ch / 2}.0;
        return vec2((col + q.x) / ${cols}.0, 1.0 - py / ${rows * ch}.0);
      }
      void main(){
        int c = int(floor((vUv.x + 0.5) * 0.5));
        float u = clamp(vUv.x - 2.0 * float(c), 0.0, 1.0);
        float v = clamp(vUv.y, 0.0, 1.0);
        vec4 S = uSize[c]; vec4 O = uOpt[c];
        float w = S.x, h = S.y, D = S.z;
        vec3 N = normalize(vN);
        vec3 T = normalize(vec3(N.z, 0.0, -N.x));
        vec3 dw = normalize(vW - cameraPosition);
        vec3 d = vec3(dot(dw, T), dw.y, max(-dot(dw, N), 0.02));
        vec3 p = vec3(u * w, v * h, 0.0);
        vec3 sg = vec3(d.x >= 0.0 ? 1.0 : -1.0, d.y >= 0.0 ? 1.0 : -1.0, 1.0);
        vec3 ad = max(abs(d), vec3(1e-4));
        float tx = (d.x >= 0.0 ? (w - p.x) : p.x) / ad.x;
        float ty = (d.y >= 0.0 ? (h - p.y) : p.y) / ad.y;
        float tz = D / ad.z;
        float t = min(tx, min(ty, tz));
        vec3 q = p + d * t;
        vec3 col;
        float depthK = clamp(q.z / D, 0.0, 1.0);
        vec3 lamp = uLamp[c];
        if (t == tz) {
          col = texture2D(tAtlas, cellUv(c, vec2(q.x / w, q.y / h), false)).rgb;
        } else if (t == tx) {
          // 侧墙：上亮下暗；可选货架
          // 侧墙：墙裙 + 腰线 + 随机贴画/挂物，越往里越暗
          vec3 wc = uWall[c];
          float side = d.x >= 0.0 ? 1.0 : 0.0;
          float ws = q.y < 0.9 ? 0.45 : 1.0;
          ws *= 1.0 - 0.5 * step(abs(q.y - 0.92), 0.025);
          float pz = floor(q.z / 0.7);
          float ph = hh(vec2(pz + side * 31.0, float(c)));
          vec2 pl = vec2(fract(q.z / 0.7), (q.y - 1.25) / 0.6);
          if (ph > 0.55 && pl.x > 0.15 && pl.x < 0.85 && pl.y > 0.0 && pl.y < 1.0) {
            wc = 0.25 + 0.6 * vec3(hh(vec2(ph, 3.1)), hh(vec2(ph, 5.7)), hh(vec2(ph, 9.3)));
            ws = 0.9;
          }
          col = wc * ws * (0.45 + 0.55 * smoothstep(0.0, h, q.y)) * mix(1.0, 0.55, depthK);
          if (O.x > 0.5 && q.y > 0.15 && q.y < 2.1) {
            float row = floor((q.y - 0.15) / 0.38);
            float fy = fract((q.y - 0.15) / 0.38);
            float cz = floor(q.z * 9.0);
            float r = hh(vec2(cz, row + float(c) * 7.0));
            vec3 prod = 0.25 + 0.75 * vec3(hh(vec2(r, 1.3)), hh(vec2(r, 2.7)), hh(vec2(r, 4.1)));
            float gap = step(0.12, fract(q.z * 9.0)) * step(0.1, fract(q.z * 9.0 + 0.1));
            vec3 shelf = fy < 0.1 ? vec3(0.55) : (fy < 0.1 + 0.75 * r ? prod * gap : uWall[c] * 0.25);
            col = shelf * (0.6 + 0.5 * smoothstep(0.0, h, q.y)) * mix(1.0, 0.75, depthK);
          }
        } else if (d.y > 0.0) {
          // 顶棚 + 日光灯管
          vec2 cg = abs(fract(q.xz / 0.6) - 0.5);
          col = uCeil[c] * 0.42 * (1.0 - 0.45 * smoothstep(0.46, 0.5, max(cg.x, cg.y))) * mix(1.0, 0.7, depthK);
          if (O.w > 0.5) {
            float tubes = 0.0;
            for (int i = 0; i < 2; i++) {
              float xt = w * (0.3 + 0.4 * float(i));
              float zz = fract(q.z / 1.6);
              tubes += smoothstep(0.05, 0.015, abs(q.x - xt)) * step(0.15, zz) * step(zz, 0.85);
            }
            col += lamp * tubes * 5.0;
          } else {
            float zz = q.z - D * 0.5, xx = q.x - w * 0.5;
            col += lamp * 2.5 * exp(-(xx * xx + zz * zz) * 4.0);
          }
        } else {
          // 地面：地砖 + 灯光反射
          vec2 g = abs(fract(q.xz / 0.5) - 0.5);
          float grout = smoothstep(0.47, 0.5, max(g.x, g.y));
          col = uFloor[c] * (1.0 - 0.35 * grout);
          float xx = q.x - w * 0.5;
          col += lamp * 0.18 * exp(-xx * xx * 0.6) * (1.0 - depthK);
          col *= mix(1.0, 0.6, depthK);
        }
        // 中景剪影层（桌椅、人、柜台）
        float zm = D * O.y;
        if (zm > 0.0) {
          float tm = zm / ad.z;
          if (tm < t) {
            vec3 m = p + d * tm;
            if (m.x > 0.0 && m.x < w && m.y > 0.0 && m.y < h) {
              vec4 mc = texture2D(tAtlas, cellUv(c, vec2(m.x / w, m.y / h), true));
              col = mix(col, mc.rgb, mc.a);
            }
          }
        }
        col *= S.w;
        // 门洞边缘的接触阴影
        float edge = smoothstep(0.0, 0.12, u * w) * smoothstep(0.0, 0.12, (1.0 - u) * w) * smoothstep(0.0, 0.1, (1.0 - v) * h);
        col *= mix(0.35, 1.0, edge);
        if (O.z > 0.5) {
          // 玻璃：菲涅耳反一点雾色天光 + 竖向雨痕
          float F = 0.04 + 0.6 * pow(1.0 - clamp(-dot(dw, N), 0.0, 1.0), 4.0);
          float streak = hh(vec2(floor(u * w * 40.0), floor(v * h * 3.0 - uTime * 0.0)));
          col = col * (0.8 - 0.25 * F) + uFogColor * F * 1.5 + vec3(0.02) * step(0.93, streak);
        }
        float fd = length(vW - cameraPosition) * uFogDensity;
        col = mix(col, uFogColor, 1.0 - exp(-fd * fd));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));

  let next = 0;
  const lin = c => new THREE.Color(c);   // sRGB hex → 线性
  return {
    material, uniforms, canvas, g, texture: tex,
    // 申请一个格子：返回 { cell, x, y }（画布像素原点）；满了就复用（取模）
    alloc() {
      const cell = next < MAX_CELLS ? next++ : (next++ % MAX_CELLS);
      return { cell, x: (cell % cols) * cw, y: Math.floor(cell / cols) * ch, fresh: next <= MAX_CELLS };
    },
    full() { return next >= MAX_CELLS; },
    setRoom(cell, { w, h, depth, intensity, wall, floor, ceil, lamp, shelves = 0, mid = 0.45, glass = 0, tubes = 0 }) {
      uniforms.uSize.value[cell].set(w, h, depth, intensity);
      uniforms.uOpt.value[cell].set(shelves, mid, glass, tubes);
      const put = (arr, c) => { const k = lin(c); arr[cell].set(k.r, k.g, k.b); };
      put(uniforms.uWall.value, wall); put(uniforms.uFloor.value, floor);
      put(uniforms.uCeil.value, ceil); put(uniforms.uLamp.value, lamp);
    },
    // 生成开口面片（中心定位，法线 +Z 绕 Y 转 ry）
    quad(cell, w, h, pos, ry) {
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + 2 * cell);
      const m = new THREE.Mesh(geo, material);
      m.position.copy(pos);
      m.rotation.y = ry;
      ctx.staticRoot.add(m);
      return m;
    },
    flush() { tex.needsUpdate = true; },
  };
}
