// 世界约定（World contract）—— 所有模块共享的坐标、地块、机位、时刻表。
// 规则：单位米；+X 东，-Z 北（下坡方向 / 主视线方向），+Y 上。
// 本文件由主控维护，子模块只读不改（见 docs/DESIGN.md）。
//
// v2 布局「山城观景大阶梯」：
//   坡顶广场(y=40) → 20 m 宽大阶梯一路向北下降 → 坡底观景平台(y=10)
//   → 10 m 挡墙 → 滨江路(y=0) + 轻轨高架 → 江面(y=-4) → 江对岸巨构城市（巨屏、全息、飞船）
//   两侧楼"近低远高"形成 V 形取景框，主镜头站在坡顶俯瞰整座城。

// ---------------------------------------------------------------- 高程
export const Y_UPPER = 40;   // 坡顶广场
export const Y_LOWER = 10;   // 坡底观景平台
export const Y_ROAD = 0;     // 滨江路
export const Y_RIVER = -4;   // 江面

// 坡顶广场（含一条东西向街道）
export const UPPER = { x0: -55, x1: 55, z0: -8, z1: 10 };

// 大阶梯：宽 20 m
export const STAIR = { x0: -10, x1: 10, zTop: -8, zBottom: -100 };

// 梯段：landing = 平台，flight = 台阶。自上而下。
// 每段 { type, z0, z1, y0, y1, steps?, rise?, run? }，z0 > z1（往北递减）
const PLAN = [
  ['landing', 3], ['flight', 30], ['landing', 6], ['flight', 30], ['landing', 4],
  ['flight', 32], ['landing', 6], ['flight', 32], ['landing', 4], ['flight', 32],
  ['landing', 3], ['flight', 32],
];
const RUN = 0.34;
export const FLIGHTS = (() => {
  const totalSteps = PLAN.filter(p => p[0] === 'flight').reduce((s, p) => s + p[1], 0);
  const rise = (Y_UPPER - Y_LOWER) / totalSteps;   // ≈0.16 m
  const out = [];
  let z = STAIR.zTop, y = Y_UPPER;
  for (const [type, n] of PLAN) {
    if (type === 'landing') {
      out.push({ type, z0: z, z1: z - n, y0: y, y1: y });
      z -= n;
    } else {
      const len = n * RUN;
      out.push({ type, z0: z, z1: z - len, y0: y, y1: y - n * rise, steps: n, rise, run: RUN });
      z -= len; y -= n * rise;
    }
  }
  if (z > STAIR.zBottom) out.push({ type: 'landing', z0: z, z1: STAIR.zBottom, y0: Y_LOWER, y1: Y_LOWER });
  return out;
})();

// 坡底观景平台（原 PLAZA 字段名保留）
export const PLAZA = { x0: -60, x1: 60, z0: -100, z1: -122, y: Y_LOWER };
// 平台北缘挡墙：z ∈ [-122, -126]，从 y=10 落到 y=0
export const WALL = { z0: -122, z1: -126 };
// 滨江路：东西走向（原 ROAD 字段名保留），双向 4 车道 + 两侧人行道
export const ROAD = { x0: -400, x1: 400, z0: -126, z1: -146, y: Y_ROAD, lanes: 4, sidewalkS: 3, sidewalkN: 3 };
// 江堤 + 江面
export const RIVER = { zEdge: -150, zFar: -1500, y: Y_RIVER };

// 轻轨：沿江高架，从镜头前横穿中景；东侧穿过一栋站楼（李子坝式）
export const MONORAIL = {
  z: -148, y: 14, x0: -600, x1: 600,
  building: { x0: 56, x1: 80, z0: -158, z1: -138, base: Y_ROAD, floors: 16, floorH: 3.1 },
  period: 70,          // 秒，一个往返周期
  speed: 14,           // m/s
};

// 江对岸巨构城（megacity / hologram / aircraft 模块的舞台）
export const MEGA = {
  zNear: -380, zFar: -1400,          // 江对岸城区纵深
  hero: { x: -40, z: -620, h: 820 }, // 中央地标超高塔「雾都塔」
  holo: { x: 130, z: -330, h: 140 }, // 江面上的全息巨人（站在水上）
  carrier: { x: 250, z: -470, y: 300, len: 620, scale: 0.6 }, // 悬停母舰
  skyLanes: [80, 140, 210, 320],      // 飞车航道高度
};

// ---------------------------------------------------------------- 地块
// 大阶梯两侧楼栋：近低远高，形成 V 形取景框。front = 临梯的立面 x；back = 背面。
// ground = 立面前沿在该地块范围内的最低高程（楼基座从此开始）。
function lot(id, side, z0, z1, height) {
  const front = side === 'W' ? STAIR.x0 : STAIR.x1;
  const back = side === 'W' ? -30 : 30;
  return { id, side, z0, z1, front, back, height, ground: Math.min(stairHeightAt(z0), stairHeightAt(z1)) };
}
export const LOTS = [
  // 楼顶高度大致落在 42–58（坡顶眼高 41.65）：近处 2–3 层与视线齐平，往坡下逐级升高，形成 V 形取景框
  lot('W1', 'W', -8, -24, 8), lot('W2', 'W', -24, -40, 12), lot('W3', 'W', -40, -56, 19),
  lot('W4', 'W', -56, -76, 28), lot('W5', 'W', -76, -100, 34),
  lot('E1', 'E', -8, -20, 9), lot('E2', 'E', -20, -38, 13), lot('E3', 'E', -38, -54, 21),
  lot('E4', 'E', -54, -76, 31), lot('E5', 'E', -76, -100, 36),
];
// 街区：坡顶背后（S），以及两侧山坡层层叠落的楼群（H，朝南，从镜头斜看）
function hill(id, x0, x1, z0, z1, height) {
  return { id, x0, x1, z0, z1, ground: Math.min(stairHeightAt(z0), stairHeightAt(z1)), height, faces: 'S' };
}
export const BLOCKS = [
  { id: 'S1', x0: -52, x1: -6, z0: 10, z1: 24, ground: Y_UPPER, height: 34, faces: 'N' },
  { id: 'S2', x0: 6, x1: 52, z0: 10, z1: 24, ground: Y_UPPER, height: 30, faces: 'N' },
  hill('HW1', -72, -33, -12, -30, 18), hill('HW2', -82, -33, -36, -56, 28),
  hill('HW3', -92, -33, -62, -82, 32), hill('HW4', -100, -33, -86, -104, 40),
  hill('HE1', 33, 72, -12, -30, 20), hill('HE2', 33, 84, -36, -56, 30),
  hill('HE3', 33, 92, -62, -82, 34), hill('HE4', 33, 100, -86, -104, 44),
];

// ---------------------------------------------------------------- 高程函数
export function stairHeightAt(z) {
  if (z >= STAIR.zTop) return Y_UPPER;
  if (z <= STAIR.zBottom) return Y_LOWER;
  for (const f of FLIGHTS) {
    if (z <= f.z0 && z >= f.z1) {
      if (f.type === 'landing') return f.y0;
      const k = Math.min(f.steps - 1, Math.floor((f.z0 - z) / f.run));
      return f.y0 - (k + 1) * f.rise;     // 踏面高度（阶梯离散）
    }
  }
  return Y_LOWER;
}
// 平滑坡度（给相机/角色用，避免逐级抖动）
export function stairRampAt(z) {
  if (z >= STAIR.zTop) return Y_UPPER;
  if (z <= STAIR.zBottom) return Y_LOWER;
  for (const f of FLIGHTS) {
    if (z <= f.z0 && z >= f.z1) {
      if (f.type === 'landing') return f.y0;
      const k = (f.z0 - z) / (f.z0 - f.z1);
      return f.y0 + (f.y1 - f.y0) * k;
    }
  }
  return Y_LOWER;
}

// 任意点地面高程（可走面）。山坡/地块内部返回该 z 处的阶梯高程（山体随坡下降）。
export function heightAt(x, z, smooth = false) {
  if (z > STAIR.zTop) return Y_UPPER;
  if (z > STAIR.zBottom) return smooth ? stairRampAt(z) : stairHeightAt(z);
  if (z > WALL.z0) return Y_LOWER;
  if (z > RIVER.zEdge) return Y_ROAD;
  const k = Math.min(1, (RIVER.zEdge - z) / 3);    // 江堤 3 m 内降到江面
  return Y_ROAD + (Y_RIVER - Y_ROAD) * k;
}

// Actual paved extensions. heightAt remains the original terrain contract for buildings.
export const EXPLORATION = {
  lane: { x: 31.5, width: 2.8, z0: -8, z1: -100 },
  backstreet: { x0: -55, x1: 55, z0: 24, z1: 40 },
  descent: { x0: -56, x1: -32, z: -118, width: 3.4, steps: 60 },
  stairwell: { x0: -58, x1: -26, z0: -115, z1: -122 },
  door: { x0: -35, x1: -29 },
  interiors: [
    { id: 'back-tea', kind: 'tea', name: '梯后茶馆', x: -16, z0: 31, z1: 38.2, width: 9, y: 40 },
    { id: 'back-store', kind: 'store', name: '山巷杂货', x: 16, z0: 31, z1: 38.2, width: 9, y: 40 },
  ],
};
// ---------------------------------------------------------------- v4 扩展区（districts 模块）
// 注意：本节矩形一律 z0 < z1（与上面 STAIR 的"z0 > z1"相反）。a = |x|，两侧对称。
// terrain 的山体台地每 8 m 一级、顶面 = 该级北端阶梯高程；新路面必须始终不低于台地顶。
export function terraceTop(z) {
  if (z >= STAIR.zTop) return Y_UPPER;
  const k = Math.ceil((STAIR.zTop - z) / 8 - 1e-6);
  return stairHeightAt(Math.max(STAIR.zBottom, STAIR.zTop - 8 * Math.max(1, k)));
}
export const DISTRICTS = {
  // 两侧山坡巷：L1–L3 是山坡楼群之间的横巷（平），path 是楼群西/东尽头的后山梯道（连起三条横巷）
  hill: {
    a0: 32.9, a1: 106,
    lanes: [
      // z0/z1 = 两侧楼之间的整条缝；mz0/mz1 = 与梯巷交汇的口子（梯巷高程在此段与横巷相差 < 0.9 m）
      { id: 'L1', z0: -36, z1: -30, mz0: -33.5, mz1: -30.5, y: 32.85 },
      { id: 'L2', z0: -62, z1: -56, mz0: -59.4, mz1: -56.4, y: 25.32 },
      { id: 'L3', z0: -86, z1: -82, mz0: -85.6, mz1: -82.6, y: 15.11 },
    ],
    path: { a0: 102, a1: 106 },
  },
  // 坡顶后方新街区（y=40，坡上巷 y=44.8）
  south: {
    main: { x0: -5.5, x1: 5.5, z0: 40, z1: 82 },
    plaza: { x0: -12, x1: 12, z0: 56, z1: 76 },
    cross: { x0: -56, x1: 56, z0: 62, z1: 70 },
    steps: { x0: -5.5, x1: 5.5, z0: 82, z1: 92, y0: Y_UPPER, y1: 44.8, n: 30 },
    upper: { x0: -36, x1: 36, z0: 92, z1: 98, y: 44.8 },
  },
  // 滨江路两头延伸：南侧骑楼街 + 江边趸船
  river: {
    a0: 62, a1: 200,
    arcade: { z0: -128.6, z1: -126, y: 4.2 },
    gangway: { x0: -107, x1: -103, z0: -157, z1: -149.6, y0: Y_ROAD + 0.15, y1: -2.3, n: 16 },
    deck: { x0: -117, x1: -93, z0: -167, z1: -157, y: -2.3 },
  },
};
const _steps = (t, y0, y1, n, smooth) => {
  const k = Math.max(0, Math.min(1, t));
  return y0 + (y1 - y0) * (smooth ? k : Math.min(n, Math.floor(k * n) + 1) / n);
};
// 后山梯道：两条横巷之间按约 0.16 m 踏步匀速下降（terrain 台地止于梯道内侧，梯道自带基础）
export function hillPathY(z, smooth = false) {
  const ls = DISTRICTS.hill.lanes;
  for (const ln of ls) if (z >= ln.z0 && z <= ln.z1) return ln.y;
  for (let i = 0; i < ls.length - 1; i++) {
    const a = ls[i], b = ls[i + 1];          // a 在南（z 大），b 在北
    if (z < a.z0 && z > b.z1) {
      const n = Math.round((a.y - b.y) / 0.16);
      return _steps((a.z0 - z) / (a.z0 - b.z1), a.y, b.y, n, smooth);
    }
  }
  return null;
}
// 扩展区可走高程；不在扩展区返回 null
export function districtHeightAt(x, z, smooth = false) {
  const D = DISTRICTS, a = Math.abs(x), H = D.hill;
  if (a >= H.a0 && a <= H.a1) {
    for (const ln of H.lanes) if (z >= ln.z0 && z <= ln.z1) return ln.y;
    if (a >= H.path.a0 && z < H.lanes[0].z1 && z > H.lanes[H.lanes.length - 1].z0) {
      const y = hillPathY(z, smooth);
      if (y != null) return y;
    }
  }
  const S = D.south;
  if (z > S.main.z0) {
    if (z >= S.upper.z0 && a <= S.upper.x1 + 20) return S.upper.y;
    if (z >= S.steps.z0 && x >= S.steps.x0 && x <= S.steps.x1)
      return _steps((z - S.steps.z0) / (S.steps.z1 - S.steps.z0), S.steps.y0, S.steps.y1, S.steps.n, smooth);
    return Y_UPPER;
  }
  const g = D.river.gangway, k = D.river.deck;
  if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return _steps((g.z1 - z) / (g.z1 - g.z0), g.y0, g.y1, g.n, smooth);
  if (x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1) return k.y;
  return null;
}

export function walkHeightAt(x, z, smooth = false) {
  const dh = districtHeightAt(x, z, smooth);
  if (dh != null) return dh;
  const { descent: d, stairwell: p, door } = EXPLORATION;
  if (x >= p.x0 && x <= p.x1 && z <= p.z0 && z >= p.z1) {
    if (x < d.x0) return Y_LOWER;
    if (Math.abs(z-d.z) > d.width/2) return Y_ROAD;
    if (x > d.x1) return Y_ROAD;
    const t = Math.max(0, Math.min(1, (x - d.x0) / (d.x1 - d.x0)));
    return Y_LOWER * (1 - (smooth ? t : Math.min(d.steps, Math.floor(t * d.steps) + 1) / d.steps));
  }
  if (x >= door.x0 && x <= door.x1 && z <= p.z1 && z >= ROAD.z0) return Y_ROAD;
  if (z <= ROAD.z0 && z >= RIVER.zEdge) {
    return z >= ROAD.z0 - ROAD.sidewalkS || z <= ROAD.z1 + ROAD.sidewalkN ? 0.15 : Y_ROAD;
  }
  return heightAt(x, z, smooth);
}

// ---------------------------------------------------------------- 模块所有权（XZ 包围盒，check.mjs 用于越界检查；z0 > z1）
const ALL = { x0: -3000, x1: 3000, z0: 3000, z1: -3000 };
const STREET = { x0: -36, x1: 36, z0: 12, z1: -150 };
export const ZONES = {
  environment: [ALL],
  terrain: [{ x0: -410, x1: 410, z0: 40, z1: -160 }],
  buildingsW: [{ x0: -32, x1: -9.9, z0: -7, z1: -101 }, { x0: -54, x1: -4, z0: 26, z1: 8 }, { x0: -102, x1: -31, z0: -10, z1: -106 }],
  buildingsE: [{ x0: 9.9, x1: 32, z0: -7, z1: -101 }, { x0: 4, x1: 54, z0: 26, z1: 8 }, { x0: 31, x1: 102, z0: -10, z1: -106 }],
  signs: [STREET, { x0: -102, x1: 102, z0: -10, z1: -106 }],
  shops: [STREET],
  exploration: [{ x0: -60, x1: 60, z0: 40, z1: -130 }],
  // v4 扩展区：两侧山坡巷+后山梯道、坡顶后方新街区、滨江两头骑楼街与趸船
  districts: [{ x0: -124, x1: 124, z0: -10, z1: -104 }, { x0: -74, x1: 74, z0: 118, z1: 38 }, { x0: -206, x1: 206, z0: -96, z1: -170 }],
  monorail: [{ x0: -610, x1: 610, z0: -128, z1: -170 }],
  traffic: [{ x0: -410, x1: 410, z0: -124, z1: -150 }, { x0: -60, x1: 60, z0: 12, z1: -10 }],
  props: [STREET],
  wires: [{ x0: -60, x1: 60, z0: 26, z1: -125 }],
  characters: [STREET, { x0: -410, x1: 410, z0: -124, z1: -152 }, { x0: -124, x1: 124, z0: -10, z1: -104 }, { x0: -74, x1: 74, z0: 118, z1: 38 }, { x0: -206, x1: 206, z0: -96, z1: -170 }],
  megacity: [ALL],
  hologram: [ALL],
  aircraft: [ALL],
  weather: [ALL],
};

// 性能预算（check.mjs 强制）：tris = 三角面（实例化按实例数计），lights = 光场登记数，halos = 光晕数
export const BUDGET = {
  environment: { tris: 300e3, lights: 12, halos: 500 },
  terrain:     { tris: 260e3, lights: 30, halos: 60 },
  buildingsW:  { tris: 450e3, lights: 40, halos: 60 },
  buildingsE:  { tris: 450e3, lights: 40, halos: 60 },
  monorail:    { tris: 180e3, lights: 24, halos: 80 },
  signs:       { tris: 160e3, lights: 240, halos: 260 },
  shops:       { tris: 260e3, lights: 120, halos: 120 },
  exploration: { tris: 35e3, lights: 16, halos: 16 },
  districts:   { tris: 560e3, lights: 110, halos: 120 },
  traffic:     { tris: 160e3, lights: 60, halos: 160 },
  props:       { tris: 220e3, lights: 40, halos: 60 },
  wires:       { tris: 90e3, lights: 6, halos: 40 },
  characters:  { tris: 200e3, lights: 0, halos: 0 },
  megacity:    { tris: 400e3, lights: 8, halos: 400 },
  hologram:    { tris: 150e3, lights: 6, halos: 40 },
  aircraft:    { tris: 250e3, lights: 10, halos: 300 },
  weather:     { tris: 80e3, lights: 0, halos: 0 },
};

// 模块构建顺序（main.js 按此顺序加载；新增模块须先在此登记）
export const MODULES = ['environment', 'terrain', 'buildingsW', 'buildingsE', 'monorail', 'megacity', 'hologram', 'aircraft',
  'shops', 'signs', 'wires', 'props', 'traffic', 'exploration', 'districts', 'characters', 'weather'];

// ---------------------------------------------------------------- 预设机位（shot.mjs --cams 可直接用名字）
// [x, y, z, yaw, pitch]  yaw=0 朝 -Z（北/下坡），yaw 正值向左（朝 -X）转；y=0 表示贴地（自动加眼高）
export const CAMS = {
  hero:     [0.5, Y_UPPER + 1.65, -9, 0.0, 0.06],          // 坡顶阶梯口俯瞰：阶梯 + 两侧街市 + 江对岸巨构城（含母舰）
  mid:      [-4, 0, -52, 0.08, 0.02],
  up:       [3, 0, -98, Math.PI - 0.05, 0.2],             // 坡底回望大阶梯
  terrace:  [0, 0, -119, 0.0, 0.06],                      // 观景平台栏杆边：江 + 轻轨 + 巨构城
  road:     [-40, 0, -136, -1.25, 0.06],                  // 滨江路
  vista:    [0, 75, -40, 0.0, -0.02],                     // 高空：整座巨构城
  overview: [95, 140, 40, 0.62, -0.42],
  lane:     [-31.5, 0, -32, 0, -0.12],
  interior: [-16, 0, 33, Math.PI, 0.04],
  riverwalk: [-55.4, 0, -118, -Math.PI / 2, -0.24],
  promenade: [8, 0, -147, 0, 0.03],
  backstreet: [0, 0, 28, -Math.PI / 2, 0.04],
};
export const EYE = 1.65;

// 世界时钟：一个 120 s 循环，模块可用来同步动画
export const LOOP = 120;
