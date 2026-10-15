// 巨型屏幕的程序化画面（Canvas 2D 矢量绘制，零外部图片）。
//   maskAtlas    川剧变脸：红 / 黑 / 金 / 蓝 四张脸谱（对称纹样）
//   portraitAtlas 风格化女性人像：睁眼 / 闭眼 / 侧目 三帧
//   eyeTex       眼睛特写（瞳孔、眼睑由 shader 动画）
//   adAtlas      虚构品牌广告 5 张
//   subTex       竖排滚动字幕（可无缝循环）
import * as THREE from 'three';
import { CN_FONT, CN_FONT_SERIF } from '../../core/tex.js';
import { makeRng } from '../../core/rng.js';

const EN_FONT = '"Bahnschrift","Segoe UI","Arial Narrow",Arial,sans-serif';

function texOf(tex, c, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, tex.maxAniso || 1);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.wrapT = THREE.RepeatWrapping;
  return t;
}

// -------------------------------------------------------------- 路径工具
// 右半边贝塞尔链（从顶部中线到底部中线），自动镜像成闭合对称路径
function symPath(g, start, segs) {
  g.beginPath();
  g.moveTo(start[0], start[1]);
  const pts = [start];
  for (const s of segs) { g.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]); pts.push([s[4], s[5]]); }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], p = pts[i];
    g.bezierCurveTo(-s[2], s[3], -s[0], s[1], -p[0], p[1]);
  }
  g.closePath();
}
// 一般路径：['M',x,y] ['L',x,y] ['Q',cx,cy,x,y] ['C',...]
function path(g, cmds, close = true) {
  g.beginPath();
  for (const c of cmds) {
    if (c[0] === 'M') g.moveTo(c[1], c[2]);
    else if (c[0] === 'L') g.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') g.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === 'C') g.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
  }
  if (close) g.closePath();
}
function mirror(g, fn) { fn(1); g.save(); g.scale(-1, 1); fn(-1); g.restore(); }
function glowText(g, text, x, y, color, blur, fill = color) {
  g.save(); g.shadowColor = color; g.shadowBlur = blur; g.fillStyle = fill; g.fillText(text, x, y); g.fillText(text, x, y); g.restore();
}
function vtext(g, text, x, y, step) { [...text].forEach((ch, i) => g.fillText(ch, x, y + i * step)); }

// ============================================================== 川剧脸谱
const MASKS = [
  { base: '#c8121e', hi: '#ff5a3e', ink: '#0c0a0e', patch: '#0c0a0e', eyeW: '#f6efe2', accent: '#f4c23a', line: '#f4c23a', bg: ['#4a0408', '#070103'], hood: '#1a0508', fore: 'flame', cheek: 'swirl', rim: '#ff3a2a', lip: '#5a0008' },
  { base: '#121218', hi: '#3a3a48', ink: '#f4efe6', patch: '#f4efe6', eyeW: '#f4efe6', accent: '#e8242e', line: '#e8242e', bg: ['#140a24', '#030208'], hood: '#0a0a12', fore: 'moon', cheek: 'cloud', rim: '#8a5cff', lip: '#c8101c' },
  { base: '#e4a82a', hi: '#fff0a0', ink: '#16100a', patch: '#c4101c', eyeW: '#fff6dc', accent: '#c4101c', line: '#16100a', bg: ['#3a2004', '#060301'], hood: '#2a0a04', fore: 'eye3', cheek: 'flame', rim: '#ffb03a', lip: '#8a0a10' },
  { base: '#1c44d4', hi: '#58b4ff', ink: '#0a0a14', patch: '#f4efe6', eyeW: '#f4efe6', accent: '#ff2fd0', line: '#f4efe6', bg: ['#04143a', '#010308'], hood: '#060a1e', fore: 'swirl', cheek: 'teeth', rim: '#22e6ff', lip: '#0a0a14' },
];
export const MASK_COLORS = [0xff2a1e, 0xb070ff, 0xffb030, 0x2a7bff];

const FACE = [0, -1.18];
const FACE_SEGS = [[0.5, -1.2, 0.92, -0.98, 0.97, -0.5], [1.02, -0.05, 0.98, 0.38, 0.8, 0.72], [0.6, 1.06, 0.3, 1.24, 0, 1.27]];

function drawMaskFrame(g, W, H, M, idx, rng) {
  // ---- 背景：舞台追光 + 竖排大字
  const bg = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.45, H * 0.75);
  bg.addColorStop(0, M.bg[0]); bg.addColorStop(1, M.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save();
  g.globalAlpha = 0.18; g.strokeStyle = M.rim; g.lineWidth = 2;
  for (let r = 120; r < W; r += 46) { g.beginPath(); g.arc(W / 2, H * 0.44, r, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  // 祥云底纹
  g.save(); g.globalAlpha = 0.12; g.strokeStyle = M.accent; g.lineWidth = 5;
  for (let i = 0; i < 9; i++) {
    const x = rng.range(0, W), y = rng.range(H * 0.05, H * 0.95), r = rng.range(18, 40);
    g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.arc(x + r * 1.6, y, r * 0.6, Math.PI, 0); g.arc(x + r * 2.6, y, r * 0.4, Math.PI, 0.3); g.stroke();
  }
  g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(W * 0.12)}px ${CN_FONT_SERIF}`;
  g.save(); g.globalAlpha = 0.85;
  glowText(g, '变', W * 0.09, H * 0.2, M.rim, 30, '#ffffff');
  glowText(g, '脸', W * 0.09, H * 0.34, M.rim, 30, '#ffffff');
  g.restore();
  g.font = `700 ${Math.round(W * 0.034)}px ${CN_FONT}`;
  g.fillStyle = M.accent;
  vtext(g, '川剧·蜀韵·雾都夜场', W * 0.93, H * 0.12, W * 0.045);
  g.font = `600 ${Math.round(W * 0.026)}px ${EN_FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText('SICHUAN OPERA  ·  FACE-CHANGING', W / 2, H * 0.965);
  g.textAlign = 'left';
  g.fillText(`0${idx + 1} / 04`, W * 0.05, H * 0.045);

  // ---- 脸
  const U = W * 0.3;
  g.save();
  g.translate(W / 2, H * 0.47);
  g.scale(U, U);
  g.lineJoin = 'round'; g.lineCap = 'round';

  // 头盔 / 头巾（脸后）
  symPath(g, [0, -1.75], [[0.7, -1.78, 1.3, -1.45, 1.34, -0.9], [1.4, -0.2, 1.32, 0.6, 1.12, 1.15], [0.9, 1.5, 0.4, 1.6, 0, 1.6]]);
  const hg = g.createLinearGradient(0, -1.8, 0, 1.6);
  hg.addColorStop(0, M.hood); hg.addColorStop(0.5, '#000000'); hg.addColorStop(1, M.hood);
  g.fillStyle = hg; g.fill();
  g.lineWidth = 0.03; g.strokeStyle = M.accent; g.stroke();
  // 绒球
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (0.12 + 0.76 * i / 8);
    const x = Math.cos(a) * 1.15, y = -0.55 + Math.sin(a) * 1.18;
    const r = i % 2 ? 0.12 : 0.17;
    const pg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    const c = i % 2 ? M.accent : (i % 4 === 0 ? '#ff2a5a' : '#f6efe2');
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.35, c); pg.addColorStop(1, '#200006');
    g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // 额前金冠带
  path(g, [['M', -1.02, -0.98], ['Q', 0, -1.42, 1.02, -0.98], ['L', 0.98, -0.86], ['Q', 0, -1.28, -0.98, -0.86]]);
  g.fillStyle = M.accent; g.fill();
  g.fillStyle = '#300008';
  for (let i = -4; i <= 4; i++) { g.beginPath(); g.arc(i * 0.2, -1.07 - 0.055 * (4 - Math.abs(i)) * 0.5, 0.035, 0, Math.PI * 2); g.fill(); }
  const jg = g.createRadialGradient(-0.03, -1.27, 0.01, 0, -1.25, 0.12);
  jg.addColorStop(0, '#ffffff'); jg.addColorStop(0.4, '#ff2a3a'); jg.addColorStop(1, '#400008');
  g.fillStyle = jg; g.beginPath(); g.arc(0, -1.25, 0.12, 0, Math.PI * 2); g.fill();

  // 脸底色
  symPath(g, FACE, FACE_SEGS);
  const fg = g.createRadialGradient(0, -0.3, 0.1, 0, 0, 1.35);
  fg.addColorStop(0, M.hi); fg.addColorStop(0.55, M.base); fg.addColorStop(1, M.ink === '#f4efe6' ? '#000000' : M.base);
  g.fillStyle = fg; g.fill();
  g.save();
  g.clip();

  // 额头纹样
  g.save();
  if (M.fore === 'flame') {
    path(g, [['M', 0, -0.42], ['C', -0.2, -0.55, -0.24, -0.78, -0.1, -0.98], ['C', -0.1, -0.82, -0.02, -0.76, 0, -1.08], ['C', 0.02, -0.76, 0.1, -0.82, 0.1, -0.98], ['C', 0.24, -0.78, 0.2, -0.55, 0, -0.42]]);
    g.fillStyle = M.accent; g.fill(); g.lineWidth = 0.025; g.strokeStyle = M.ink; g.stroke();
    path(g, [['M', 0, -0.5], ['C', -0.1, -0.6, -0.1, -0.72, 0, -0.86], ['C', 0.1, -0.72, 0.1, -0.6, 0, -0.5]]);
    g.fillStyle = '#ff2a1a'; g.fill();
  } else if (M.fore === 'moon') {
    g.beginPath(); g.arc(0, -0.76, 0.17, 0, Math.PI * 2); g.fillStyle = M.ink; g.fill();
    g.beginPath(); g.arc(0.07, -0.81, 0.15, 0, Math.PI * 2); g.fillStyle = M.base; g.fill();
    g.lineWidth = 0.02; g.strokeStyle = M.accent;
    g.beginPath(); g.arc(0, -0.76, 0.22, Math.PI * 0.6, Math.PI * 2.4); g.stroke();
  } else if (M.fore === 'eye3') {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.22;
      g.beginPath(); g.moveTo(Math.cos(a) * 0.14, -0.74 + Math.sin(a) * 0.14); g.lineTo(Math.cos(a) * 0.32, -0.74 + Math.sin(a) * 0.32);
      g.lineWidth = 0.03; g.strokeStyle = M.accent; g.stroke();
    }
    path(g, [['M', 0, -0.92], ['Q', 0.12, -0.74, 0, -0.56], ['Q', -0.12, -0.74, 0, -0.92]]);
    g.fillStyle = M.eyeW; g.fill(); g.lineWidth = 0.025; g.strokeStyle = M.ink; g.stroke();
    g.beginPath(); g.arc(0, -0.74, 0.045, 0, Math.PI * 2); g.fillStyle = M.accent; g.fill();
  } else if (M.fore === 'swirl') {
    mirror(g, () => {
      g.beginPath();
      for (let a = 0; a < 9; a += 0.15) { const r = 0.02 + a * 0.016; const x = 0.12 + Math.cos(a) * r, y = -0.78 + Math.sin(a) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.lineWidth = 0.04; g.strokeStyle = M.patch; g.stroke();
    });
    path(g, [['M', 0, -0.45], ['L', 0.06, -0.62], ['L', 0, -1.0], ['L', -0.06, -0.62]]);
    g.fillStyle = M.accent; g.fill();
  }
  g.restore();

  // 眼窝大色块 + 金线
  const patch = [['M', 0.07, -0.2], ['C', 0.24, -0.44, 0.64, -0.44, 0.8, -0.28], ['C', 0.9, -0.12, 0.76, 0.06, 0.6, 0.09], ['C', 0.45, 0.12, 0.3, 0.22, 0.2, 0.36], ['C', 0.1, 0.14, 0.04, -0.04, 0.07, -0.2]];
  mirror(g, () => {
    path(g, patch); g.fillStyle = M.patch; g.fill();
    g.save(); g.translate(0.42, -0.1); g.scale(1.1, 1.12); g.translate(-0.42, 0.1);
    path(g, patch); g.lineWidth = 0.022; g.strokeStyle = M.line; g.stroke();
    g.restore();
  });
  // 眉：上扬的笔锋
  mirror(g, () => {
    path(g, [['M', 0.05, -0.36], ['C', 0.25, -0.52, 0.58, -0.66, 0.98, -0.84], ['C', 0.8, -0.6, 0.46, -0.44, 0.08, -0.29]]);
    g.fillStyle = M.ink === '#f4efe6' ? M.accent : M.ink; g.fill();
    g.lineWidth = 0.018; g.strokeStyle = M.ink === '#f4efe6' ? M.ink : M.eyeW; g.stroke();
    path(g, [['M', 0.5, -0.56], ['C', 0.66, -0.7, 0.8, -0.72, 0.95, -0.96]], false);
    g.lineWidth = 0.03; g.strokeStyle = M.accent; g.stroke();
  });
  // 眼睛
  mirror(g, () => {
    path(g, [['M', 0.17, -0.12], ['Q', 0.37, -0.29, 0.58, -0.14], ['Q', 0.37, 0.02, 0.17, -0.12]]);
    g.fillStyle = M.eyeW; g.fill(); g.lineWidth = 0.03; g.strokeStyle = M.ink === '#f4efe6' ? '#000' : M.ink; g.stroke();
    g.beginPath(); g.arc(0.37, -0.13, 0.068, 0, Math.PI * 2); g.fillStyle = '#050505'; g.fill();
    g.beginPath(); g.arc(0.35, -0.155, 0.02, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  });
  // 鼻
  path(g, [['M', -0.07, -0.3], ['L', 0.07, -0.3], ['C', 0.08, 0.0, 0.1, 0.12, 0.15, 0.21], ['C', 0.1, 0.31, -0.1, 0.31, -0.15, 0.21], ['C', -0.1, 0.12, -0.08, 0.0, -0.07, -0.3]]);
  g.fillStyle = M.ink === '#f4efe6' ? M.base : M.ink; g.fill(); g.lineWidth = 0.02; g.strokeStyle = M.line; g.stroke();
  mirror(g, () => { g.beginPath(); g.ellipse(0.075, 0.24, 0.035, 0.022, 0.3, 0, Math.PI * 2); g.fillStyle = M.accent; g.fill(); });
  // 颊纹
  mirror(g, () => {
    g.save();
    if (M.cheek === 'swirl' || M.cheek === 'cloud') {
      g.beginPath();
      for (let a = 0; a < 11; a += 0.12) { const r = 0.015 + a * 0.017; const x = 0.62 + Math.cos(a) * r, y = 0.32 + Math.sin(a) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.lineWidth = M.cheek === 'cloud' ? 0.05 : 0.035; g.strokeStyle = M.cheek === 'cloud' ? M.patch : M.accent; g.stroke();
    } else if (M.cheek === 'flame') {
      path(g, [['M', 0.42, 0.62], ['C', 0.5, 0.4, 0.78, 0.36, 0.86, 0.1], ['C', 0.9, 0.3, 0.82, 0.48, 0.7, 0.58], ['C', 0.78, 0.5, 0.86, 0.5, 0.92, 0.38], ['C', 0.9, 0.62, 0.66, 0.72, 0.42, 0.62]]);
      g.fillStyle = M.patch; g.fill(); g.lineWidth = 0.02; g.strokeStyle = M.ink; g.stroke();
    } else {
      for (let k = 0; k < 4; k++) {
        path(g, [['M', 0.48 + k * 0.1, 0.22], ['L', 0.53 + k * 0.1, 0.42 - k * 0.03], ['L', 0.58 + k * 0.1, 0.22]]);
        g.fillStyle = M.patch; g.fill();
      }
      g.beginPath(); g.moveTo(0.44, 0.2); g.quadraticCurveTo(0.7, 0.12, 0.92, 0.18); g.lineWidth = 0.03; g.strokeStyle = M.accent; g.stroke();
    }
    g.restore();
  });
  // 胡须 + 嘴
  mirror(g, () => {
    path(g, [['M', 0.02, 0.4], ['C', 0.2, 0.36, 0.42, 0.44, 0.56, 0.66], ['C', 0.38, 0.56, 0.2, 0.5, 0.02, 0.5]]);
    g.fillStyle = M.ink === '#f4efe6' ? M.patch : M.ink; g.fill();
  });
  path(g, [['M', -0.22, 0.62], ['Q', 0, 0.5, 0.22, 0.62], ['Q', 0, 0.8, -0.22, 0.62]]);
  g.fillStyle = M.lip; g.fill(); g.lineWidth = 0.02; g.strokeStyle = M.accent; g.stroke();
  // 下巴纹
  path(g, [['M', 0, 0.86], ['C', 0.16, 0.9, 0.2, 1.04, 0, 1.2], ['C', -0.2, 1.04, -0.16, 0.9, 0, 0.86]]);
  g.fillStyle = M.patch; g.fill(); g.lineWidth = 0.02; g.strokeStyle = M.line; g.stroke();
  // 手绘颜料质感
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${rng.range(0.02, 0.07)})`;
    const x = rng.range(-1, 1), y = rng.range(-1.2, 1.3);
    g.beginPath(); g.ellipse(x, y, rng.range(0.005, 0.03), rng.range(0.002, 0.008), rng.range(-0.4, 0.4), 0, Math.PI * 2); g.fill();
  }
  // 高光
  const sh = g.createRadialGradient(-0.3, -0.55, 0.02, -0.3, -0.55, 0.6);
  sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.fillRect(-1.2, -1.3, 2.4, 2.7);
  g.restore();   // 结束脸部 clip

  // 霓虹勾边
  symPath(g, FACE, FACE_SEGS);
  g.save(); g.shadowColor = M.rim; g.shadowBlur = 40; g.lineWidth = 0.025; g.strokeStyle = M.rim; g.stroke(); g.stroke(); g.restore();
  g.lineWidth = 0.012; g.strokeStyle = '#ffffff'; g.stroke();

  // 戏服领口
  symPath(g, [0, 1.32], [[0.4, 1.3, 0.9, 1.4, 1.3, 1.62], [1.4, 1.75, 1.4, 1.9, 1.3, 2.0], [0.8, 2.0, 0.3, 2.0, 0, 2.0]]);
  const cg = g.createLinearGradient(0, 1.3, 0, 2.0);
  cg.addColorStop(0, M.hood); cg.addColorStop(1, '#000');
  g.fillStyle = cg; g.fill();
  g.lineWidth = 0.025; g.strokeStyle = M.accent;
  for (let k = 0; k < 3; k++) {
    g.beginPath(); g.moveTo(-1.25, 1.62 + k * 0.1); g.quadraticCurveTo(0, 1.32 + k * 0.1, 1.25, 1.62 + k * 0.1); g.stroke();
  }
  for (let i = -6; i <= 6; i++) { g.beginPath(); g.arc(i * 0.18, 1.6 + Math.abs(i) * 0.012, 0.035, 0, Math.PI * 2); g.fillStyle = i % 2 ? M.accent : M.rim; g.fill(); }
  g.restore();
}

export function maskAtlas(tex) {
  const FW = 768, FH = 960;
  const c = tex.canvas(FW * 4, FH);
  const g = c.getContext('2d');
  const rng = makeRng('megacity:mask');
  MASKS.forEach((M, i) => {
    g.save(); g.translate(i * FW, 0);
    g.beginPath(); g.rect(0, 0, FW, FH); g.clip();
    drawMaskFrame(g, FW, FH, M, i, rng);
    g.restore();
  });
  return { texture: texOf(tex, c), frames: 4, colors: MASK_COLORS };
}

// ============================================================== 人像
function drawPortrait(g, W, H, frame, rng) {
  // 背景：合成波夕阳 + 网格 + 竖排字
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#05041a'); bg.addColorStop(0.6, '#2a0838'); bg.addColorStop(1, '#0a0212');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const sx = W * 0.62, sy = H * 0.34, sr = W * 0.42;
  const sun = g.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, '#ffd04a'); sun.addColorStop(0.5, '#ff3a8a'); sun.addColorStop(1, '#8a1aff');
  g.fillStyle = sun; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16052a';
  for (let k = 0; k < 9; k++) { const y = sy + sr * (0.05 + k * 0.11); g.fillRect(sx - sr, y, sr * 2, 3 + k * 2.2); }
  g.save(); g.strokeStyle = 'rgba(34,230,255,0.35)'; g.lineWidth = 2;
  for (let k = 0; k < 14; k++) { const y = H * 0.72 + Math.pow(k / 14, 2) * H * 0.3; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(W / 2 + k * 18, H * 0.72); g.lineTo(W / 2 + k * 110, H); g.stroke(); }
  g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(W * 0.085)}px ${CN_FONT}`;
  glowText(g, '雾', W * 0.92, H * 0.14, '#ff2fd0', 26, '#ffd0f4');
  glowText(g, '都', W * 0.92, H * 0.23, '#ff2fd0', 26, '#ffd0f4');
  glowText(g, '之', W * 0.92, H * 0.32, '#ff2fd0', 26, '#ffd0f4');
  glowText(g, '声', W * 0.92, H * 0.41, '#ff2fd0', 26, '#ffd0f4');
  g.font = `700 ${Math.round(W * 0.05)}px ${EN_FONT}`;
  g.textAlign = 'left';
  glowText(g, 'ARIA·霓', W * 0.05, H * 0.06, '#22e6ff', 18, '#e0fbff');
  g.font = `600 ${Math.round(W * 0.022)}px ${EN_FONT}`;
  g.fillStyle = 'rgba(220,240,255,0.8)';
  g.fillText('VOICE OF FOG CITY  ·  夜间频道 24:00', W * 0.05, H * 0.1);

  const U = W * 0.3;
  g.save();
  g.translate(W * 0.46, H * 0.46);
  g.scale(U, U);
  g.lineJoin = 'round'; g.lineCap = 'round';
  // 后发
  symPath(g, [0, -1.3], [[0.72, -1.32, 1.14, -0.92, 1.12, -0.2], [1.1, 0.4, 1.18, 0.8, 1.26, 1.02], [0.8, 1.1, 0.4, 1.0, 0, 1.0]]);
  const hb = g.createLinearGradient(-1, -1.2, 1, 1);
  hb.addColorStop(0, '#1a1030'); hb.addColorStop(0.5, '#07050e'); hb.addColorStop(1, '#2a0a30');
  g.fillStyle = hb; g.fill();
  g.save(); g.shadowColor = '#ff2fd0'; g.shadowBlur = 30; g.lineWidth = 0.02; g.strokeStyle = '#ff5fd8'; g.stroke(); g.restore();
  // 颈 + 肩
  path(g, [['M', -0.3, 0.7], ['L', 0.3, 0.7], ['L', 0.34, 1.3], ['C', 0.8, 1.36, 1.3, 1.5, 1.5, 2.0], ['L', -1.5, 2.0], ['C', -1.3, 1.5, -0.8, 1.36, -0.34, 1.3]]);
  const nk = g.createLinearGradient(0, 0.7, 0, 1.4);
  nk.addColorStop(0, '#5a2a52'); nk.addColorStop(1, '#c48ab0');
  g.fillStyle = nk; g.fill();
  // 高领夹克
  path(g, [['M', -0.42, 1.12], ['Q', 0, 1.3, 0.42, 1.12], ['L', 0.5, 1.42], ['C', 0.9, 1.45, 1.35, 1.6, 1.55, 2.0], ['L', -1.55, 2.0], ['C', -1.35, 1.6, -0.9, 1.45, -0.5, 1.42]]);
  g.fillStyle = '#0a0a16'; g.fill();
  g.save(); g.shadowColor = '#22e6ff'; g.shadowBlur = 16; g.strokeStyle = '#22e6ff'; g.lineWidth = 0.02;
  g.beginPath(); g.moveTo(-0.42, 1.12); g.quadraticCurveTo(0, 1.3, 0.42, 1.12); g.stroke();
  g.beginPath(); g.moveTo(0.5, 1.5); g.lineTo(1.2, 1.75); g.moveTo(-0.5, 1.5); g.lineTo(-1.2, 1.75); g.stroke();
  g.restore();
  // 脸
  const facePath = () => symPath(g, [0, -1.0], [[0.55, -1.0, 0.78, -0.6, 0.78, -0.15], [0.78, 0.3, 0.6, 0.68, 0.3, 0.9], [0.18, 0.99, 0.08, 1.02, 0, 1.02]]);
  facePath();
  const sk = g.createRadialGradient(-0.1, -0.2, 0.1, 0, 0, 1.1);
  sk.addColorStop(0, '#f6d2e0'); sk.addColorStop(0.6, '#d89ab8'); sk.addColorStop(1, '#6a3060');
  g.fillStyle = sk; g.fill();
  g.save(); g.clip();
  // 双色侧光
  let rg = g.createRadialGradient(-1.0, 0, 0.1, -1.0, 0, 0.9);
  rg.addColorStop(0, 'rgba(34,230,255,0.75)'); rg.addColorStop(1, 'rgba(34,230,255,0)');
  g.fillStyle = rg; g.fillRect(-1, -1.1, 2, 2.2);
  rg = g.createRadialGradient(1.0, 0.1, 0.1, 1.0, 0.1, 0.8);
  rg.addColorStop(0, 'rgba(255,47,208,0.7)'); rg.addColorStop(1, 'rgba(255,47,208,0)');
  g.fillStyle = rg; g.fillRect(-1, -1.1, 2, 2.2);
  // 腮红
  mirror(g, () => { const b = g.createRadialGradient(0.45, 0.22, 0.01, 0.45, 0.22, 0.25); b.addColorStop(0, 'rgba(255,80,140,0.45)'); b.addColorStop(1, 'rgba(255,80,140,0)'); g.fillStyle = b; g.fillRect(0.1, -0.1, 0.7, 0.7); });
  // 眼影
  mirror(g, () => { const b = g.createRadialGradient(0.34, -0.2, 0.01, 0.34, -0.2, 0.22); b.addColorStop(0, 'rgba(160,40,200,0.7)'); b.addColorStop(1, 'rgba(160,40,200,0)'); g.fillStyle = b; g.fillRect(0, -0.5, 0.7, 0.6); });
  // 鼻
  g.strokeStyle = 'rgba(90,30,80,0.55)'; g.lineWidth = 0.02;
  g.beginPath(); g.moveTo(0.06, -0.12); g.quadraticCurveTo(0.1, 0.12, 0.07, 0.22); g.stroke();
  g.beginPath(); g.moveTo(-0.07, 0.25); g.quadraticCurveTo(0, 0.29, 0.07, 0.25); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-0.01, 0.17, 0.025, 0.04, 0, 0, Math.PI * 2); g.fill();
  // 脸颊纹身：竖排小字 + 条码
  g.save(); g.shadowColor = '#22e6ff'; g.shadowBlur = 10; g.fillStyle = '#7ff4ff';
  for (let k = 0; k < 7; k++) g.fillRect(-0.62 + k * 0.022, 0.02, k % 3 === 0 ? 0.012 : 0.006, 0.13);
  g.translate(-0.52, 0.27); g.scale(0.01, 0.01); g.font = `900 11px ${CN_FONT}`; g.textAlign = 'center'; g.fillText('雾', 0, 0);
  g.restore();
  // 嘴
  path(g, [['M', -0.2, 0.48], ['Q', -0.1, 0.4, 0, 0.45], ['Q', 0.1, 0.4, 0.2, 0.48], ['Q', 0, 0.52, -0.2, 0.48]]);
  g.fillStyle = '#c0124a'; g.fill();
  path(g, [['M', -0.19, 0.49], ['Q', 0, 0.53, 0.19, 0.49], ['Q', 0.1, 0.64, 0, 0.64], ['Q', -0.1, 0.64, -0.19, 0.49]]);
  const lp = g.createLinearGradient(0, 0.49, 0, 0.64);
  lp.addColorStop(0, '#ff2f6a'); lp.addColorStop(1, '#8a0a3a');
  g.fillStyle = lp; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(0.05, 0.56, 0.06, 0.015, -0.1, 0, Math.PI * 2); g.fill();
  g.restore();   // 结束脸 clip

  // 眼
  const look = frame === 2 ? 0.045 : 0;
  mirror(g, (sgn) => {
    const ex = 0.33, ey = -0.13;
    if (frame === 1) {
      g.strokeStyle = '#120818'; g.lineWidth = 0.028;
      g.beginPath(); g.moveTo(ex - 0.15, ey); g.quadraticCurveTo(ex, ey + 0.07, ex + 0.17, ey - 0.02); g.lineTo(ex + 0.27, ey - 0.09); g.stroke();
      g.lineWidth = 0.01;
      for (let k = 0; k < 6; k++) { const x = ex - 0.1 + k * 0.05; g.beginPath(); g.moveTo(x, ey + 0.04); g.lineTo(x + 0.01, ey + 0.08); g.stroke(); }
      return;
    }
    path(g, [['M', ex - 0.16, ey + 0.01], ['Q', ex, ey - 0.13, ex + 0.17, ey - 0.02], ['Q', ex + 0.02, ey + 0.09, ex - 0.16, ey + 0.01]]);
    g.fillStyle = '#f4ecf4'; g.fill();
    g.save(); g.clip();
    const ix = ex + look * sgn;
    const ir = g.createRadialGradient(ix, ey - 0.02, 0.005, ix, ey - 0.02, 0.085);
    ir.addColorStop(0, '#e0ffff'); ir.addColorStop(0.35, '#22e6ff'); ir.addColorStop(0.8, '#0a6a9a'); ir.addColorStop(1, '#04202e');
    g.fillStyle = ir; g.beginPath(); g.arc(ix, ey - 0.02, 0.085, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#02060a'; g.beginPath(); g.arc(ix, ey - 0.02, 0.035, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ix - 0.03, ey - 0.05, 0.016, 0, Math.PI * 2); g.fill();
    g.restore();
    // 眼线 + 上挑眼尾
    g.strokeStyle = '#0a0410'; g.lineWidth = 0.03;
    g.beginPath(); g.moveTo(ex - 0.16, ey + 0.01); g.quadraticCurveTo(ex, ey - 0.13, ex + 0.17, ey - 0.02); g.lineTo(ex + 0.28, ey - 0.1); g.stroke();
    g.lineWidth = 0.01; g.beginPath(); g.moveTo(ex - 0.12, ey + 0.04); g.quadraticCurveTo(ex + 0.02, ey + 0.09, ex + 0.16, ey); g.stroke();
  });
  // 眉
  mirror(g, () => { g.strokeStyle = '#1a0a1e'; g.lineWidth = 0.028; g.beginPath(); g.moveTo(0.14, -0.34); g.quadraticCurveTo(0.34, -0.42, 0.56, -0.33); g.stroke(); });
  // 齐刘海 + 两侧发片
  path(g, [['M', -0.86, -0.5], ['C', -0.9, -1.1, 0.9, -1.1, 0.86, -0.5], ['L', 0.7, -0.4], ['L', 0.5, -0.46], ['L', 0.3, -0.4], ['L', 0.1, -0.45], ['L', -0.12, -0.39], ['L', -0.32, -0.45], ['L', -0.52, -0.4], ['L', -0.72, -0.44]]);
  const hf = g.createLinearGradient(0, -1.1, 0, -0.4);
  hf.addColorStop(0, '#1a1030'); hf.addColorStop(1, '#05030a');
  g.fillStyle = hf; g.fill();
  mirror(g, () => {
    path(g, [['M', 0.66, -0.7], ['C', 0.88, -0.4, 0.86, 0.3, 0.74, 0.86], ['L', 0.6, 0.7], ['C', 0.72, 0.2, 0.74, -0.2, 0.6, -0.45]]);
    g.fillStyle = '#07050e'; g.fill();
  });
  // 发丝高光
  g.save(); g.lineWidth = 0.008;
  for (let i = 0; i < 26; i++) {
    const x0 = rng.range(-0.8, 0.8);
    const col = x0 < 0 ? 'rgba(34,230,255,' : 'rgba(255,90,220,';
    g.strokeStyle = col + rng.range(0.35, 0.8).toFixed(2) + ')';
    g.shadowColor = x0 < 0 ? '#22e6ff' : '#ff2fd0'; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(x0 * 0.6, -1.05); g.quadraticCurveTo(x0 * 1.1, -0.9, x0, -0.48 + rng.range(-0.05, 0.03)); g.stroke();
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 8; i++) {
    const x = sgn * rng.range(0.68, 0.84);
    g.strokeStyle = sgn < 0 ? 'rgba(34,230,255,0.6)' : 'rgba(255,90,220,0.6)';
    g.beginPath(); g.moveTo(x, -0.5); g.quadraticCurveTo(x + sgn * 0.08, 0.2, x - sgn * 0.02, rng.range(0.5, 0.85)); g.stroke();
  }
  g.restore();
  // 耳坠
  g.save(); g.shadowColor = '#22e6ff'; g.shadowBlur = 20; g.strokeStyle = '#9ff8ff'; g.lineWidth = 0.02;
  g.beginPath(); g.arc(-0.82, 0.98, 0.08, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(-0.82, 0.78); g.lineTo(-0.82, 0.9); g.stroke();
  g.restore();
  g.restore();
}

export function portraitAtlas(tex) {
  const FW = 768, FH = 1024;
  const c = tex.canvas(FW * 3, FH);
  const g = c.getContext('2d');
  for (let i = 0; i < 3; i++) {
    const rng = makeRng('megacity:portrait');    // 三帧同一随机序列 → 只有眼睛变化
    g.save(); g.translate(i * FW, 0); g.beginPath(); g.rect(0, 0, FW, FH); g.clip();
    drawPortrait(g, FW, FH, i, rng);
    g.restore();
  }
  return { texture: texOf(tex, c), frames: 3 };
}

// ============================================================== 眼睛特写
export const EYE = { cx: 0.5, cy: 0.52, r: 175 / 1536, rv: 175 / 640 };
export function eyeTex(tex) {
  const W = 1536, H = 640;
  const c = tex.canvas(W, H);
  const g = c.getContext('2d');
  const rng = makeRng('megacity:eye');
  const bg = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.6);
  bg.addColorStop(0, '#6a3a5a'); bg.addColorStop(0.6, '#2a1028'); bg.addColorStop(1, '#0a040c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,200,230'},${rng.range(0.02, 0.06)})`; g.fillRect(rng.range(0, W), rng.range(0, H), 2, 2); }
  // 眉
  g.strokeStyle = 'rgba(20,8,16,0.8)'; g.lineWidth = 3;
  for (let i = 0; i < 260; i++) {
    const t = rng(), x = 380 + t * 860, y = 70 + Math.pow(t - 0.45, 2) * 220 + rng.range(-12, 12);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + rng.range(0, 20), y - 10 + rng.range(-6, 6)); g.stroke();
  }
  const cx = W * EYE.cx, cy = H * (1 - EYE.cy) + 0, R = 175;
  const eyePath = () => path(g, [['M', 250, 350], ['C', 480, 90, 1080, 70, 1300, 300], ['C', 1060, 520, 520, 560, 250, 350]]);
  // 眼影
  const sh = g.createRadialGradient(cx, cy - 60, 50, cx, cy - 60, 520);
  sh.addColorStop(0, 'rgba(255,47,208,0.55)'); sh.addColorStop(1, 'rgba(255,47,208,0)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  eyePath();
  const sc = g.createRadialGradient(cx, cy, 50, cx, cy, 560);
  sc.addColorStop(0, '#f4f0f4'); sc.addColorStop(0.7, '#c8b4c4'); sc.addColorStop(1, '#5a4050');
  g.fillStyle = sc; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(200,40,60,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    const side = rng() < 0.5 ? -1 : 1; let x = cx + side * rng.range(260, 480), y = cy + rng.range(-80, 80);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x -= side * rng.range(10, 25); y += rng.range(-12, 12); g.lineTo(x, y); }
    g.stroke();
  }
  // 虹膜
  const ig = g.createRadialGradient(cx, cy, 20, cx, cy, R);
  ig.addColorStop(0, '#ffcf6a'); ig.addColorStop(0.3, '#2ad8e0'); ig.addColorStop(0.75, '#0c5a9a'); ig.addColorStop(1, '#041428');
  g.fillStyle = ig; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 520; i++) {
    const a = rng() * Math.PI * 2, r0 = R * rng.range(0.28, 0.45), r1 = R * rng.range(0.7, 0.98);
    g.strokeStyle = rng() < 0.75 ? `rgba(120,250,255,${rng.range(0.1, 0.45)})` : `rgba(255,190,80,${rng.range(0.1, 0.5)})`;
    g.lineWidth = rng.range(1, 3);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.quadraticCurveTo(cx + Math.cos(a + 0.1) * (r0 + r1) / 2, cy + Math.sin(a + 0.1) * (r0 + r1) / 2, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  g.lineWidth = 14; g.strokeStyle = 'rgba(2,10,24,0.85)'; g.beginPath(); g.arc(cx, cy, R - 6, 0, Math.PI * 2); g.stroke();
  // 眼睑投影
  const ls = g.createLinearGradient(0, 100, 0, 260);
  ls.addColorStop(0, 'rgba(10,0,10,0.75)'); ls.addColorStop(1, 'rgba(10,0,10,0)');
  g.fillStyle = ls; g.fillRect(0, 0, W, 300);
  g.restore();
  // 睫毛 + 眼线
  g.strokeStyle = '#08030a'; g.lineCap = 'round';
  g.lineWidth = 12; path(g, [['M', 250, 350], ['C', 480, 90, 1080, 70, 1300, 300], ['L', 1420, 210]], false); g.stroke();
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const x = (1 - t) ** 3 * 250 + 3 * (1 - t) ** 2 * t * 480 + 3 * (1 - t) * t * t * 1080 + t ** 3 * 1300;
    const y = (1 - t) ** 3 * 350 + 3 * (1 - t) ** 2 * t * 90 + 3 * (1 - t) * t * t * 70 + t ** 3 * 300;
    const len = 40 + 70 * Math.sin(t * Math.PI) + t * 40;
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (t - 0.3) * 60, y - len * 0.7, x + (t - 0.2) * 110 + 20, y - len); g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    const x = (1 - t) ** 3 * 250 + 3 * (1 - t) ** 2 * t * 520 + 3 * (1 - t) * t * t * 1060 + t ** 3 * 1300;
    const y = (1 - t) ** 3 * 350 + 3 * (1 - t) ** 2 * t * 560 + 3 * (1 - t) * t * t * 520 + t ** 3 * 300;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (t - 0.4) * 30, y + 20 + 10 * Math.sin(t * Math.PI)); g.stroke();
  }
  // HUD 文本
  g.font = `700 26px ${CN_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  glowText(g, '虹膜识别 · 已认证', 40, 44, '#22e6ff', 12, '#bff8ff');
  g.font = `600 20px ${EN_FONT}`;
  g.fillStyle = 'rgba(190,248,255,0.85)';
  g.fillText('IRIS-ID  #2088-0417-CQ   MATCH 99.82%', 40, 80);
  g.textAlign = 'right';
  g.fillText('FOG CITY SECURITY GRID', W - 40, 44);
  g.font = `700 26px ${CN_FONT}`;
  glowText(g, '雾都安全网', W - 40, 82, '#ff2fd0', 12, '#ffd0f4');
  g.textAlign = 'left';
  g.fillStyle = 'rgba(190,248,255,0.7)'; g.font = `500 18px ${EN_FONT}`;
  for (let i = 0; i < 6; i++) g.fillText(`${(rng() * 1e6 | 0).toString(16).toUpperCase().padStart(6, '0')}  ${(rng() * 99).toFixed(2)}`, 40, H - 170 + i * 26);
  return { texture: texOf(tex, c) };
}

// ============================================================== 品牌广告
const ADS = [
  { cn: '麻辣宇宙', en: 'MALA UNIVERSE', sub: '辣到外太空 · SPICY BEYOND ORBIT', bg: ['#a00010', '#2a0004'], fg: '#ffffff', ac: '#ffd23a', art: 'chili' },
  { cn: '长江重工', en: 'YANGTZE HEAVY INDUSTRIES', sub: '建造明天的雾都 · BUILDING TOMORROW', bg: ['#06223a', '#01060e'], fg: '#e8fbff', ac: '#22e6ff', art: 'hex' },
  { cn: '云端火锅', en: 'CLOUD HOTPOT  24H', sub: '九宫格 · 鸳鸯锅 · 外送无人机 15 分钟达', bg: ['#3a0a02', '#0e0201'], fg: '#ffd9a0', ac: '#ff7a1f', art: 'pot' },
  { cn: '义体诊所', en: 'CYBER-LIMB CLINIC', sub: '新手臂 只要 ¥9999 · 分期 0 利率', bg: ['#023a34', '#010c0a'], fg: '#e0fff8', ac: '#19ffc8', art: 'hand' },
  { cn: '山城夜航', en: 'NIGHT FLIGHT 2088', sub: '朝天门 ⇄ 天穹港 · 每 15 分钟一班', bg: ['#3a0640', '#08010c'], fg: '#ffe0fa', ac: '#ff2fd0', art: 'ship' },
];
export const AD_COLORS = [0xff2a1e, 0x22e6ff, 0xff7a1f, 0x19ffc8, 0xff2fd0];

function drawAd(g, W, H, A, rng) {
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, A.bg[0]); bg.addColorStop(1, A.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // 放射光 / 斜纹
  g.save(); g.globalAlpha = 0.12; g.fillStyle = A.ac;
  for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(W * 0.22, H * 0.5); const a = i / 16 * Math.PI * 2; g.arc(W * 0.22, H * 0.5, W, a, a + 0.12); g.closePath(); g.fill(); }
  g.restore();
  const ax = W * 0.2, ay = H * 0.5, s = H * 0.36;
  g.save(); g.translate(ax, ay); g.lineJoin = 'round'; g.lineCap = 'round';
  if (A.art === 'chili') {
    g.rotate(-0.5);
    path(g, [['M', -s * 0.2, -s * 0.9], ['C', s * 0.5, -s * 0.8, s * 0.6, s * 0.2, -s * 0.1, s * 1.0], ['C', s * 0.1, s * 0.2, -s * 0.1, -s * 0.4, -s * 0.5, -s * 0.7]]);
    const cg = g.createLinearGradient(-s, 0, s, 0); cg.addColorStop(0, '#ff3a2a'); cg.addColorStop(1, '#8a0008');
    g.fillStyle = cg; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(s * 0.05, -s * 0.3, s * 0.06, s * 0.35, -0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3aa020'; path(g, [['M', -s * 0.5, -s * 0.72], ['Q', -s * 0.3, -s * 1.2, s * 0.1, -s * 1.05], ['Q', -s * 0.1, -s * 0.95, -s * 0.2, -s * 0.86]]); g.fill();
    g.strokeStyle = A.ac; g.lineWidth = 4;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, s * (1.15 + k * 0.18), -0.8, 0.9); g.stroke(); }
  } else if (A.art === 'hex') {
    g.save(); g.shadowColor = A.ac; g.shadowBlur = 24; g.strokeStyle = A.ac; g.lineWidth = 10;
    g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; k ? g.lineTo(Math.cos(a) * s, Math.sin(a) * s) : g.moveTo(Math.cos(a) * s, Math.sin(a) * s); } g.stroke();
    g.lineWidth = 8;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = -s * 0.7; x <= s * 0.7; x += 4) { const y = (k - 1) * s * 0.3 + Math.sin(x / s * 5) * s * 0.08; x === -s * 0.7 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
    g.restore();
  } else if (A.art === 'pot') {
    g.fillStyle = '#20100a'; g.beginPath(); g.arc(0, 0, s * 1.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d01a0a'; g.beginPath(); g.arc(0, 0, s * 0.92, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2dcb8'; g.beginPath(); g.arc(0, 0, s * 0.92, -Math.PI / 2, Math.PI / 2); g.arc(0, s * 0.46, s * 0.46, Math.PI / 2, -Math.PI / 2, true); g.arc(0, -s * 0.46, s * 0.46, Math.PI / 2, -Math.PI / 2, false); g.fill();
    for (let i = 0; i < 40; i++) { const a = rng() * 6.28, r = rng() * s * 0.85; g.fillStyle = rng() < 0.5 ? '#ff7a1f' : '#6a0a04'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, rng.range(3, 9), 0, 6.28); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 5;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo((k - 1) * s * 0.4, -s * 1.1); g.bezierCurveTo((k - 1) * s * 0.4 + 30, -s * 1.3, (k - 1) * s * 0.4 - 30, -s * 1.5, (k - 1) * s * 0.4, -s * 1.8); g.stroke(); }
  } else if (A.art === 'hand') {
    g.save(); g.shadowColor = A.ac; g.shadowBlur = 18; g.strokeStyle = A.ac; g.lineWidth = 6;
    g.strokeRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.9);
    for (let k = 0; k < 4; k++) { const x = -s * 0.36 + k * s * 0.24; g.strokeRect(x, -s * 0.9 + (k === 0 || k === 3 ? s * 0.2 : 0), s * 0.16, s * 0.7 - (k === 0 || k === 3 ? s * 0.2 : 0)); g.beginPath(); g.arc(x + s * 0.08, -s * 0.4, s * 0.05, 0, 6.28); g.stroke(); }
    g.beginPath(); g.moveTo(-s * 0.4, s * 0.2); g.lineTo(-s * 0.8, -s * 0.2); g.lineTo(-s * 0.7, -s * 0.35); g.lineTo(-s * 0.4, -s * 0.05); g.stroke();
    g.restore();
  } else {
    g.save(); g.shadowColor = A.ac; g.shadowBlur = 20;
    g.fillStyle = '#0a0410';
    g.beginPath(); g.ellipse(0, 0, s * 1.1, s * 0.3, -0.12, 0, 6.28); g.fill();
    g.strokeStyle = A.ac; g.lineWidth = 5; g.stroke();
    g.fillStyle = A.ac; for (let k = -4; k <= 4; k++) g.fillRect(k * s * 0.2 - 4, -s * 0.05 + k * 2, 10, 6);
    g.restore();
  }
  g.restore();
  // 字
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `900 ${Math.round(H * 0.34)}px ${CN_FONT}`;
  g.save(); g.shadowColor = A.ac; g.shadowBlur = 22; g.lineWidth = 10; g.strokeStyle = A.ac; g.strokeText(A.cn, W * 0.4, H * 0.52); g.restore();
  g.fillStyle = A.fg; g.fillText(A.cn, W * 0.4, H * 0.52);
  g.font = `700 ${Math.round(H * 0.085)}px ${EN_FONT}`;
  g.fillStyle = A.ac; g.fillText(A.en, W * 0.405, H * 0.68);
  g.font = `600 ${Math.round(H * 0.055)}px ${CN_FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(A.sub, W * 0.405, H * 0.82);
  g.strokeStyle = A.ac; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
}

export function adAtlas(tex) {
  const FW = 1024, FH = 512;
  const c = tex.canvas(FW * ADS.length, FH);
  const g = c.getContext('2d');
  const rng = makeRng('megacity:ads');
  ADS.forEach((A, i) => { g.save(); g.translate(i * FW, 0); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); drawAd(g, FW, FH, A, rng); g.restore(); });
  return { texture: texOf(tex, c), frames: ADS.length, colors: AD_COLORS };
}

// ============================================================== 竖排滚动字幕
const SUBS = [
  { text: '雾都欢迎您·山城不夜天·火锅英雄·江湖再会·', color: '#ff2fd0', hi: '#ffd6f6' },
  { text: '朝天门·洪崖洞·十八梯·李子坝·解放碑·', color: '#22e6ff', hi: '#d8fbff' },
  { text: '长江重工·麻辣宇宙·云端火锅·义体诊所·', color: '#ffb03a', hi: '#fff0d0' },
];
export function subTex(tex, i) {
  const S = SUBS[i % SUBS.length];
  const chars = [...S.text];
  const cell = 200, W = 256, H = cell * chars.length;
  const c = tex.canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#04030a'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((ch, k) => {
    const y = cell * (k + 0.5);
    if (ch === '·') { g.fillStyle = S.color; g.beginPath(); g.arc(W / 2, y, 14, 0, Math.PI * 2); g.fill(); return; }
    g.font = `900 ${Math.round(cell * 0.78)}px ${CN_FONT}`;
    glowText(g, ch, W / 2, y, S.color, 28, S.color);
    g.save(); g.shadowColor = S.color; g.shadowBlur = 6; g.fillStyle = S.hi; g.fillText(ch, W / 2, y); g.restore();
  });
  g.fillStyle = S.color; g.fillRect(6, 0, 4, H); g.fillRect(W - 10, 0, 4, H);
  return { texture: texOf(tex, c, { repeat: true }), color: S.color };
}
