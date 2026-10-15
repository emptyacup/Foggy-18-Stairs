// Canvas 程序化纹理。零外部图片。所有生成器都按参数缓存。
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { WINDOW, BASE } from './palette.js';

export const CN_FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","SimHei",sans-serif';
export const CN_FONT_SERIF = '"STKaiti","KaiTi","Noto Serif SC","SimSun",serif';

const hex = c => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);
function mixHex(a, b, t) {
  const A = new THREE.Color(hex(a)), B = new THREE.Color(hex(b));
  return '#' + A.lerp(B, t).getHexString();
}

export class TexLib {
  constructor(renderer) {
    this.cache = new Map();
    this.maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    this.pixels = 0;   // 统计：check.mjs 用于预算
  }

  canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    this.pixels += w * h;
    return c;
  }

  _tex(canvas, { srgb = true, repeat = false, aniso = 4, mip = true } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(aniso, this.maxAniso);
    t.generateMipmaps = mip;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    return t;
  }

  _cached(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key);
  }

  // ------------------------------------------------------------ 霓虹字 / 灯箱
  // style: 'tube' 霓虹灯管（暗底发光字） | 'box' 灯箱（彩底白字） | 'led' 点阵屏
  // 返回 { texture, aspect }，aspect = 宽/高
  neonText(text, o = {}) {
    const key = 'neon|' + text + '|' + JSON.stringify(o);
    return this._cached(key, () => {
      const vertical = !!o.vertical;
      const style = o.style || 'tube';
      const color = hex(o.color ?? 0xff2a3a);
      const color2 = hex(o.color2 ?? o.color ?? 0xffb03a);
      const font = o.font || CN_FONT;
      const weight = o.weight || 900;
      const cell = o.cell || 128;
      const chars = [...text];
      const n = chars.length;
      const sub = o.sub || '';
      const pad = cell * 0.28;
      const W = Math.ceil(vertical ? cell + pad * 2 : cell * n + pad * 2);
      const H = Math.ceil(vertical ? cell * n + pad * 2 + (sub ? cell * 0.4 : 0) : cell + pad * 2 + (sub ? cell * 0.45 : 0));
      const c = this.canvas(W, H);
      const g = c.getContext('2d');

      // 底板
      if (style === 'box') {
        const grd = g.createLinearGradient(0, 0, vertical ? W : 0, vertical ? 0 : H);
        grd.addColorStop(0, mixHex(color, '#ffffff', 0.18));
        grd.addColorStop(0.5, color);
        grd.addColorStop(1, mixHex(color, '#000000', 0.25));
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = cell * 0.05;
        g.strokeRect(cell * 0.06, cell * 0.06, W - cell * 0.12, H - cell * 0.12);
      } else {
        g.fillStyle = o.bg || '#050508'; g.fillRect(0, 0, W, H);
        if (o.border !== false) {
          g.save();
          g.shadowColor = color2; g.shadowBlur = cell * 0.18;
          g.strokeStyle = mixHex(color2, '#ffffff', 0.45); g.lineWidth = cell * 0.035;
          const r = cell * 0.12, x0 = cell * 0.08, y0 = cell * 0.08, x1 = W - cell * 0.08, y1 = H - cell * 0.08;
          g.beginPath();
          g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r);
          g.lineTo(x1, y1 - r); g.quadraticCurveTo(x1, y1, x1 - r, y1); g.lineTo(x0 + r, y1);
          g.quadraticCurveTo(x0, y1, x0, y1 - r); g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0);
          g.stroke(); g.stroke();
          g.restore();
        }
      }

      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${weight} ${Math.round(cell * 0.82)}px ${font}`;
      const drawGlyph = (ch, x, y) => {
        if (style === 'box') {
          g.lineWidth = cell * 0.06; g.strokeStyle = 'rgba(0,0,0,0.35)';
          g.strokeText(ch, x, y);
          g.fillStyle = o.textColor ? hex(o.textColor) : '#ffffff';
          g.fillText(ch, x, y);
        } else if (style === 'led') {
          g.fillStyle = color; g.fillText(ch, x, y);
        } else {
          g.save();
          g.shadowColor = color; g.shadowBlur = cell * 0.22;
          g.fillStyle = color; g.fillText(ch, x, y); g.fillText(ch, x, y);
          g.shadowBlur = cell * 0.05;
          g.fillStyle = mixHex(color, '#ffffff', 0.55); g.fillText(ch, x, y);
          g.restore();
        }
      };
      for (let i = 0; i < n; i++) {
        const x = vertical ? W / 2 : pad + cell * (i + 0.5);
        const y = vertical ? pad + cell * (i + 0.5) : pad + cell * 0.5;
        drawGlyph(chars[i], x, y);
      }
      if (sub) {
        g.font = `700 ${Math.round(cell * (vertical ? 0.22 : 0.28))}px ${CN_FONT}`;
        g.fillStyle = style === 'box' ? 'rgba(255,255,255,0.9)' : mixHex(color2, '#ffffff', 0.3);
        if (style !== 'box') { g.shadowColor = color2; g.shadowBlur = cell * 0.1; }
        g.fillText(sub, W / 2, vertical ? H - pad - cell * 0.12 : H - pad * 0.55 - cell * 0.12);
      }
      if (style === 'led') {   // 点阵遮罩
        g.globalCompositeOperation = 'destination-in';
        const s = Math.max(3, Math.round(cell / 22));
        g.fillStyle = '#fff';
        for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) g.fillRect(x, y, s * 0.72, s * 0.72);
        g.globalCompositeOperation = 'destination-over';
        g.fillStyle = '#030304'; g.fillRect(0, 0, W, H);
      }
      return { texture: this._tex(c), aspect: W / H };
    });
  }

  // ------------------------------------------------------------ 楼栋立面
  // 一个面一张贴图：map（墙+窗框，受光）与 emissive（亮着的窗）。
  // bays: 开间数；floors: 层数；wall: 'tile'|'tilePink'|'tileGreen'|'plaster'|'concrete'
  facade({ bays, floors, seed = 'f', wall = 'tile', lit = 0.45, ground = false } = {}) {
    const key = `facade|${bays}|${floors}|${seed}|${wall}|${lit}|${ground}`;
    return this._cached(key, () => {
      const rng = makeRng(key);
      const BW = 48, FH = 64;
      const W = bays * BW, H = floors * FH;
      const cm = this.canvas(W, H), ce = this.canvas(W, H);
      const m = cm.getContext('2d'), e = ce.getContext('2d');
      const wallCol = { tile: BASE.tileWhite, tilePink: BASE.tilePink, tileGreen: BASE.tileGreen, plaster: BASE.plaster, concrete: BASE.concrete }[wall] ?? BASE.tileWhite;
      m.fillStyle = hex(wallCol); m.fillRect(0, 0, W, H);
      // 瓷砖缝
      if (wall.startsWith('tile')) {
        m.strokeStyle = 'rgba(0,0,0,0.10)'; m.lineWidth = 1;
        for (let y = 0; y < H; y += 6) { m.beginPath(); m.moveTo(0, y + 0.5); m.lineTo(W, y + 0.5); m.stroke(); }
        for (let x = 0; x < W; x += 12) { m.beginPath(); m.moveTo(x + 0.5, 0); m.lineTo(x + 0.5, H); m.stroke(); }
      }
      // 层间腰线
      m.fillStyle = 'rgba(0,0,0,0.22)';
      for (let f = 0; f < floors; f++) m.fillRect(0, f * FH, W, 4);
      e.fillStyle = '#000'; e.fillRect(0, 0, W, H);

      const curtains = ['#c9a27a', '#8fa0b8', '#b07070', '#d8d0b0', '#7a8a70', '#b090c0'];
      for (let f = 0; f < floors; f++) {
        // 每层整体"有人在家"的概率有起伏
        const floorLit = lit * rng.range(0.5, 1.5);
        for (let b = 0; b < bays; b++) {
          const x = b * BW, y = (floors - 1 - f) * FH;
          const kind = rng.weighted([['win', 6], ['wide', 2], ['blank', 1]]);
          if (kind === 'blank' || (ground && f === 0)) continue;
          const ww = kind === 'wide' ? BW * 0.84 : BW * 0.56, wh = FH * 0.56;
          const wx = x + (BW - ww) / 2, wy = y + FH * 0.2;
          // 窗框 + 防盗网暗示
          m.fillStyle = '#2a2c31'; m.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
          m.fillStyle = hex(BASE.glassDk); m.fillRect(wx, wy, ww, wh);
          // 污渍：窗下流挂
          const sg = m.createLinearGradient(0, wy + wh, 0, wy + wh + FH * 0.6);
          sg.addColorStop(0, 'rgba(10,10,14,0.35)'); sg.addColorStop(1, 'rgba(10,10,14,0)');
          m.fillStyle = sg; m.fillRect(wx + 2, wy + wh, ww - 4, FH * 0.6);
          // 亮灯
          if (rng() < floorLit) {
            const tone = rng.weighted([[WINDOW.warm, 6], [WINDOW.fluor, 3], [WINDOW.tv, 1.5], [WINDOW.red, 0.6]]);
            const k = rng.range(0.35, 1.0);
            const grd = e.createLinearGradient(0, wy, 0, wy + wh);
            grd.addColorStop(0, mixHex(tone, '#000000', 1 - k * 0.85));
            grd.addColorStop(1, mixHex(tone, '#000000', 1 - k));
            e.fillStyle = grd; e.fillRect(wx, wy, ww, wh);
            if (rng() < 0.6) {   // 窗帘
              const cw = ww * rng.range(0.25, 0.6);
              e.fillStyle = mixHex(rng.pick(curtains), '#000000', 1 - k * 0.6);
              e.fillRect(rng() < 0.5 ? wx : wx + ww - cw, wy, cw, wh);
            }
            if (rng() < 0.15) {  // 人影
              e.fillStyle = 'rgba(0,0,0,0.75)';
              e.fillRect(wx + ww * rng.range(0.2, 0.7), wy + wh * 0.35, ww * 0.12, wh * 0.65);
            }
            // 窗框挡光
            e.strokeStyle = '#000'; e.lineWidth = 2;
            e.beginPath(); e.moveTo(wx + ww / 2, wy); e.lineTo(wx + ww / 2, wy + wh); e.stroke();
          } else {
            e.fillStyle = 'rgba(20,30,50,0.25)'; e.fillRect(wx, wy, ww, wh);   // 暗窗反一点天光
          }
        }
      }
      // 大面积雨水流痕（竖向）
      for (let i = 0; i < bays * 3; i++) {
        const x = rng.range(0, W), w = rng.range(2, 10);
        const g2 = m.createLinearGradient(0, 0, 0, H);
        g2.addColorStop(0, 'rgba(15,12,18,0.25)'); g2.addColorStop(1, 'rgba(15,12,18,0.05)');
        m.fillStyle = g2; m.fillRect(x, rng.range(0, H * 0.3), w, H);
      }
      return {
        map: this._tex(cm, { aniso: 8 }),
        emissive: this._tex(ce, { aniso: 8 }),
        bayW: BW, floorH: FH,
      };
    });
  }

  // ------------------------------------------------------------ 青石板 / 地面
  paving(seed = 'pave') {
    return this._cached('paving|' + seed, () => {
      const rng = makeRng(seed);
      const S = 512;
      const c = this.canvas(S, S);
      const g = c.getContext('2d');
      g.fillStyle = '#5a5960'; g.fillRect(0, 0, S, S);
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        let x = -rng.range(0, 60);
        const y = r * S / rows;
        while (x < S) {
          const w = rng.range(50, 120);
          const v = rng.range(-18, 18);
          g.fillStyle = `rgb(${88 + v},${86 + v},${94 + v})`;
          g.fillRect(x + 2, y + 2, w - 4, S / rows - 4);
          x += w;
        }
      }
      for (let i = 0; i < 900; i++) {   // 斑驳
        g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${rng.range(0.02, 0.07)})`;
        g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(2, 18), rng.range(2, 18));
      }
      return this._tex(c, { repeat: true, aniso: 8 });
    });
  }

  // ------------------------------------------------------------ 防盗网 / 格栅（透明底 + 竖条，配 alphaTest 使用）
  grille({ bars = 10, rails = 3, thick = 3 } = {}) {
    return this._cached(`grille|${bars}|${rails}|${thick}`, () => {
      const S = 128;
      const c = this.canvas(S, S);
      const g = c.getContext('2d');
      g.clearRect(0, 0, S, S);
      g.fillStyle = '#ffffff';
      for (let i = 0; i <= bars; i++) g.fillRect(Math.round(i * (S - thick) / bars), 0, thick, S);
      for (let j = 0; j <= rails; j++) g.fillRect(0, Math.round(j * (S - thick * 1.5) / rails), S, thick * 1.5);
      return this._tex(c, { repeat: true, mip: true });
    });
  }

  // ------------------------------------------------------------ 径向渐变（光晕）
  radial() {
    return this._cached('radial', () => {
      const S = 128;
      const c = this.canvas(S, S);
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.15, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.12)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
      return this._tex(c, { srgb: false });
    });
  }
}
