// 楼体专用程序化贴图（buildingsW / buildingsE / monorail 站楼共用）。
// 全部用 ctx.tex.canvas() 画，按 ctx.tex 实例缓存 —— W/E 两个模块共享同一批贴图，不重复计像素。
// 墙面贴图是"近中性灰 + 污渍"，颜色由材质 color（palette.BASE）着色，这样同一张贴图能出多种楼色。
import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';
import { WINDOW } from '../../core/palette.js';

const CACHE = new WeakMap();   // ctx.tex → Map
function cached(ctx, key, fn) {
  let m = CACHE.get(ctx.tex);
  if (!m) CACHE.set(ctx.tex, m = new Map());
  if (!m.has(key)) m.set(key, fn());
  return m.get(key);
}
function toTex(ctx, c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(aniso, ctx.tex.maxAniso || 1);
  return t;
}
const hex = c => '#' + c.toString(16).padStart(6, '0');
const rgba = (v, a) => `rgba(${v},${v},${v},${a})`;

// 通用脏污层：大块霉斑、竖向雨痕、零星斑点（画在已有底色上）
function grime(g, rng, S, k = 1) {
  // 大块阴影/霉斑（偏绿黑）
  for (let i = 0; i < 26 * k; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(S * 0.04, S * 0.16);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = rng.range(0.10, 0.28);
    grd.addColorStop(0, `rgba(20,28,22,${a})`); grd.addColorStop(1, 'rgba(20,28,22,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 竖向雨痕：从某高度开始往下流，越往下越淡
  for (let i = 0; i < 70 * k; i++) {
    const x = rng.range(0, S), w = rng.range(1, 7), y0 = rng.range(-S * 0.2, S * 0.8), len = rng.range(S * 0.15, S * 0.7);
    const grd = g.createLinearGradient(0, y0, 0, y0 + len);
    const a = rng.range(0.10, 0.32);
    grd.addColorStop(0, `rgba(12,12,16,${a})`); grd.addColorStop(1, 'rgba(12,12,16,0)');
    g.fillStyle = grd; g.fillRect(x, y0, w, len);
    if (y0 + len > S) { g.fillRect(x, y0 - S, w, len); }
  }
  // 斑点
  for (let i = 0; i < 900 * k; i++) {
    g.fillStyle = rng() < 0.75 ? `rgba(0,0,0,${rng.range(0.04, 0.16)})` : `rgba(255,255,255,${rng.range(0.03, 0.08)})`;
    const s = rng.range(1, 5);
    g.fillRect(rng.range(0, S), rng.range(0, S), s, s);
  }
}
// 逐像素细噪声（让大面积墙不再"塑料感"）
function noise(g, rng, S, amp) {
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rng() - 0.5) * amp;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
}

// ------------------------------------------------------------ 墙面（512 px = 4 m，世界 UV 每 4 m 重复）
export const WALL_METERS = 4;
export function wallTex(ctx, kind) {
  return cached(ctx, 'wall|' + kind, () => {
    const S = 512, rng = makeRng('tower-wall-' + kind);
    const c = ctx.tex.canvas(S, S), g = c.getContext('2d');
    if (kind === 'tile') {          // 老式条形面砖 0.24×0.06 m
      g.fillStyle = rgba(150, 1); g.fillRect(0, 0, S, S);
      const tw = 30, th = 8;
      for (let y = 0, r = 0; y < S; y += th, r++) {
        for (let x = (r % 2) * -tw / 2; x < S; x += tw) {
          if (rng() < 0.012) continue;   // 掉砖
          const v = 214 + rng.range(-16, 12);
          g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(x + 1, y + 1, tw - 2, th - 2);
        }
      }
      // 成片掉砖露出水泥
      for (let i = 0; i < 5; i++) {
        g.fillStyle = rgba(118, 1);
        const w = rng.range(20, 70), h = rng.range(12, 40);
        g.fillRect(Math.round(rng.range(0, S) / tw) * tw, Math.round(rng.range(0, S) / th) * th, w, h);
      }
    } else if (kind === 'mosaic') { // 马赛克 0.025 m
      g.fillStyle = rgba(140, 1); g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) {
        const v = 205 + rng.range(-22, 16);
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 3, 3);
      }
    } else if (kind === 'brick') {  // 红砖（贴图自带砖红，材质色只调明暗）
      g.fillStyle = rgba(170, 1); g.fillRect(0, 0, S, S);
      const bw = 31, bh = 8;
      for (let y = 0, r = 0; y < S; y += bh, r++) {
        for (let x = (r % 2) * -bw / 2; x < S; x += bw) {
          const v = rng.range(150, 235), w2 = rng.range(-14, 10);
          g.fillStyle = `rgb(${v},${v * 0.55 + w2},${v * 0.45 + w2})`; g.fillRect(x + 1.5, y + 1.5, bw - 2, bh - 2);
        }
      }
    } else if (kind === 'concrete') { // 清水混凝土：模板缝 + 孔洞
      g.fillStyle = rgba(196, 1); g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 38) {
        g.fillStyle = rgba(90, 0.35); g.fillRect(0, y, S, 2);
        g.fillStyle = rgba(rng() < 0.5 ? 180 : 210, 0.4); g.fillRect(0, y + 2, S, 36);
      }
      for (let i = 0; i < 300; i++) { g.fillStyle = rgba(60, 0.35); g.fillRect(rng.range(0, S), rng.range(0, S), 2, 2); }
    } else {                        // plaster：抹灰，补丁、裂缝、剥落
      g.fillStyle = rgba(200, 1); g.fillRect(0, 0, S, S);
      for (let i = 0; i < 40; i++) {
        const v = rng.range(160, 235), w = rng.range(30, 160), h = rng.range(20, 120);
        g.fillStyle = rgba(Math.round(v), 0.35); g.fillRect(rng.range(-50, S), rng.range(-50, S), w, h);
      }
      g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < 14; i++) {   // 裂缝
        let x = rng.range(0, S), y = rng.range(0, S);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += rng.range(-12, 12); y += rng.range(4, 18); g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 6; i++) {    // 剥落露砖
        const x = rng.range(0, S), y = rng.range(0, S), w = rng.range(20, 60), h = rng.range(10, 30);
        g.fillStyle = 'rgba(120,80,70,0.55)'; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(60,40,35,0.5)';
        for (let yy = y; yy < y + h; yy += 8) g.fillRect(x, yy, w, 1);
      }
    }
    grime(g, rng, S, kind === 'concrete' ? 1.3 : 1);
    noise(g, rng, S, 18);
    return toTex(ctx, c);
  });
}

// ------------------------------------------------------------ 彩钢瓦 / 铁皮（竖向波纹，2 m 一重复）
export function corrugatedTex(ctx) {
  return cached(ctx, 'corr', () => {
    const S = 256, rng = makeRng('tower-corr');
    const c = ctx.tex.canvas(S, S), g = c.getContext('2d');
    for (let x = 0; x < S; x++) {
      const v = 175 + 55 * Math.sin(x / S * Math.PI * 2 * 16);
      g.fillStyle = rgba(Math.round(v), 1); g.fillRect(x, 0, 1, S);
    }
    for (let i = 0; i < 40; i++) {   // 锈迹（往下流）
      const x = rng.range(0, S), w = rng.range(3, 20), y = rng.range(0, S), h = rng.range(20, 140);
      const grd = g.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, `rgba(110,55,25,${rng.range(0.3, 0.6)})`); grd.addColorStop(1, 'rgba(110,55,25,0)');
      g.fillStyle = grd; g.fillRect(x, y, w, h);
    }
    grime(g, rng, S, 0.4);
    return toTex(ctx, c);
  });
}

// ------------------------------------------------------------ 木板（吊脚楼）
export function woodTex(ctx) {
  return cached(ctx, 'wood', () => {
    const S = 256, rng = makeRng('tower-wood');
    const c = ctx.tex.canvas(S, S), g = c.getContext('2d');
    for (let x = 0; x < S; x += 16) {
      const v = rng.range(150, 230);
      g.fillStyle = rgba(Math.round(v), 1); g.fillRect(x, 0, 16, S);
      g.fillStyle = rgba(40, 0.8); g.fillRect(x, 0, 1.5, S);
      for (let k = 0; k < 6; k++) { g.fillStyle = rgba(Math.round(v - 40), 0.3); g.fillRect(x + rng.range(2, 14), 0, 1, S); }
    }
    grime(g, rng, S, 0.6);
    return toTex(ctx, c);
  });
}

// ------------------------------------------------------------ 窗户图集：8×4 格，每格 128 px
// 上两行（16 格）= 亮灯室内；下两行 = 暗窗玻璃（反光 + 窗帘暗影）。都带窗框/中梃。
export const ATLAS = { cols: 8, rows: 4, lit: 16, dark: 16 };
// 亮灯格的色温（窗口溢光的光场颜色与之对应）
export const ATLAS_TONES = [WINDOW.warm, WINDOW.warm, WINDOW.warm, WINDOW.fluor, WINDOW.warm, WINDOW.fluor, WINDOW.tv, WINDOW.warm,
  WINDOW.fluor, WINDOW.warm, WINDOW.red, WINDOW.warm, WINDOW.fluor, WINDOW.tv, WINDOW.warm, WINDOW.fluor];
export function windowAtlas(ctx) {
  return cached(ctx, 'winAtlas', () => {
    const C = 128, rng = makeRng('tower-win');
    const W = C * ATLAS.cols, H = C * ATLAS.rows;
    const c = ctx.tex.canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const tones = ATLAS_TONES;
    const curtains = ['#c9a27a', '#8fa0b8', '#b07070', '#d8d0b0', '#7a8a70', '#b090c0', '#d0b060'];
    const mullions = (x, y, panes, transom) => {
      g.fillStyle = '#0b0b0d';
      g.fillRect(x, y, C, 6); g.fillRect(x, y + C - 6, C, 6); g.fillRect(x, y, 6, C); g.fillRect(x + C - 6, y, 6, C);
      for (let p = 1; p < panes; p++) g.fillRect(x + Math.round(p * C / panes) - 2, y, 4, C);
      if (transom) g.fillRect(x, y + Math.round(C * 0.28), C, 4);
    };
    for (let i = 0; i < ATLAS.cols * 2; i++) {          // 亮灯
      const x = (i % ATLAS.cols) * C, y = Math.floor(i / ATLAS.cols) * C;
      const h = tones[i], col = [(h >> 16) & 255, (h >> 8) & 255, h & 255];
      const k = rng.range(0.55, 1.0);
      const css = (m) => `rgb(${col.map(v => Math.min(255, Math.round(v * m))).join(',')})`;
      const grd = g.createLinearGradient(0, y, 0, y + C);
      grd.addColorStop(0, css(k)); grd.addColorStop(0.7, css(k * 0.75)); grd.addColorStop(1, css(k * 0.4));
      g.fillStyle = grd; g.fillRect(x, y, C, C);
      // 屋里的家具剪影（衣柜、架子、灯）
      for (let f = 0; f < rng.int(1, 3); f++) {
        g.fillStyle = `rgba(0,0,0,${rng.range(0.35, 0.7)})`;
        const fw = rng.range(14, 46), fh = rng.range(30, 90);
        g.fillRect(x + rng.range(0, C - fw), y + C - fh, fw, fh);
      }
      if (rng() < 0.5) {   // 吸顶灯
        g.fillStyle = css(1.25); g.fillRect(x + rng.range(30, 90), y + 8, 22, 5);
      }
      const ct = rng();
      if (ct < 0.55) {     // 窗帘（半拉）
        const cw = C * rng.range(0.25, 0.55);
        const cc = new THREE.Color(rng.pick(curtains)).multiplyScalar(k * 0.8);
        g.fillStyle = '#' + cc.getHexString();
        const cx = rng() < 0.5 ? x : x + C - cw;
        g.fillRect(cx, y, cw, C);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let s = 0; s < cw; s += 9) g.fillRect(cx + s, y, 3, C);
      } else if (ct < 0.75) {   // 百叶
        g.fillStyle = 'rgba(0,0,0,0.45)';
        const bh = rng.range(0.3, 0.8) * C;
        for (let s = 0; s < bh; s += 7) g.fillRect(x, y + s, C, 3);
      }
      if (rng() < 0.3) {   // 人影
        g.fillStyle = 'rgba(0,0,0,0.8)';
        const px = x + rng.range(20, 100);
        g.fillRect(px, y + C * 0.35, 18, C * 0.65);
        g.beginPath(); g.arc(px + 9, y + C * 0.3, 10, 0, Math.PI * 2); g.fill();
      }
      if (rng() < 0.3) {   // 窗台盆栽：花盆 + 一簇小叶子剪影
        const px = x + rng.range(16, 100), pw = rng.range(12, 22);
        g.fillStyle = 'rgba(8,8,8,0.9)'; g.fillRect(px, y + C - 16, pw, 12);
        g.fillStyle = 'rgba(6,14,6,0.75)';
        for (let p = 0; p < 18; p++) {
          g.beginPath();
          g.ellipse(px + pw / 2 + rng.range(-16, 16), y + C - 18 - rng.range(0, 26), rng.range(2, 5), rng.range(4, 8), rng.range(0, Math.PI), 0, Math.PI * 2);
          g.fill();
        }
      }
      mullions(x, y, rng.pick([2, 2, 3, 4]), rng() < 0.6);
    }
    for (let i = 0; i < ATLAS.cols * 2; i++) {          // 暗窗
      const x = (i % ATLAS.cols) * C, y = (2 + Math.floor(i / ATLAS.cols)) * C;
      const base = rng.range(55, 95);
      const grd = g.createLinearGradient(x, y, x + C, y + C);
      grd.addColorStop(0, `rgb(${base * 0.7},${base * 0.8},${base * 1.1})`);
      grd.addColorStop(0.45, `rgb(${base * 0.35},${base * 0.4},${base * 0.55})`);
      grd.addColorStop(1, `rgb(${base * 0.2},${base * 0.22},${base * 0.3})`);
      g.fillStyle = grd; g.fillRect(x, y, C, C);
      // 斜向反光
      g.save(); g.beginPath(); g.rect(x, y, C, C); g.clip();
      g.fillStyle = `rgba(160,180,220,${rng.range(0.10, 0.24)})`;
      const o = rng.range(-40, 80);
      g.beginPath(); g.moveTo(x + o, y + C); g.lineTo(x + o + 30, y + C); g.lineTo(x + o + 90, y); g.lineTo(x + o + 60, y); g.fill();
      g.restore();
      if (rng() < 0.6) {
        g.fillStyle = `rgba(${rng.int(40, 90)},${rng.int(35, 70)},${rng.int(35, 70)},0.6)`;
        const cw = C * rng.range(0.3, 0.9);
        g.fillRect(rng() < 0.5 ? x : x + C - cw, y, cw, C);
      }
      if (rng() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y + C * 0.6, C, C * 0.4); }   // 堆着杂物
      mullions(x, y, rng.pick([2, 2, 3, 4]), rng() < 0.6);
    }
    return toTex(ctx, c, { repeat: false });
  });
}
// PlaneGeometry 的 uv（0..1）映射到图集某一格
export function atlasUV(geo, cell) {
  const cx = cell % ATLAS.cols, cy = Math.floor(cell / ATLAS.cols);
  const uv = geo.attributes.uv;
  const e = 0.01;
  for (let i = 0; i < uv.count; i++) {
    const u = e + uv.getX(i) * (1 - 2 * e), v = e + uv.getY(i) * (1 - 2 * e);
    uv.setXY(i, (cx + u) / ATLAS.cols, (ATLAS.rows - 1 - cy + v) / ATLAS.rows);
  }
  return geo;
}

// ------------------------------------------------------------ 污水流痕（alphaTest 贴花：空调滴水、窗下流挂）
export function streakTex(ctx) {
  return cached(ctx, 'streak', () => {
    const W = 64, H = 256, rng = makeRng('tower-streak');
    const c = ctx.tex.canvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x = rng.range(4, W - 6), w = rng.range(1.5, 7), len = rng.range(H * 0.3, H);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(x, 0, w, len);
    }
    g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(0, 0, W, 10);
    // 打散边缘（alphaTest 会出锯齿状流挂）
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = Math.max(0, Math.min(255, d[i] + (rng() - 0.5) * 120));
    g.putImageData(img, 0, 0);
    return toTex(ctx, c, { repeat: false, srgb: false });
  });
}

// ------------------------------------------------------------ 墙上小广告（喷漆 / 刷字）：4×2 格，透明底
export const ADS_N = 8;
export function adsTex(ctx) {
  return cached(ctx, 'ads', () => {
    const CW = 256, CH = 128, rng = makeRng('tower-ads');
    const c = ctx.tex.canvas(CW * 4, CH * 2), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","SimHei",sans-serif';
    const items = [
      ['疏通下水道', '1380238XXXX', '#b02020'], ['办证', '1592XXX8866', '#151515'], ['开锁 换锁', '6688XXXX', '#b02020'],
      ['拆', null, '#c03018'], ['高价回收旧家电', '1350XXX2211', '#203a8a'], ['管道疏通', '24小时', '#151515'],
      ['电焊 防盗网', '1308XXX5432', '#a02828'], ['此处禁止倒垃圾', null, '#151515'],
    ];
    items.forEach(([t1, t2, col], i) => {
      const x = (i % 4) * CW, y = Math.floor(i / 4) * CH;
      g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.strokeStyle = col;
      if (t1 === '拆') {   // 圆圈"拆"
        g.lineWidth = 9; g.beginPath(); g.arc(x + CW / 2, y + CH / 2, 52, 0, Math.PI * 2); g.stroke();
        g.font = `900 78px ${FONT}`; g.fillText(t1, x + CW / 2, y + CH / 2 + 4);
      } else {
        const fs = Math.min(56, (CW - 20) / [...t1].length);
        g.font = `900 ${fs}px ${FONT}`;
        g.fillText(t1, x + CW / 2 + rng.range(-6, 6), y + (t2 ? CH * 0.36 : CH / 2));
        if (t2) { g.font = `700 30px ${FONT}`; g.fillText(t2, x + CW / 2, y + CH * 0.76); }
      }
      // 喷漆飞白：随机挖掉像素
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 500; k++) { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x + rng.range(0, CW), y + rng.range(0, CH), rng.range(1, 4), rng.range(1, 4)); }
      g.globalCompositeOperation = 'source-over';
      g.restore();
    });
    return toTex(ctx, c, { repeat: false });
  });
}
export function adsUV(geo, i) {
  const cx = i % 4, cy = Math.floor(i / 4);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k)) / 4, (1 - cy - 1 + uv.getY(k)) / 2);
  return geo;
}
