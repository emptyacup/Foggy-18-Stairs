// buildingsW / buildingsE 共用：按 layout 地块 + 街区生成一侧的楼。
// v2「山城观景大阶梯」：
//   - 梯坎两侧地块（W1–W5 / E1–E5）：临梯立面外挑 ≤ 1.2 m（V 形取景框），屋顶生活气拉满（hero 视线高度）。
//   - 山坡街区（HW* / HE*）：沿 z 切成前中后三排、沿 x 切成多栋，各自落在自己那级台地上，
//     高度错落、偶有巷道空档与吊脚木楼（悬挑朝南、远离中轴）——从坡顶看是层层叠落的山城。
//   - 坡顶背后街区（S1/S2）：保持原样。
//   - 光场预算：每侧 ≤ 40（窗口溢光只留离阶梯近的低层，屋顶灯按配额分配）。
// 相邻楼之间随机留窄缝（cutA/cutB），侧墙只在高出邻楼的部分开窗。
import { buildTower } from './tower.js';
import { Builder } from './tower-geo.js';
import { NEON } from '../../core/palette.js';

const LOT_MAX_OUT = 1.2;
// 主阶梯两侧可进入的店（都在梯坎平台段，门口地面平）：z 范围 + 店种；shops 按此对齐开间并搭房间
const LOT_ROOMS = {
  E2: { z0: -25.5, z1: -21.5, kind: 'hotpot' },
  E3: { z0: -41.3, z1: -38.3, kind: 'barber' },
  W3: { z0: -55.8, z1: -52.5, kind: 'tea' },
  W4: { z0: -73.0, z1: -69.3, kind: 'noodle' },
  E4: { z0: -73.0, z1: -69.3, kind: 'store' },
};
export const LOT_ROOM_DEPTH = 5.4;                 // 临梯立面相对 x=±10 的最大外挑
// 屋顶小霓虹（虚构店名；避开 signs 的楼顶大字 W2/W4/E3/E5；W1 在牌坊之前；W3/E4 用高广告架越过横梁）
const ROOF_NEON = {
  W1: { text: '屋顶茶座', color: NEON.amber, color2: NEON.hotpot },
  W3: { text: '麻将', color: NEON.green, color2: NEON.teal },
  E4: { text: '天台烧烤', color: NEON.hotpot, color2: NEON.amber },
  W5: { text: '旅社', color: NEON.cyan, color2: NEON.white },
};
const HILL_NEON = ['棋牌', '住宿', '冰室', '录像厅', '茶馆', '发廊', '小卖部', '烧烤'];
const HILL_NEON_SET = [['pink', 'white'], ['cyan', 'magenta'], ['amber', 'orange'], ['green', 'teal'], ['violet', 'pink']];

// terrain 的山体台地：从 z=-8 起每 8 m 一级，顶面 = 该级北端的阶梯高程
function terraceTop(L, z) {
  if (z >= L.STAIR.zTop) return L.Y_UPPER;
  const k = Math.ceil((L.STAIR.zTop - z) / 8 - 1e-6);
  return L.stairHeightAt(Math.max(L.STAIR.zBottom, L.STAIR.zTop - 8 * Math.max(1, k)));
}

export function buildSide(ctx, side) {
  const { L } = ctx;
  const rng = ctx.rng('side');
  const out = [];
  // 每组楼共用一个累加器：同材质的零件合成一个 Mesh（组内包围盒中心落在本模块区域内）
  const BL = new Builder(ctx);

  // ---------------- 梯坎两侧地块（按 z 从上往下排）
  const lots = L.LOTS.filter(l => l.side === side).sort((a, b) => b.z0 - a.z0);
  const tops = lots.map(l => l.ground + l.height);
  // 每条地块边界的缝宽（两栋各收一半），约 70% 的边界留缝
  const gaps = lots.map(() => (rng() < 0.7 ? rng.range(0.3, 1.0) : 0));
  lots.forEach((lot, i) => {
    const podiumTop = Math.max(L.stairHeightAt(lot.z0), L.stairHeightAt(lot.z1)) + 4.2;
    const face = side === 'W' ? 'E' : 'W';
    // z0 端（高处）与 z1 端（低处）的缝宽 / 邻楼楼顶
    const cut0 = i > 0 ? gaps[i - 1] / 2 : 0, cut1 = i < lots.length - 1 ? gaps[i] / 2 : 0;
    const min0 = i > 0 ? tops[i - 1] : -1e9, min1 = i < lots.length - 1 ? tops[i + 1] : -1e9;
    // 立面 u=0 端：E 向立面在 z 大端（z0），W 向立面在 z 小端（z1）
    const aIsZ0 = face === 'E';
    const room = LOT_ROOMS[lot.id];
    const holes = room ? [{ ...room, x0: Math.min(lot.front, lot.front + Math.sign(lot.front) * LOT_ROOM_DEPTH) - 0.05,
      x1: Math.max(lot.front, lot.front + Math.sign(lot.front) * LOT_ROOM_DEPTH) + 0.05 }] : [];
    out.push(buildTower(ctx, {
      id: lot.id, x0: lot.front, x1: lot.back, z0: lot.z0, z1: lot.z1, podiumHoles: holes,
      ground: lot.ground - 1, podiumTop, height: lot.height + 1,
      face, setback: rng.range(0, 0.5), maxOut: LOT_MAX_OUT,
      old: true, sides: true, lights: 3, lightsLow: true,
      roofLight: i < 4 ? 1 : 0, roofRich: i < 3 ? 1.6 : 1.1, roofNeon: ROOF_NEON[lot.id], roofFront: true, roofStrings: i < 2 ? 2 : 1,
      cutA: aIsZ0 ? cut0 : cut1, cutB: aIsZ0 ? cut1 : cut0,
      sideMinA: aIsZ0 ? min0 : min1, sideMinB: aIsZ0 ? min1 : min0,
      reserveZ: lot.z0 - 2.8,          // 楼顶大字招牌（signs）立在地块南端
    }, BL));
  });
  BL.flush(ctx.staticRoot, 'lots-' + side);

  // ---------------- 坡顶背后街区（S1/S2），沿长边切成几栋，高低错落
  for (const b of L.BLOCKS.filter(b => b.faces !== 'S' && (side === 'W' ? b.x1 <= 0 : b.x0 >= 0))) {
    const parts = [];
    let x = b.x0;
    while (x < b.x1 - 4) {
      let w = Math.min(b.x1 - x, rng.range(9, 15));
      if (b.x1 - (x + w) < 5) w = b.x1 - x;          // 不留过窄的尾巴
      parts.push({ x0: x, x1: x + w, h: b.height * rng.range(0.65, 1.2) });
      x += w;
    }
    const BB = new Builder(ctx);
    const bg = parts.map(() => (rng() < 0.6 ? rng.range(0.3, 0.9) : 0));
    parts.forEach((p, k) => {
      const top = b.ground + p.h;
      const cutL = k > 0 ? bg[k - 1] / 2 : 0, cutR = k < parts.length - 1 ? bg[k] / 2 : 0;   // x 小端 / x 大端
      const minL = k > 0 ? b.ground + parts[k - 1].h : -1e9, minR = k < parts.length - 1 ? b.ground + parts[k + 1].h : -1e9;
      const aIsXmin = b.faces === 'S';                // S 向立面 u=0 在 x 小端；N 向在 x 大端
      out.push(buildTower(ctx, {
        id: `${b.id}-${k}`, x0: p.x0, x1: p.x1, z0: b.z0, z1: b.z1,
        ground: b.ground - 1, podiumTop: b.ground + 4.5, height: top - b.ground + 1,
        face: b.faces, setback: rng.range(0, 0.6),
        old: true, sides: true, lights: 1, roofLight: false,
        cutA: aIsXmin ? cutL : cutR, cutB: aIsXmin ? cutR : cutL,
        sideMinA: aIsXmin ? minL : minR, sideMinB: aIsXmin ? minR : minL,
      }, BB));
    });
    BB.flush(ctx.staticRoot, 'block-' + b.id);
  }

  // ---------------- 山坡街区（朝南，层层叠落）
  let hillLights = 0;
  const HILL_LIGHTS = 12;                       // 本侧山坡屋顶光场总配额
  L.BLOCKS.filter(b => b.faces === 'S' && (side === 'W' ? b.x1 <= 0 : b.x0 >= 0)).forEach((b, bi) => {
    const hr = ctx.rng('hill-' + b.id);
    const BB = new Builder(ctx);
    // 前中后三排：前排（南，高处台地）矮，越往后越高，立面与屋顶一层层露出来；排与排之间偶留窄巷
    const D = b.z0 - b.z1, za = b.z0 - D * hr.range(0.28, 0.34), zb = b.z0 - D * hr.range(0.6, 0.66);
    const rows = [
      { z0: b.z0, z1: za, kH: [0.22, 0.5], r: 0 },
      { z0: za - (hr() < 0.5 ? hr.range(0.6, 1.2) : 0), z1: zb, kH: [0.5, 0.85], r: 1 },
      { z0: zb - (hr() < 0.5 ? hr.range(0.6, 1.2) : 0), z1: b.z1, kH: [0.8, 1.3], r: 2 },
    ];
    const near = side === 'W' ? b.x1 : b.x0;            // 靠近阶梯的一端
    let neonLeft = 1;                                   // 每个街区一块屋顶小霓虹（中排或后排、靠阶梯一侧）
    for (const row of rows) {
      const parts = [];
      let x = b.x0 + (row.r ? hr.range(0, 2.5) : 0);
      while (x < b.x1 - 5) {
        let w = Math.min(b.x1 - x, hr.range(7, 13));
        if (b.x1 - (x + w) < 6) w = b.x1 - x;
        if (parts.length && hr() < 0.14 && b.x1 - x > 14) { x += hr.range(2, 3.2); continue; }   // 巷道空档（梯道）
        // 离阶梯越远越矮一点（山脊往两侧落）；再加随机起伏
        const far = Math.abs((x + w / 2) - near) / Math.abs(b.x1 - b.x0);
        const nF = Math.max(2, Math.round(b.height * hr.range(...row.kH) * (1 - 0.3 * far) / 3 + hr.range(-1.2, 1.2)));
        parts.push({ x0: x, x1: x + w, nF, sb: hr.range(0, row.r === 0 ? 2.2 : 1.2) });
        x += w;
      }
      const gnd = Math.min(terraceTop(L, row.z0), terraceTop(L, row.z1)) - 0.3;   // 台地顶（取低者，基座埋进高的那级）
      const front = terraceTop(L, row.z0);                                          // 南立面脚下那级台地
      const bg = parts.map(() => (hr() < 0.6 ? hr.range(0.3, 0.9) : 0));
      parts.forEach((p, k) => {
        const podiumTop = Math.max(front, gnd) + hr.range(3.2, 4.4);
        const top = podiumTop + p.nF * 3.0;
        const adjL = parts[k - 1], adjR = parts[k + 1];
        const touchL = adjL && Math.abs(adjL.x1 - p.x0) < 0.01, touchR = adjR && Math.abs(adjR.x0 - p.x1) < 0.01;
        const cutL = touchL ? bg[k - 1] / 2 : 0, cutR = touchR ? bg[k] / 2 : 0;
        const minL = touchL ? podiumTop + adjL.nF * 3.0 : -1e9, minR = touchR ? podiumTop + adjR.nF * 3.0 : -1e9;
        const nearStair = Math.abs((p.x0 + p.x1) / 2 - near) < 16;
        let roofLight = 0;
        if (hillLights < HILL_LIGHTS && hr() < (nearStair ? 0.7 : 0.35)) { roofLight = 1; hillLights++; }
        let roofNeon;
        if (neonLeft && nearStair && row.r > 0) {
          neonLeft--;
          const [c1, c2] = hr.pick(HILL_NEON_SET);
          roofNeon = { text: HILL_NEON[(bi * 2 + (side === 'E' ? 1 : 0)) % HILL_NEON.length], color: NEON[c1], color2: NEON[c2] };
        }
        out.push(buildTower(ctx, {
          id: `${b.id}-${row.r}${k}`, x0: p.x0, x1: p.x1, z0: row.z0, z1: row.z1,
          ground: gnd - 1, podiumTop, height: top - gnd + 1,
          face: 'S', setback: p.sb,
          old: true, sides: true, lights: 0, lit: hr.range(0.25, 0.5),
          stilt: row.r === 0 && p.nF >= 5 && hr() < 0.35,
          roofLight, roofRich: nearStair ? 1.1 : 0.75, roofNeon,
          cutA: cutL, cutB: cutR, sideMinA: minL, sideMinB: minR,
        }, BB));
      });
    }
    BB.flush(ctx.staticRoot, 'hill-' + b.id);
  });
  ctx.provide('facades', [...(ctx.use('facades') || []), ...out]);
  return out;
}
