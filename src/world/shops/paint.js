// shops / paint —— 假室内贴图（后墙 + 中景剪影）与店面小贴图（卷帘门、冰柜、招租纸……）。
// 所有绘制都以"米"为单位（region 负责换算），保证不同开间宽度下比例正确。
import { CN_FONT } from '../../core/tex.js';

// ------------------------------------------------------------ 坐标换算
export function region(g, x0, y0, W, H, w, h) {
  const sx = W / w, sy = H / h;
  const X = m => x0 + m * sx, Y = m => y0 + H - m * sy;
  const R = {
    g, w, h, sx, sy, X, Y,
    clip() { g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip(); },
    unclip() { g.restore(); },
    rect(x, y, ww, hh, fill) { g.fillStyle = fill; g.fillRect(X(x), Y(y + hh), ww * sx, hh * sy); },
    vgrad(x, y, ww, hh, c0, c1) {   // c0 = 底部颜色, c1 = 顶部颜色
      const gr = g.createLinearGradient(0, Y(y), 0, Y(y + hh));
      gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      g.fillStyle = gr; g.fillRect(X(x), Y(y + hh), ww * sx, hh * sy);
    },
    ell(x, y, rx, ry, fill) { g.fillStyle = fill; g.beginPath(); g.ellipse(X(x), Y(y), rx * sx, ry * sy, 0, 0, Math.PI * 2); g.fill(); },
    glow(x, y, r, color, a = 0.8) {
      const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * sx);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = a; g.fillStyle = gr; g.fillRect(X(x) - r * sx, Y(y) - r * sx, r * 2 * sx, r * 2 * sx); g.globalAlpha = 1;
    },
    text(s, x, y, size, fill, { align = 'center', weight = 800, font = CN_FONT, vertical = false, glow = 0 } = {}) {
      g.save();
      g.fillStyle = fill; g.textAlign = align; g.textBaseline = 'middle';
      g.font = `${weight} ${Math.max(6, Math.round(size * sy))}px ${font}`;
      if (glow) { g.shadowColor = fill; g.shadowBlur = glow; }
      if (vertical) [...s].forEach((ch, i) => g.fillText(ch, X(x), Y(y - i * size * 1.05)));
      else g.fillText(s, X(x), Y(y));
      g.restore();
    },
    line(x0_, y0_, x1, y1, color, wpx = 2) { g.strokeStyle = color; g.lineWidth = wpx; g.beginPath(); g.moveTo(X(x0_), Y(y0_)); g.lineTo(X(x1), Y(y1)); g.stroke(); },
  };
  return R;
}

// 人影：x = 中心，y = 脚底；pose: 'stand' | 'sit' | 'hunch'。圆角形体，避免"像素小人"。
export function person(R, x, y, ht, color, pose = 'stand', rng, rim = 'rgba(255,214,170,0.3)') {
  if (rim) { personShape(R, x + 0.01 * ht, y + 0.006, ht, rim, pose, rng && (() => 0.4)); }
  personShape(R, x, y, ht, color, pose, rng);
}
function personShape(R, x, y, ht, color, pose, rng) {
  const { g } = R;
  const s = ht / 1.7;
  const hr = 0.105 * s;
  const rr = (x0, y0, w, h, r) => {
    g.beginPath();
    if (g.roundRect) g.roundRect(R.X(x0), R.Y(y0 + h), w * R.sx, h * R.sy, r * R.sx); else g.rect(R.X(x0), R.Y(y0 + h), w * R.sx, h * R.sy);
    g.fill();
  };
  g.fillStyle = color;
  if (pose === 'stand') {
    rr(x - 0.14 * s, y, 0.13 * s, 0.84 * s, 0.04);
    rr(x + 0.01 * s, y, 0.13 * s, 0.84 * s, 0.04);
    rr(x - 0.21 * s, y + 0.76 * s, 0.42 * s, 0.66 * s, 0.1 * s);
    rr(x - (rng && rng() < 0.5 ? 0.28 : 0.25) * s, y + 0.8 * s, 0.09 * s, 0.56 * s, 0.04);
    rr(x + 0.18 * s, y + 0.8 * s, 0.09 * s, 0.56 * s, 0.04);
    rr(x - 0.05 * s, y + 1.38 * s, 0.1 * s, 0.1 * s, 0.02);
    R.ell(x, y + 1.56 * s, hr, hr * 1.15, color);
  } else {
    const seat = y + 0.45;
    const lean = pose === 'hunch' ? 0.08 : 0;
    rr(x - 0.22 * s, y, 0.12 * s, 0.47, 0.04);
    rr(x - 0.22 * s, seat - 0.06, 0.44 * s, 0.15 * s, 0.05);
    rr(x - 0.2 * s + lean, seat, 0.4 * s, 0.62 * s, 0.1 * s);
    R.ell(x + lean * 1.5, seat + 0.62 * s + hr * 1.2 - lean * 0.5, hr, hr * 1.15, color);
  }
}

const DISHES = ['毛肚', '鸭肠', '黄喉', '脑花', '耗儿鱼', '鲜毛血旺', '嫩牛肉', '老肉片', '藕片', '贡菜', '午餐肉', '鸭血'];
const NOODLES = [['重庆小面', 8], ['豌杂面', 12], ['牛肉面', 15], ['酸辣粉', 10], ['肥肠面', 15], ['红油抄手', 12], ['炸酱面', 12]];

function tileWall(R, color, line, step = 0.15) {
  R.rect(0, 0, R.w, R.h, color);
  for (let y = 0; y < R.h; y += step) R.rect(0, y, R.w, 0.008, line);
  for (let x = 0; x < R.w; x += step * 1.4) R.rect(x, 0, 0.008, R.h, line);
}
function shelfWall(R, x, w, y0, y1, rng, palette, rows = 5) {
  R.rect(x, y0, w, y1 - y0, 'rgba(20,20,24,0.55)');
  const rh = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * rh;
    R.rect(x, y, w, 0.03, '#9a9a96');
    let cx = x + 0.02;
    while (cx < x + w - 0.05) {
      const pw = rng.range(0.05, 0.14), ph = rh * rng.range(0.45, 0.85);
      R.rect(cx, y + 0.03, pw, ph, rng.pick(palette));
      if (rng() < 0.4) R.rect(cx, y + 0.03 + ph * 0.6, pw, ph * 0.15, 'rgba(255,255,255,0.5)');
      cx += pw + rng.range(0.005, 0.03);
    }
  }
}
function fridge(R, x, y, w, h, rng) {
  R.rect(x - 0.03, y, w + 0.06, h + 0.12, '#c8ccd0');
  R.rect(x, y + 0.05, w, h, '#e8fbff');
  const rows = 5, rh = h / rows;
  const cols = ['#d02020', '#20a040', '#f0c020', '#2060d0', '#ff8020', '#e0e0e0', '#8030c0'];
  for (let r = 0; r < rows; r++) {
    for (let cx = x + 0.03; cx < x + w - 0.06; cx += 0.075) R.rect(cx, y + 0.08 + r * rh, 0.055, rh * 0.62, rng.pick(cols));
    R.rect(x, y + 0.05 + r * rh, w, 0.015, '#9ab');
  }
  R.rect(x + w / 2 - 0.01, y + 0.05, 0.02, h, '#b8c0c8');
  R.text(rng.pick(['冰镇饮料', '冰爽啤酒', '冷饮']), x + w / 2, y + h + 0.06, 0.07, '#d02020');
}

// 后墙通用细节：海报 / 挂历 / 挂钟 / 壁挂电视 / 线槽 / 空调 / 墙脚污渍 + 顶棚与墙角压暗（让平面更有纵深）
function clutter(R, kind, rng) {
  const { w, h } = R;
  const free = (x0, x1) => x1 - x0 > 0.3;
  // 线槽：沿顶部走一圈再竖下来
  R.rect(0, h - 0.22, w, 0.035, 'rgba(230,230,224,0.75)');
  const cx = rng.range(0.15, w - 0.15); R.rect(cx, 0.4, 0.03, h - 0.6, 'rgba(230,230,224,0.6)');
  R.rect(cx - 0.04, 1.25, 0.11, 0.08, '#e8e8e2');                                       // 插座面板
  // 海报 / 奖状 / 营业执照（避开中间主体）
  const posters = kind === 'barber' || kind === 'pharmacy' ? 2 : rng.int(1, 3);
  for (let i = 0; i < posters; i++) {
    const pw = rng.range(0.28, 0.5), ph = pw * rng.range(1.1, 1.45);
    const px = rng() < 0.5 ? rng.range(0.08, 0.5) : rng.range(Math.max(0.1, w - 0.9), Math.max(0.12, w - pw - 0.08));
    const py = rng.range(1.35, Math.max(1.4, h - ph - 0.3));
    if (!free(px, px + pw)) continue;
    const pal = rng.pick([['#c8281e', '#ffd860'], ['#1e5aa8', '#f0f0f0'], ['#e8e0c8', '#a01a1a'], ['#2a7a4a', '#f0e8a0'], ['#f0f0ec', '#3a3a3a']]);
    R.rect(px - 0.012, py - 0.012, pw + 0.024, ph + 0.024, 'rgba(0,0,0,0.25)');
    R.rect(px, py, pw, ph, pal[0]);
    R.rect(px + pw * 0.1, py + ph * 0.55, pw * 0.8, ph * 0.3, 'rgba(255,255,255,0.25)');
    for (let k = 0; k < 3; k++) R.rect(px + pw * 0.12, py + ph * (0.12 + k * 0.12), pw * rng.range(0.4, 0.76), 0.018, pal[1]);
  }
  // 挂钟或挂历
  if (rng() < 0.6) { const x = rng.range(0.3, w - 0.3), y = h - 0.55; R.ell(x, y, 0.13, 0.13, '#f4f0e4'); R.ell(x, y, 0.135, 0.135, 'rgba(0,0,0,0)'); R.line(x, y, x, y + 0.08, '#222', 2); R.line(x, y, x + 0.06, y - 0.02, '#222', 2); }
  else { const x = rng.range(0.2, w - 0.5); R.rect(x, 1.45, 0.3, 0.42, '#f0ece0'); R.rect(x, 1.79, 0.3, 0.08, '#c02020'); for (let k = 0; k < 4; k++) R.rect(x + 0.03, 1.5 + k * 0.07, 0.24, 0.012, 'rgba(0,0,0,0.3)'); }
  // 壁挂电视（发光）
  if (['hotpot', 'noodle', 'tea', 'barber'].includes(kind) && rng() < 0.55 && w > 2.2) {
    const tw = 0.62, tx = rng() < 0.5 ? 0.15 : w - tw - 0.15, ty = h - 0.95;
    R.rect(tx - 0.02, ty - 0.02, tw + 0.04, 0.4, '#0c0c10');
    R.vgrad(tx, ty, tw, 0.36, rng.pick(['#3a7ad0', '#d0603a', '#40a070']), '#e8f0ff');
    R.glow(tx + tw / 2, ty + 0.18, 0.7, 'rgba(150,190,255,0.3)');
  }
  // 空调挂机
  if (rng() < 0.45 && w > 1.8) { const ax = rng.range(0.1, w - 0.85); R.rect(ax, h - 0.5, 0.75, 0.24, '#e4e6e8'); R.rect(ax + 0.05, h - 0.48, 0.65, 0.03, '#b0b4b8'); }
  // 墙脚污渍 + 光影层次（顶棚下沿、墙角压暗；灯下一团亮）
  for (let i = 0; i < 4; i++) R.rect(rng.range(0, w), 0, rng.range(0.1, 0.5), rng.range(0.08, 0.3), 'rgba(30,24,20,0.18)');
  R.vgrad(0, 0, w, 0.5, 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)');
  R.vgrad(0, h - 0.6, w, 0.6, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)');
  for (const [x0, gw] of [[0, 0.35], [w - 0.35, 0.35]]) {
    const gr = R.g.createLinearGradient(R.X(x0), 0, R.X(x0 + gw), 0);
    gr.addColorStop(x0 === 0 ? 0 : 1, 'rgba(0,0,0,0.25)'); gr.addColorStop(x0 === 0 ? 1 : 0, 'rgba(0,0,0,0)');
    R.g.fillStyle = gr; R.g.fillRect(R.X(x0), R.Y(h), gw * R.sx, h * R.sy);
  }
  R.glow(w / 2, h - 0.1, Math.max(0.8, w * 0.45), 'rgba(255,248,230,0.22)');
}

// ------------------------------------------------------------ 后墙
export function paintBack(R, kind, rng) {
  const { w, h } = R;
  R.clip();
  switch (kind) {
    case 'hotpot': {
      R.vgrad(0, 0, w, h, '#4a140e', '#9a3020');
      R.rect(0, 0, w, 0.9, '#2e140c'); R.rect(0, 0.88, w, 0.05, '#7a4a2a');
      const kx = rng.range(0.2, Math.max(0.3, w - 1.3));
      R.rect(kx, 0, 0.95, 2.0, '#ffcf8a');                     // 后厨门洞
      R.rect(kx + 0.05, 1.2, 0.85, 0.04, '#b0a090'); R.rect(kx + 0.05, 1.55, 0.85, 0.04, '#b0a090');
      person(R, kx + rng.range(0.3, 0.65), 0, 1.68, 'rgba(60,24,10,0.92)', 'stand', rng);
      R.glow(kx + 0.5, 1.5, 0.8, 'rgba(255,240,210,0.5)');
      const mx = kx > w / 2 ? 0.15 : kx + 1.15;
      const mw = Math.min(1.7, w - mx - 0.1);
      if (mw > 0.6) {                                           // 菜单板
        R.rect(mx, 1.25, mw, 0.95, '#c8241a');
        R.rect(mx + 0.03, 1.28, mw - 0.06, 0.89, '#a81c14');
        R.text('菜 单', mx + mw / 2, 2.07, 0.13, '#ffd860');
        const n = Math.floor((mw - 0.1) / 0.18);
        for (let i = 0; i < n; i++) {
          R.text(DISHES[(i + rng.int(0, 11)) % DISHES.length], mx + 0.12 + i * 0.18, 1.88, 0.085, '#fff0c0', { vertical: true });
        }
      }
      for (let i = 0, nl = rng.int(2, 4); i < nl; i++) {      // 红灯笼
        const lx = rng.range(0.25, w - 0.25), ly = h - rng.range(0.3, 0.5);
        R.glow(lx, ly, 0.45, 'rgba(255,90,40,0.7)');
        R.ell(lx, ly, 0.13, 0.11, '#ff3a20'); R.rect(lx - 0.05, ly + 0.1, 0.1, 0.04, '#ffd040');
      }
      if (rng() < 0.7) { const tx = w - 0.75; R.rect(tx, h - 0.75, 0.6, 0.38, '#111'); R.rect(tx + 0.03, h - 0.72, 0.54, 0.32, rng.pick(['#4a7ad0', '#d05a4a', '#3ab07a'])); }
      for (let i = 0; i < rng.int(2, 5); i++) R.rect(rng.range(0, w - 0.4), 0, 0.4, 0.28 * rng.int(1, 3), '#2a5a2a');   // 啤酒箱
      break;
    }
    case 'noodle': {
      tileWall(R, '#d8d4c4', 'rgba(0,0,0,0.12)');
      R.rect(0, 0, w, 1.0, '#8a8c90'); R.vgrad(0, 0.85, w, 0.15, '#c0c4c8', '#e8ecf0');   // 不锈钢灶台
      const nb = rng.int(1, 2);
      for (let i = 0; i < nb; i++) {
        const bx = rng.range(0.3, w - 0.6);
        R.rect(bx - 0.25, 1.0, 0.5, 0.35, '#9a9ca0'); R.ell(bx, 1.35, 0.25, 0.03, '#c8ccd0');
        for (let k = 0; k < 6; k++) R.glow(bx + rng.range(-0.15, 0.15), 1.5 + k * 0.17, 0.25, 'rgba(255,255,255,0.35)', 0.6);
      }
      person(R, rng.range(0.6, w - 0.6), 0, 1.65, 'rgba(40,36,34,0.85)', 'stand', rng);
      {                                                        // 调料架 + 碗摞
        const sx = rng() < 0.5 ? 0.1 : w - 1.0;
        R.rect(sx, 1.42, 0.9, 0.03, '#6a5a44');
        for (let k = 0; k < 6; k++) { R.rect(sx + 0.05 + k * 0.14, 1.45, 0.09, 0.16, rng.pick(['#a02010', '#d0a040', '#3a2a1a', '#e8e0d0'])); R.rect(sx + 0.06 + k * 0.14, 1.61, 0.07, 0.03, '#c03020'); }
        for (let k = 0; k < 5; k++) R.ell(rng() < 0.5 ? sx + 0.3 : sx + 0.6, 1.02 + k * 0.035, 0.11, 0.025, k % 2 ? '#f4f0e8' : '#d8d4cc');
      }
      const mw = Math.min(w - 0.3, 2.0), mx = (w - mw) / 2;     // 价目表
      R.rect(mx, 1.75, mw, Math.min(0.75, h - 1.85), '#121418');
      R.text('面 · 粉', mx + mw / 2, 2.38, 0.12, '#ffd040');
      const per = Math.floor(mw / 0.5);
      for (let i = 0; i < per * 2; i++) {
        const [nm, pr] = NOODLES[(i + rng.int(0, 6)) % NOODLES.length];
        const cx = mx + 0.25 + (i % per) * (mw - 0.3) / per, cy = 2.18 - Math.floor(i / per) * 0.2;
        R.text(`${nm} ${pr}`, cx, cy, 0.075, '#f4f4f0', { weight: 700 });
      }
      break;
    }
    case 'store': {
      R.rect(0, 0, w, h, '#d4dcdc');
      const fw = rng.int(1, 2) * 0.62;
      const fx = rng() < 0.5 ? 0.1 : w - fw - 0.1;
      fridge(R, fx, 0, fw, 1.85, rng);
      R.glow(fx + fw / 2, 1.0, 1.2, 'rgba(200,255,255,0.35)');
      const sx = fx < w / 2 ? fx + fw + 0.1 : 0.1;
      shelfWall(R, sx, Math.max(0.3, w - fw - 0.3), 0.05, 2.1, rng, ['#d02a2a', '#f0c020', '#2a70d0', '#30a050', '#f07020', '#e8e8e8', '#9040c0', '#202020']);
      R.rect(0, 2.2, w, 0.3, '#c02020'); R.text(rng.pick(['烟酒副食', '便民超市', '日用百货']), w / 2, 2.35, 0.17, '#fff');
      break;
    }
    case 'tea': {
      R.vgrad(0, 0, w, h, '#4a3018', '#9a7040');
      R.rect(0, 0, w, 1.0, '#3a2414');
      const sx = rng.range(0.4, w - 0.6);
      R.rect(sx - 0.25, 1.15, 0.5, 1.15, '#e8dcc0'); R.rect(sx - 0.27, 2.28, 0.54, 0.05, '#4a2a14');
      R.text(rng.pick(['茶', '和', '静', '福']), sx, 1.75, 0.34, '#2a1a10', { font: '"STKaiti","KaiTi",serif' });
      R.ell(w - 0.4, h - 0.45, 0.15, 0.15, '#f0e8d0'); R.line(w - 0.4, h - 0.45, w - 0.4, h - 0.36, '#222', 2); R.line(w - 0.4, h - 0.45, w - 0.33, h - 0.47, '#222', 2);
      for (let i = 0; i < rng.int(3, 7); i++) {                // 暖水瓶
        const tx = 0.2 + i * 0.16;
        if (tx > w - 0.2) break;
        R.rect(tx, 1.0, 0.11, 0.38, rng.pick(['#c02a2a', '#2a6a3a', '#d0a020', '#3a5aa0']));
        R.rect(tx + 0.02, 1.38, 0.07, 0.05, '#ddd');
      }
      R.text('茶馆', 0.5, 2.15, 0.16, '#ffd890', { glow: 6 });
      break;
    }
    case 'barber': {
      R.rect(0, 0, w, h, '#b8d8e0');
      R.rect(0, 0, w, 0.8, '#40505a');
      const n = Math.max(1, Math.floor((w - 0.2) / 0.9));
      for (let i = 0; i < n; i++) {
        const mx = 0.15 + i * (w - 0.3) / n, mw = (w - 0.3) / n - 0.15;
        R.rect(mx - 0.04, 0.95, mw + 0.08, 1.15, '#f4f8fa');
        R.vgrad(mx, 0.99, mw, 1.07, '#5a7a8a', '#9ac8d8');      // 镜子
        person(R, mx + mw * 0.5, 0.0, 1.5, 'rgba(40,60,70,0.6)', 'sit');
        for (let k = 0; k < 4; k++) R.ell(mx + mw * (k + 0.5) / 4, 2.13, 0.03, 0.03, '#fffbe0');
        R.rect(mx, 0.82, mw, 0.06, '#e0e4e8');
      }
      if (h > 2.4) for (let i = 0; i < 3; i++) { const px = 0.3 + i * (w - 0.6) / 2; R.rect(px - 0.14, 2.25, 0.28, 0.32, '#e8d8c8'); R.ell(px, 2.43, 0.07, 0.08, '#4a2a20'); }
      break;
    }
    case 'pharmacy': {
      R.rect(0, 0, w, h, '#dcece4');
      shelfWall(R, 0.1, w - 0.2, 0.9, 2.15, rng, ['#f4f4f4', '#e0f0e8', '#4aa06a', '#2a7ac0', '#f0f0d0', '#d04040'], 4);
      const cx = w / 2;
      R.glow(cx, 2.35, 0.5, 'rgba(90,255,120,0.7)');
      R.rect(cx - 0.18, 2.29, 0.36, 0.12, '#30e060'); R.rect(cx - 0.06, 2.17, 0.12, 0.36, '#30e060');
      R.rect(0, 0, w, 0.9, '#c8dcd0');
      break;
    }
    case 'hardware': {
      R.rect(0, 0, w, h, '#5a5444');
      for (let y = 0.2; y < h; y += 0.06) for (let x = 0.03; x < w; x += 0.06) R.rect(x, y, 0.012, 0.012, 'rgba(0,0,0,0.35)');
      for (let i = 0; i < w * 8; i++) {                        // 挂着的工具
        const x = rng.range(0.1, w - 0.1), y = rng.range(1.0, h - 0.3), k = rng();
        if (k < 0.35) R.rect(x, y - 0.3, 0.025, 0.3, '#2a2a2a');
        else if (k < 0.6) R.rect(x - 0.06, y - 0.08, 0.12, 0.08, rng.pick(['#c03020', '#d0a020', '#3060a0', '#30803a']));
        else R.ell(x, y - 0.1, 0.08, 0.08, rng.pick(['#3a6ac0', '#c03a2a', '#e0e0e0']));
      }
      for (let x = 0; x < w; x += rng.range(0.35, 0.6)) R.rect(x, 0, rng.range(0.3, 0.55), rng.range(0.3, 1.0), rng.pick(['#8a6a40', '#a07a48', '#6a5034']));
      break;
    }
    case 'empty': {
      R.rect(0, 0, w, h, '#2e2e30');
      for (let i = 0; i < 12; i++) R.rect(rng.range(0, w), rng.range(0, h), rng.range(0.05, 0.6), rng.range(0.3, 1.6), 'rgba(0,0,0,0.25)');
      R.rect(w * 0.3, 1.2, 0.5, 0.7, '#8a8070'); R.text('旺铺', w * 0.3 + 0.25, 1.7, 0.12, '#a01a1a'); R.text('招租', w * 0.3 + 0.25, 1.48, 0.12, '#a01a1a');
      R.glow(w * 0.6, h - 0.3, 0.6, 'rgba(255,220,160,0.6)');
      break;
    }
    case 'window': default: {
      const warm = rng() < 0.7;
      R.vgrad(0, 0, w, h, warm ? '#6a4a30' : '#3a4a6a', warm ? '#c09060' : '#8aa0c0');
      R.rect(w * 0.15, h * 0.4, w * 0.18, h * 0.3, '#e0d0b0'); R.rect(w * 0.15, h * 0.62, w * 0.18, h * 0.06, '#c02020');   // 挂历
      if (!warm || rng() < 0.4) { R.rect(w * 0.55, h * 0.15, w * 0.3, h * 0.28, '#0a0a10'); R.rect(w * 0.57, h * 0.17, w * 0.26, h * 0.24, '#6a9ae0'); R.glow(w * 0.7, h * 0.3, w * 0.4, 'rgba(120,170,255,0.5)'); }
      break;
    }
  }
  if (kind !== 'window' && kind !== 'empty') clutter(R, kind, rng);
  R.unclip();
}

// ------------------------------------------------------------ 中景剪影（透明底）
export function paintMid(R, kind, rng) {
  const { w } = R;
  R.clip();
  R.g.filter = 'blur(1.2px)';
  const sil = { hotpot: 'rgba(40,14,8,0.94)', tea: 'rgba(34,22,10,0.94)', barber: 'rgba(20,34,40,0.9)', pharmacy: 'rgba(20,34,28,0.9)', store: 'rgba(24,28,30,0.92)' }[kind] || 'rgba(22,16,12,0.94)';
  switch (kind) {
    case 'hotpot': {
      const nt = Math.max(1, Math.floor(w / 1.5));
      for (let i = 0; i < nt; i++) {
        const cx = (i + 0.5) * w / nt + rng.range(-0.2, 0.2);
        R.rect(cx - 0.45, 0, 0.06, 0.72, '#1a0c08'); R.rect(cx + 0.39, 0, 0.06, 0.72, '#1a0c08');
        R.rect(cx - 0.55, 0.7, 1.1, 0.06, '#2a1410');
        R.ell(cx, 0.82, 0.22, 0.08, '#2a2a2a'); R.ell(cx, 0.86, 0.19, 0.03, '#ff4020');   // 锅
        R.glow(cx, 0.9, 0.3, 'rgba(255,90,40,0.6)');
        for (let k = 0; k < 6; k++) R.glow(cx + rng.range(-0.15, 0.15), 1.05 + k * 0.16, 0.18 + k * 0.03, 'rgba(255,240,230,0.28)', 0.7);
        for (const sx of [-0.7, 0.7]) {
          if (rng() < 0.8) person(R, cx + sx, 0, 1.6, sil, rng() < 0.5 ? 'sit' : 'hunch');
          R.rect(cx + sx - 0.15, 0, 0.3, 0.45, '#c81c1c');     // 红塑料凳
        }
      }
      break;
    }
    case 'noodle': {
      const nt = Math.max(1, Math.floor(w / 1.3));
      for (let i = 0; i < nt; i++) {
        const cx = (i + 0.5) * w / nt;
        R.rect(cx - 0.4, 0, 0.05, 0.7, '#222'); R.rect(cx + 0.35, 0, 0.05, 0.7, '#222');
        R.rect(cx - 0.45, 0.68, 0.9, 0.05, '#3a3020');
        R.ell(cx - 0.1, 0.76, 0.09, 0.04, '#e8e0d0');
        if (rng() < 0.75) person(R, cx + 0.55, 0, 1.6, sil, 'hunch');
      }
      break;
    }
    case 'store': {
      const cx = rng() < 0.5 ? 0.15 : w - 1.15;
      R.rect(cx, 0, 1.0, 0.95, '#2a2c30'); R.rect(cx, 0.92, 1.0, 0.05, '#7a7c80');
      R.rect(cx + 0.6, 0.97, 0.3, 0.2, '#101418'); R.rect(cx + 0.62, 0.99, 0.26, 0.15, '#3a8ac0');
      person(R, cx + 0.4, 0.35, 1.3, sil, 'stand', rng);
      if (rng() < 0.6) person(R, rng.range(1.4, Math.max(1.5, w - 0.4)), 0, 1.7, sil, 'stand', rng);
      break;
    }
    case 'tea': {
      const nt = Math.max(1, Math.floor(w / 1.7));
      for (let i = 0; i < nt; i++) {
        const cx = (i + 0.5) * w / nt;
        R.glow(cx, 2.0, 0.6, 'rgba(255,210,120,0.55)');
        R.rect(cx - 0.02, 2.0, 0.04, 1.0, '#111');
        R.rect(cx - 0.18, 1.92, 0.36, 0.1, '#2a5a2a');
        person(R, cx - 0.6, 0, 1.6, sil, 'sit'); person(R, cx + 0.6, 0, 1.6, sil, 'hunch');
        R.rect(cx - 0.45, 0, 0.9, 0.74, '#14100c');
        R.rect(cx - 0.5, 0.72, 1.0, 0.06, '#1f7a3a');           // 绿麻将桌
        if (rng() < 0.6) person(R, cx, 0, 1.55, 'rgba(18,10,8,0.85)', 'sit');
      }
      break;
    }
    case 'barber': {
      const n = Math.max(1, Math.floor(w / 1.5));
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * w / n;
        R.rect(cx - 0.3, 0, 0.6, 0.15, '#222'); R.rect(cx - 0.05, 0.15, 0.1, 0.3, '#333');
        R.rect(cx - 0.3, 0.45, 0.6, 0.15, '#7a1a1a'); R.rect(cx - 0.3, 0.55, 0.1, 0.65, '#7a1a1a');
        if (rng() < 0.7) { person(R, cx + 0.05, 0.05, 1.55, sil, 'sit'); person(R, cx + 0.55, 0, 1.68, sil, 'stand', rng); }
      }
      break;
    }
    case 'pharmacy': {
      R.rect(0.2, 0, w - 0.4, 0.95, 'rgba(160,220,210,0.45)'); R.rect(0.2, 0.92, w - 0.4, 0.04, '#e0f0f0');
      for (let x = 0.3; x < w - 0.4; x += 0.2) R.rect(x, 0.3, 0.12, 0.18, 'rgba(255,255,255,0.6)');
      person(R, w * rng.range(0.3, 0.7), 0.3, 1.45, sil, 'stand', rng);
      break;
    }
    case 'hardware': {
      for (let x = 0; x < w; x += rng.range(0.3, 0.6)) {
        let y = 0;
        for (let k = 0; k < rng.int(1, 4); k++) { const bh = rng.range(0.2, 0.4); R.rect(x, y, rng.range(0.25, 0.45), bh, rng.pick(['#5a4428', '#6a5030', '#3a3a3a', '#2a4a6a'])); y += bh; }
      }
      if (rng() < 0.6) person(R, rng.range(0.5, w - 0.5), 0, 1.65, sil, 'stand', rng);
      break;
    }
    case 'empty': {
      if (rng() < 0.6) { const lx = rng.range(0.4, w - 0.6); R.line(lx, 0, lx + 0.35, 1.8, '#3a3630', 5); R.line(lx + 0.4, 0, lx + 0.65, 1.8, '#3a3630', 5); }
      break;
    }
    case 'window': default: {
      if (rng() < 0.8) { R.rect(0, 0, w * rng.range(0.15, 0.35), R.h, rng.pick(['#8a5a3a', '#6a7a9a', '#9a4a4a', '#a09060'])); }
      if (rng() < 0.4) person(R, rng.range(w * 0.4, w * 0.8), -0.6, 1.65, 'rgba(10,8,8,0.85)', 'stand');
      break;
    }
  }
  R.g.filter = 'none';
  R.unclip();
}

// ------------------------------------------------------------ 店面小贴图（各一张，缓存在 tex.canvas 统计里）
export function shutterCanvas(tex) {
  const c = tex.canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    const gr = g.createLinearGradient(0, y, 0, y + 8);
    gr.addColorStop(0, '#c4c8cc'); gr.addColorStop(0.5, '#8a9096'); gr.addColorStop(1, '#5a6066');
    g.fillStyle = gr; g.fillRect(0, y, 256, 8);
  }
  // 锈迹、污渍、小广告
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${90 + i % 3 * 20},${50 + i % 4 * 6},30,${0.05 + (i % 5) * 0.03})`; g.fillRect((i * 53) % 256, (i * 97) % 256, 6 + (i * 7) % 30, 20 + (i * 13) % 90); }
  const ads = ['通下水道', '开锁', '高价回收', '疏通', '办证'];
  for (let i = 0; i < 5; i++) {
    g.fillStyle = ['#f4f0e0', '#f0e080', '#ffffff'][i % 3]; const x = 20 + (i * 71) % 200, y = 60 + (i * 43) % 140;
    g.fillRect(x, y, 30, 20); g.fillStyle = '#a01010'; g.font = `700 7px ${CN_FONT}`; g.fillText(ads[i], x + 2, y + 12);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 240, 256, 16);
  return c;
}

export function fridgeCanvas(tex) {
  const c = tex.canvas(128, 256), g = c.getContext('2d');
  const R = region(g, 0, 0, 128, 256, 0.62, 1.25);
  R.rect(0, 0, 0.62, 1.25, '#203038');
  const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  rng.pick = a => a[Math.floor(rng() * a.length)];
  R.rect(0.02, 0.05, 0.58, 1.12, '#dff8ff');
  const cols = ['#e02020', '#20b040', '#f0c020', '#2060e0', '#ff8020', '#f0f0f0'];
  for (let r = 0; r < 5; r++) {
    for (let x = 0.04; x < 0.56; x += 0.07) R.rect(x, 0.08 + r * 0.22, 0.05, 0.15, rng.pick(cols));
    R.rect(0.02, 0.06 + r * 0.22, 0.58, 0.01, '#8ab');
  }
  R.rect(0, 1.17, 0.62, 0.08, '#c01818'); R.text('冰镇', 0.31, 1.21, 0.06, '#fff');
  return c;
}

export function rentCanvas(tex) {
  const c = tex.canvas(128, 160), g = c.getContext('2d');
  g.fillStyle = '#e8e2cc'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(120,100,60,0.25)'; g.fillRect(0, 120, 128, 40);
  g.fillStyle = '#b01010'; g.textAlign = 'center'; g.font = `900 34px ${CN_FONT}`;
  g.fillText('旺铺', 64, 44); g.fillText('招租', 64, 86);
  g.font = `700 13px ${CN_FONT}`; g.fillStyle = '#222'; g.fillText('电话 139-0000-0000', 64, 128);
  return c;
}

export function boardCanvas(tex, kind) {
  const c = tex.canvas(128, 192), g = c.getContext('2d');
  g.fillStyle = '#141614'; g.fillRect(0, 0, 128, 192);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 184);
  g.textAlign = 'center';
  g.fillStyle = '#ffe070'; g.font = `900 22px ${CN_FONT}`; g.fillText(kind === 'hotpot' ? '今日特价' : '本店推荐', 64, 36);
  const items = kind === 'hotpot' ? [['鲜毛肚', 38], ['鸭肠', 22], ['黄喉', 26], ['脑花', 12], ['啤酒', 5]] : NOODLES.slice(0, 5);
  g.font = `700 15px ${CN_FONT}`;
  items.forEach(([n, p], i) => { g.fillStyle = ['#ffffff', '#8affc0', '#ff9ac0'][i % 3]; g.fillText(`${n}  ${p}元`, 64, 66 + i * 24); });
  return c;
}

export function poleCanvas(tex) {
  const c = tex.canvas(64, 128), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128);
  const cols = ['#e01818', '#ffffff', '#1840e0', '#ffffff'];
  for (let i = -8; i < 16; i++) {
    g.fillStyle = cols[((i % 4) + 4) % 4];
    g.beginPath(); g.moveTo(0, i * 16); g.lineTo(64, i * 16 + 32); g.lineTo(64, i * 16 + 48); g.lineTo(0, i * 16 + 16); g.fill();
  }
  return c;
}

export function stripeCanvas(tex, a, b) {
  const c = tex.canvas(64, 16), g = c.getContext('2d');
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, 16); }
  return c;
}

// 门头瓷砖（90 年代小方砖 / 马赛克），带雨水流挂。颜色偏暗，受光后不至于发白。
export function tileCanvas(tex, kind) {
  const c = tex.canvas(128, 128), g = c.getContext('2d');
  const base = { white: '#8e9296', pink: '#8a6e6c', green: '#5e7068', blue: '#5a6a7e' }[kind] || '#8e9296';
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  const step = kind === 'blue' ? 8 : 16;
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let i = 0; i <= 128; i += step) { g.fillRect(0, i, 128, 1.5); g.fillRect(i, 0, 1.5, 128); }
  let s = kind.length * 7 + 3;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) {
    const x = rnd() * 128, w = 2 + rnd() * 8;
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(20,16,20,0.4)'); gr.addColorStop(1, 'rgba(20,16,20,0.05)');
    g.fillStyle = gr; g.fillRect(x, rnd() * 40, w, 128);
  }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`; g.fillRect(Math.floor(rnd() * 128 / step) * step + 2, Math.floor(rnd() * 128 / step) * step + 2, step - 3, step - 3); }
  return c;
}

// 雨棚波纹板：竖向明暗条（UV 每 0.5 m 重复），乘材质颜色
export function corrCanvas(tex) {
  const c = tex.canvas(64, 64), g = c.getContext('2d');
  for (let x = 0; x < 64; x++) {
    const k = 0.62 + 0.38 * Math.cos(x / 64 * Math.PI * 2 * 6);
    const v = Math.round(255 * k);
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 64);
  }
  g.fillStyle = 'rgba(30,25,20,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect((i * 23) % 64, 0, 3 + (i % 3), 64);
  return c;
}

// 塑料周转筐：格子镂空 + 把手孔（灰度，乘材质颜色）
export function crateCanvas(tex) {
  const c = tex.canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3a3a3a';
  for (let y = 10; y < 54; y += 11) for (let x = 5; x < 60; x += 9) g.fillRect(x, y, 5, 7);
  g.fillStyle = '#202020'; g.fillRect(22, 3, 20, 5);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, 64, 2); g.fillRect(0, 62, 64, 2);
  return c;
}
