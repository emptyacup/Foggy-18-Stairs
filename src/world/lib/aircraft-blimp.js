// aircraft-blimp —— 广告飞艇：130 m 软式飞艇，在江面上空沿椭圆航线缓慢巡航；
// 两舷挂巨屏（canvas 画中文广告，shader 做轮播/故障转场/LED 像素/滚动字幕），腹部探照灯扫江面。致敬《银翼杀手》。
// 局部坐标：+X 艇首，+Y 上，Z 舷宽。
import * as THREE from 'three';
import { CN_FONT } from '../../core/tex.js';
import { hullMaterial, emitMaterial, Glows, makeBeam, aimBeam, prep, merge, rgb, cbox, loft, fogUniforms } from './aircraft-fx.js';

const LEN = 130, R = 17;
const FRAME_H = 340, TICK_H = 64, FRAMES = 3, TEX_W = 1024, TEX_H = FRAME_H * FRAMES + TICK_H;

// ------------------------------------------------------------ 广告画布
function drawAds(ctx) {
  const c = ctx.tex.canvas(TEX_W, TEX_H);
  const g = c.getContext('2d');
  const rng = ctx.rng('blimp-ads');
  const font = (w, px) => `${w} ${px}px ${CN_FONT}`;
  const glowText = (txt, x, y, px, fill, glow, w = 900, align = 'left') => {
    g.font = font(w, px); g.textAlign = align; g.textBaseline = 'middle';
    g.shadowColor = glow; g.shadowBlur = px * 0.35; g.fillStyle = fill; g.fillText(txt, x, y);
    g.shadowBlur = 0; g.fillText(txt, x, y);
  };

  // 帧 0：云端火锅（红）
  let y0 = 0;
  let gr = g.createLinearGradient(0, y0, 0, y0 + FRAME_H);
  gr.addColorStop(0, '#3a0006'); gr.addColorStop(0.6, '#8a0c14'); gr.addColorStop(1, '#c8301a');
  g.fillStyle = gr; g.fillRect(0, y0, TEX_W, FRAME_H);
  // 九宫格锅
  const cx = 190, cy = y0 + 170, r = 128;
  g.fillStyle = '#1a0a08'; g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fill();
  const og = g.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, r);
  og.addColorStop(0, '#ff8a2a'); og.addColorStop(0.5, '#e0301a'); og.addColorStop(1, '#7a0c08');
  g.fillStyle = og; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f0c080'; g.lineWidth = 7;
  for (const d of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + d * r / 3, cy - r * 0.94); g.lineTo(cx + d * r / 3, cy + r * 0.94); g.stroke();
    g.beginPath(); g.moveTo(cx - r * 0.94, cy + d * r / 3); g.lineTo(cx + r * 0.94, cy + d * r / 3); g.stroke();
  }
  for (let i = 0; i < 26; i++) {           // 辣椒 / 花椒
    const a = rng() * Math.PI * 2, rr = rng() * r * 0.85;
    g.fillStyle = rng() < 0.6 ? '#ff2a1a' : '#3a1a0a';
    g.beginPath(); g.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 12, 5, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  glowText('渝味·云端火锅', 360, y0 + 120, 104, '#fff3d0', '#ffb030');
  glowText('九宫格 · 老灶牛油 · 全城空投三十分钟达', 364, y0 + 230, 40, '#ffd080', '#ff6020', 700);
  g.fillStyle = '#ffd040'; g.fillRect(364, y0 + 278, 300, 6);

  // 帧 1：离岸殖民地（蓝紫）
  y0 = FRAME_H;
  gr = g.createLinearGradient(0, y0, TEX_W, y0 + FRAME_H);
  gr.addColorStop(0, '#060418'); gr.addColorStop(0.5, '#1a0c48'); gr.addColorStop(1, '#3a0a5a');
  g.fillStyle = gr; g.fillRect(0, y0, TEX_W, FRAME_H);
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`; g.fillRect(rng() * TEX_W, y0 + rng() * FRAME_H, 2, 2); }
  const px = 820, py = y0 + 175;
  const pg = g.createRadialGradient(px - 40, py - 40, 10, px, py, 120);
  pg.addColorStop(0, '#9af0ff'); pg.addColorStop(0.5, '#3a7aff'); pg.addColorStop(1, '#10104a');
  g.fillStyle = pg; g.beginPath(); g.arc(px, py, 110, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,190,255,0.9)'; g.lineWidth = 8;
  g.beginPath(); g.ellipse(px, py, 190, 38, -0.25, 0, Math.PI * 2); g.stroke();
  glowText('离岸殖民地', 60, y0 + 120, 112, '#e8f6ff', '#40c8ff');
  glowText('一个崭新的生活正在那里等着你', 64, y0 + 230, 42, '#ffb8f0', '#ff40c0', 700);
  glowText('天穹移民署', 64, y0 + 290, 30, '#9fdcff', '#2080ff', 700);

  // 帧 2：雾隐清酒（黑底品红/青）
  y0 = FRAME_H * 2;
  g.fillStyle = '#05040a'; g.fillRect(0, y0, TEX_W, FRAME_H);
  const sg = g.createRadialGradient(780, y0 + 170, 20, 780, y0 + 170, 150);
  sg.addColorStop(0, '#ff6ab0'); sg.addColorStop(0.7, '#d01a6a'); sg.addColorStop(1, 'rgba(120,0,60,0)');
  g.fillStyle = sg; g.beginPath(); g.arc(780, y0 + 170, 150, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#05040a';
  for (let k = 0; k < 5; k++) g.fillRect(620, y0 + 200 + k * 22, 320, 8 + k * 2);   // 落日横纹
  glowText('雾隐清酒', 60, y0 + 130, 124, '#ffffff', '#ff2fd0');
  glowText('合成米酒 · 零度纯酿 · 山城夜饮', 64, y0 + 240, 40, '#7ff0ff', '#20c0ff', 700);

  // 滚动字幕条
  y0 = FRAME_H * 3;
  g.fillStyle = '#0a0806'; g.fillRect(0, y0, TEX_W, TICK_H);
  glowText('◆ 空中交通管制：低空三号航道临时关闭 ◆ 今夜持续中雨 ◆ 渝味云端火锅 全城空投 ◆', 8, y0 + TICK_H / 2, 34, '#ffc040', '#ff8000', 700);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function screenMaterial(ctx, tex, fogK) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms(ctx, fogK), uTime: ctx.shared.uTime, uMap: { value: tex }, uGain: { value: 2.1 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      uniform sampler2D uMap; uniform float uTime, uGain;
      uniform vec3 uFogColor; uniform float uFogDensity, uFogK;
      float h(float x){ return fract(sin(x * 91.17) * 43758.5); }
      const float FH = ${(FRAME_H / TEX_H).toFixed(6)};
      const float TH = ${(TICK_H / TEX_H).toFixed(6)};
      vec3 frame(float idx, vec2 uv){
        float v = 1.0 - (idx + 1.0 - uv.y) * FH;     // 画布自上而下排布
        return texture2D(uMap, vec2(uv.x, v)).rgb;
      }
      void main(){
        vec2 uv = vUv;
        float tick = 0.14;
        vec3 col;
        if (uv.y < tick) {
          float u = fract(uv.x * 0.62 + uTime * 0.035);
          col = texture2D(uMap, vec2(u, (1.0 - uv.y / tick) * TH)).rgb * 1.2;
        } else {
          vec2 fu = vec2(uv.x, (uv.y - tick) / (1.0 - tick));
          float T = uTime / 7.0;
          float idx = mod(floor(T), 3.0);
          float ph = fract(T);
          // 故障转场：最后 0.08 个周期横向错位 + 换帧
          float glitch = smoothstep(0.92, 0.95, ph) * (1.0 - smoothstep(0.99, 1.0, ph));
          float row = floor(fu.y * 24.0);
          fu.x += glitch * (h(row + floor(uTime * 20.0)) - 0.5) * 0.25;
          float nidx = mod(idx + 1.0, 3.0);
          float wipe = step(fu.y, smoothstep(0.93, 0.99, ph) * 1.02);
          col = mix(frame(idx, fu), frame(nidx, fu), wipe);
          col.r = mix(col.r, frame(mix(idx, nidx, wipe), fu + vec2(0.006 * glitch, 0.0)).r, glitch);
          // 扫描亮带
          col *= 1.0 + 0.25 * smoothstep(0.03, 0.0, abs(fract(fu.y - uTime * 0.15) - 0.5));
        }
        // LED 像素格
        vec2 cell = fract(vUv * vec2(260.0, 88.0));
        float led = smoothstep(0.0, 0.18, cell.x) * smoothstep(1.0, 0.82, cell.x) * smoothstep(0.0, 0.2, cell.y) * smoothstep(1.0, 0.8, cell.y);
        col *= mix(0.55, 1.0, led);
        // 边缘暗角
        col *= smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x) * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
        col *= uGain;
        float d = length(vW - cameraPosition);
        float fd = uFogDensity * uFogK * d;
        col = mix(col, uFogColor, 1.0 - exp(-fd * fd));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return ctx.mat.custom(m);
}

export function buildBlimp(ctx) {
  const { L } = ctx;
  const FOGK = 0.26;
  const root = new THREE.Group();
  root.name = 'blimp';
  ctx.dynamicRoot.add(root);

  const hullMat = hullMaterial(ctx, { fogK: FOGK, panel: 7.5, windows: 0.0, under: 0.9, underColor: 0x9a4a70, sky: 0.8, seamDark: 0.75, spec: 0.6 });
  const emit = emitMaterial(ctx, { fogK: FOGK * 0.8 });

  // ---------------------------------------------------------- 艇囊：拉长的椭球，尾部收细
  const env = new THREE.SphereGeometry(1, 48, 22);
  {
    const p = env.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = x < 0 ? 1 - 0.32 * Math.pow(-x, 1.6) : 1 - 0.06 * Math.pow(x, 3);
      p.setXYZ(i, x * LEN / 2, p.getY(i) * R * k, p.getZ(i) * R * k);
    }
    env.computeVertexNormals();
  }
  const geos = [prep(env, rgb(0x8a8e9c))];
  // 尾翼：十字布局
  const fin = new THREE.Shape([[0, 0], [-22, 0], [-26, 15], [-12, 15]].map(([x, y]) => new THREE.Vector2(x, y)));
  for (let k = 0; k < 4; k++) {
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.9, bevelEnabled: false });
    g.translate(-LEN / 2 + 26, R * 0.55, -0.45);
    g.rotateX(k * Math.PI / 2);
    geos.push(prep(g, rgb(0x5a5e6a)));
  }
  // 吊舱
  geos.push(loft([
    { x: -16, w: 2.6, t: -R + 1.2, b: -R - 3.2, ct: 0.5, cb: 1.2 },
    { x: -8, w: 3.6, t: -R + 0.4, b: -R - 5.0, ct: 0.6, cb: 1.6 },
    { x: 12, w: 3.6, t: -R + 0.4, b: -R - 5.0, ct: 0.6, cb: 1.6 },
    { x: 19, w: 2.2, t: -R + 1.0, b: -R - 3.4, ct: 0.5, cb: 1.4 },
  ], rgb(0x4a4e5a)));
  const emits = [];
  for (const sd of [-1, 1]) emits.push(cbox(24, 0.9, 0.2, 2, -R - 2.4, sd * 3.62, rgb(0xffd8a0, 2.2)));
  // 引擎吊舱 + 螺旋桨盘
  for (const sd of [-1, 1]) {
    const c = new THREE.CylinderGeometry(2.2, 1.6, 9, 14); c.rotateZ(Math.PI / 2); c.translate(-28, -R * 0.55, sd * (R * 0.95 + 3));
    geos.push(prep(c, rgb(0x3c4048)));
    geos.push(cbox(4, 1.0, 4, -28, -R * 0.55 + 1.6, sd * (R * 0.95), rgb(0x3c4048)));
    const disc = new THREE.CircleGeometry(4.2, 18); disc.rotateY(Math.PI / 2); disc.translate(-33, -R * 0.55, sd * (R * 0.95 + 3));
    emits.push(prep(disc, rgb(0x6a7a9a, 0.25)));
  }

  // ---------------------------------------------------------- 两舷巨屏
  const SW = 64, SH = SW * (FRAME_H / TEX_W) / (1 - 0.14);
  const SY = -1.5, SZ = R + 1.6;
  for (const sd of [-1, 1]) {
    geos.push(cbox(SW + 2.4, SH + 2.4, 1.2, 0, SY, sd * (SZ - 0.7), rgb(0x2a2d36)));
    // 桁架臂
    for (const x of [-SW * 0.35, 0, SW * 0.35]) {
      geos.push(cbox(1.2, 1.2, 4, x, SY + SH / 2 - 1, sd * (SZ - 2.6), rgb(0x2a2d36)));
      geos.push(cbox(1.2, 1.2, 4, x, SY - SH / 2 + 1, sd * (SZ - 2.6), rgb(0x2a2d36)));
    }
    // 屏框灯条
    emits.push(cbox(SW + 2.4, 0.45, 0.3, 0, SY + SH / 2 + 1.25, sd * (SZ - 0.1), rgb(0xff2fd0, 2.4)));
    emits.push(cbox(SW + 2.4, 0.45, 0.3, 0, SY - SH / 2 - 1.25, sd * (SZ - 0.1), rgb(0x22e6ff, 2.4)));
  }
  const tex = drawAds(ctx);
  const scrMat = screenMaterial(ctx, tex, FOGK * 0.5);
  for (const sd of [-1, 1]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), scrMat);
    q.position.set(0, SY, sd * SZ);
    if (sd < 0) q.rotation.y = Math.PI;
    q.name = 'blimp-screen';
    q.frustumCulled = false;
    root.add(q);
  }

  const hull = new THREE.Mesh(merge(geos), hullMat);
  hull.name = 'blimp-hull'; hull.frustumCulled = false;
  root.add(hull);
  const em = new THREE.Mesh(merge(emits), emit);
  em.name = 'blimp-emit'; em.frustumCulled = false;
  root.add(em);

  // ---------------------------------------------------------- 航行灯
  const glows = new Glows(ctx, 12, { parent: root, fogK: FOGK * 0.35, minPx: 5, streak: 0.5, name: 'blimp-glows' });
  glows.add({ pos: [-LEN / 2 + 8, R * 0.55 + 15, 0], color: 0xff2020, intensity: 6, size: 3, blink: [1.8, 0, 0.4] });
  glows.add({ pos: [-LEN / 2 + 8, -R * 0.55 - 15, 0], color: 0xffffff, intensity: 8, size: 3, blink: [2.2, 0.3, 0.06] });
  glows.add({ pos: [-LEN / 2 + 8, 0, R * 0.55 + 15], color: 0x20ff60, intensity: 6, size: 3 });
  glows.add({ pos: [-LEN / 2 + 8, 0, -R * 0.55 - 15], color: 0xff2020, intensity: 6, size: 3 });
  glows.add({ pos: [LEN / 2 + 0.5, 0, 0], color: 0xffffff, intensity: 5, size: 4, blink: [2.2, 0.8, 0.06] });
  glows.add({ pos: [0, R + 0.5, 0], color: 0xff2020, intensity: 5, size: 3.5, blink: [1.5, 0.5, 0.4] });
  const lensI = glows.add({ pos: [10, -R - 5.6, 0], color: 0xf4f8ff, intensity: 7, size: 4.5 });
  glows.commit();
  void lensI;

  // ---------------------------------------------------------- 腹部探照灯（扫江面）
  const beam = makeBeam(ctx, ctx.dynamicRoot, { color: 0xffe2b0, intensity: 0.2, fogK: FOGK * 0.6, falloff: 0.9, rain: 0.3, core: 0.7, name: 'blimp-beam' });

  // ---------------------------------------------------------- 航线：江面上空的大椭圆（只由 t 决定）
  // 椭圆 x ∈ [-270, 90]，避开全息巨人(130,-330)；近侧 z≈-300，t≈30 时位于主镜头画面右上
  const CX = -90, CZ = -360, RX = 180, RZ = 60, Y = 160, PERIOD = 480;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  ctx.onUpdate((dt, t) => {
    const a = t * 2 * Math.PI / PERIOD + 0.19;
    const x = CX + RX * Math.cos(a), z = CZ + RZ * Math.sin(a);
    const dx = -RX * Math.sin(a), dz = RZ * Math.cos(a);
    root.position.set(x, Y + 2.0 * Math.sin(t * 0.21), z);
    root.rotation.set(0, Math.atan2(-dz, dx), 0.015 * Math.sin(t * 0.17));
    root.updateMatrixWorld(true);
    from.set(10, -R - 5.6, 0).applyMatrix4(root.matrixWorld);
    to.set(from.x + 45 * Math.sin(t * 0.11), L.Y_RIVER, from.z + 50 + 35 * Math.sin(t * 0.07));
    aimBeam(beam, from, to, 9);
  });
  return { root };
}
