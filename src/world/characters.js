// characters —— 雨夜十八梯的人：撑伞上下梯坎的行人、斑马线前等灯/过街的人、店门口站着的、
// 火锅桌边坐着吃的、墙根蹲着抽烟的、挑扁担的"棒棒"、滨江路人行道和江边的人。
// 全部人物共用一套分段骨架（lib/characters-rig.js，部件实例化），位置/姿态只由时间 t 决定。
import { makeRig, HIP_H } from './lib/characters-rig.js';
import { Route } from './lib/characters-routes.js';
import { CYCLE, W0, crossingX } from './lib/traffic-signals.js';

const COATS = [0x1a1c22, 0x2a2c34, 0x6a2a30, 0x3c4048, 0x7a5a3a, 0x2c3a58, 0x8a6a48, 0x6e7078, 0x3a5a4a, 0x9a8a70, 0xa8acb2, 0x4e3a5a, 0x2a4a6a, 0x5a4a3a];
const PANTS = [0x15161a, 0x1c2840, 0x22252e, 0x2e3038, 0x3a3a40, 0x1a1a1e, 0x40382e];
const SKIN = [0xc09276, 0xb08266, 0xcca084, 0x9e7058, 0xd2aa8e];
const CAPS = [0x15161a, 0x1c2840, 0x8a1a1e, 0x3a4436, 0x9a9ea4];
const HAIR = [0x0c0b0b, 0x141110, 0x1e1814, 0x3a2a20, 0x5a5a5e, 0x0e0d0f];
const INNER = [0xb4b8be, 0x9a9ea4, 0x2a2c34, 0x8a1a1e, 0x3c6f8a, 0x9a8a5a, 0x5a3a5a];
const SCARF = [0x8a1a1e, 0x9a8a1c, 0x2a5a8a, 0x6a6e76, 0x7a3a5a, 0x3a6a5a];
const RAINCOAT = [0x9a8a1c, 0x8a1a1e, 0x2a5a8a, 0x3a6a4a, 0x8a4a6a];
const VISOR = [0x22e6ff, 0xff2fd0, 0x7dff4a, 0xffb03a];
const UMB = [0x8a1a1e, 0x9a1e24, 0x141418, 0x18181c, 0x1e2a50, 0x1f4a3a, 0x9a8a1c, 0x8a3a5a, 0x2a5a8a, 0x5a2a6a];
const STOOLS = [0x8a1a1e, 0x1e3a7a, 0x8a1a1e, 0x2a6a4a];

export function build(ctx) {
  const { L } = ctx;
  const rng = ctx.rng('characters');
  const detailRng = ctx.rng('characters-details-v3');
  const outfitRng = ctx.rng('characters-outfit-v4');   // 新增衣着字段单独取随机数，不扰动既有站位/路线
  const walk = ctx.use('walkways') || [];
  const fronts = ctx.use('shopfronts') || null;
  const blocked = (x, z, r = 0.3, ignore) => walk.some(w => w !== ignore && x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r);
  const onStair = (z) => z < L.STAIR.zTop - 0.5 && z > L.STAIR.zBottom && Math.abs(L.stairRampAt(z + 0.15) - L.stairRampAt(z - 0.15)) > 0.02;
  const ground = (x, z, smooth = true) => {
    const R = L.ROAD;
    const sidewalk = z <= R.z0 && z >= R.z1 && (z >= R.z0 - R.sidewalkS || z <= R.z1 + R.sidewalkN);
    return sidewalk ? R.y + 0.15 : (L.walkHeightAt || L.heightAt)(x, z, smooth);
  };
  const routeFree = (pts, r = 0.35) => pts.every(([x, z], i) => {
    if (!i) return !blocked(x, z, r);
    const [ax, az] = pts[i - 1], n = Math.ceil(Math.hypot(x - ax, z - az) / 0.25);
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      if (blocked(ax + (x - ax) * t, az + (z - az) * t, r)) return false;
    }
    return true;
  });
  const stairLane = (side, za, zb) => [5.3, 5.8, 6.3, 6.8, 7.3, 4.5, 4.1]
    .map(x => side * x).find(x => routeFree([[x, za], [x, zb]]));

  const people = [];
  const look = (o = {}) => {
    const c = {
      coat: rng.pick(COATS), pants: rng.pick(PANTS), skin: rng.pick(SKIN), hair: rng.pick(HAIR),
      umbrella: rng.pick(UMB), stool: rng.pick(STOOLS), bag: rng.pick([0x9a9ea4, 0x8a1a1e, 0x2a5a8a, 0xb4b8be]),
      style: rng.weighted([['short', 5], ['long', 3], ['hood', 1.5], ['cap', 1.5]]), cap: rng.pick(CAPS),
      ...o,
    };
    // 发型细分、服装层次、配件
    const r = outfitRng;
    if (c.style === 'short') c.style = r.weighted([['short', 3], ['buzz', 2], ['bun', 0.6]]);
    else if (c.style === 'long') c.style = r.weighted([['long', 2], ['bob', 1.5], ['ponytail', 1.5]]);
    const fem = ['long', 'bob', 'ponytail', 'bun'].includes(c.style);
    c.outfit = o.outfit ?? r.weighted([['jacket', 5], ['trench', 2], ['skirt', fem ? 2.5 : 0], ['raincoat', 0.9]]);
    if (c.outfit === 'raincoat' && !o.style) { c.coat = r.pick(RAINCOAT); c.hoodColor = c.coat; c.style = r.chance(0.6) ? 'hood' : c.style; }
    if (c.outfit === 'skirt') c.skirt = r.pick([0x1a1c22, 0x2c3a58, 0x6a2a30, 0x8a6a48, 0x5a4a3a]);
    c.inner = r.chance(0.7) ? r.pick(INNER) : null;
    c.scarf = r.chance(0.18) ? r.pick(SCARF) : null;
    c.backpack = r.chance(0.2);
    c.pack = r.pick([0x1a1c22, 0x2c3a58, 0x3a5a4a, 0x6a2a30, 0x6e7078]);
    c.acc = r.weighted([[null, 6], ['mask', 1.4], ['glasses', 1.4], ['visor', 0.5]]);
    c.maskColor = r.pick([0xb4b8be, 0x9ab4c8, 0x7a8ea8]);   // 不用近黑色：正面看像胡子
    c.visorColor = r.pick(VISOR);
    return c;
  };
  // 伞的类型：多数人打伞；透明伞是雨夜的灵魂；极少数人拿发光伞杆的伞
  let ledLeft = 2;
  const umbrellaKind = (p = 0.9) => {
    if (!rng.chance(p)) return null;
    if (ledLeft > 0 && rng.chance(0.08)) { ledLeft--; return 'led'; }
    return rng.chance(0.38) ? 'clear' : 'open';
  };
  const add = (o) => { o.i = people.length; o.s = o.s ?? rng.range(0.94, 1.05); o.seed = rng.range(0, 100); o.expression = detailRng.pick(['neutral', 'smile', 'stern']); people.push(o); return o; };

  // ------------------------------------------------------------ 1. 梯坎上下的行人（环线：右侧下行、左侧上行，在平台处折返）
  const landings = L.FLIGHTS.filter(f => f.type === 'landing').map(f => (f.z0 + f.z1) / 2);
  const loops = [[1, 2, 2], [2, 3, 2], [1, 4, 2], [3, 5, 2], [4, 6, 2], [2, 5, 1]];
  for (const [a, b, n] of loops) {
    const za = landings[a], zb = landings[b];
    const xd = stairLane(1, za, zb), xu = stairLane(-1, za, zb);
    if (xd == null || xu == null || !routeFree([[xd, za], [xd, zb], [xu, zb], [xu, za], [xd, za]])) continue;
    const pf = rng.range(0.9, 1.1);
    const route = new Route([[xd, za], [xd, zb], [xu, zb], [xu, za]], { closed: true });
    const speed = (x, z) => (onStair(z) ? (x > 0 ? 0.62 : 0.47) : 1.1) * pf;
    const stride = (x, z) => (onStair(z) ? 0.68 : 1.3);
    route.walk(route.node(1), speed, stride).wait(rng.chance(0.5) ? rng.range(1.5, 5) : 0)
      .walk(route.node(3), speed, stride).wait(rng.chance(0.5) ? rng.range(1.5, 4) : 0)
      .walk(route.length, speed, stride).finish();
    for (let j = 0; j < n; j++) {
      const um = umbrellaKind(0.95);
      add({ kind: 'walk', route, offset: (j / n + rng.range(-0.08, 0.08)) * route.period, look: look(), umbrella: um,
        phone: !um || rng.chance(0.15), bag: rng.chance(0.3) });
    }
  }
  // 棒棒：挑着扁担慢慢走（不打伞，披雨披）
  for (const [a, b] of [[2, 5], [1, 3]]) {
    const za = landings[a], zb = landings[b];
    const xd = stairLane(1, za, zb), xu = stairLane(-1, za, zb);
    if (xd == null || xu == null || !routeFree([[xd, za], [xd, zb], [xu, zb], [xu, za], [xd, za]], 0.5)) continue;
    const route = new Route([[xd, za], [xd, zb], [xu, zb], [xu, za]], { closed: true });
    const speed = (x, z) => (onStair(z) ? (x > 0 ? 0.5 : 0.34) : 0.9);
    const stride = (x, z) => (onStair(z) ? 0.68 : 1.1);
    route.walk(route.node(1), speed, stride).wait(rng.range(3, 6)).walk(route.node(3), speed, stride).wait(rng.range(4, 8))
      .walk(route.length, speed, stride).finish();
    add({ kind: 'porter', route, offset: rng.range(0, route.period),
      look: look({ coat: rng.pick([0x2c3a58, 0x3a4436, 0x4a3428]), pants: 0x22252e, style: 'hood', hoodColor: 0x2a5a8a, load: rng.pick([0x2a4a8a, 0x8a7a5a]), load2: rng.pick([0x2a4a8a, 0x6a5a40, 0x8a1a1e]) }) });
  }

  // ------------------------------------------------------------ 2. 斑马线：红灯时在路沿等，绿灯过街，到对面走一段再回来等
  const R = L.ROAD;
  const crossX = crossingX(L);
  const zCurbS = R.z0 - R.sidewalkS + 0.55, zCurbN = R.z1 + R.sidewalkN - 0.55;
  for (let j = 0; j < 8; j++) {
    const south = j % 2 === 0;
    const xs = crossX + rng.range(-2.8, 2.8), xn = xs + rng.range(-0.4, 0.4);
    const pts = [[xs + rng.range(-2, 2), R.z0 - R.sidewalkS / 2], [xs, zCurbS],
      [xn, zCurbN], [xn + rng.range(-2, 2), R.z1 + R.sidewalkN / 2]];
    if (!routeFree(pts)) continue;
    const route = new Route(pts);
    const v = rng.range(1.5, 1.65); // 加上起步错峰，仍在机动车转绿前到达对岸
    const speed = (x, z) => (onStair(z) ? 0.48 : z < zCurbS && z > zCurbN ? v : 1.05);
    const stride = (x, z) => (onStair(z) ? 0.68 : 1.35);
    const faceN = Math.PI, faceS = 0;
    route.s = route.node(south ? 1 : 2); route.S[0] = route.s;
    const crossN = () => route.waitPhase(CYCLE, W0 + rng.range(0.2, 1.4), faceN).walk(route.node(2), speed, stride);
    const crossS = () => route.waitPhase(CYCLE, W0 + rng.range(0.2, 1.4), faceS).walk(route.node(1), speed, stride);
    const tripN = () => route.walk(route.node(3), speed, stride).wait(rng.range(2, 5)).walk(route.node(2), speed, stride);
    const tripS = () => route.walk(route.node(0), speed, stride).wait(rng.range(1, 3)).walk(route.node(1), speed, stride);
    if (south) { crossN(); tripN(); crossS(); tripS(); }
    else { crossS(); tripS(); crossN(); tripN(); }
    route.finish(CYCLE);
    add({ kind: 'walk', route, offset: 0, look: look(), umbrella: umbrellaKind(0.92), bag: rng.chance(0.25), phone: rng.chance(0.15) });
  }

  // ------------------------------------------------------------ 3. 滨江路人行道上来回走的人
  const lanes = [
    { z: [R.z0 - R.sidewalkS * 0.4, R.z0 - R.sidewalkS * 0.65], x: [[crossX - 32, crossX - 7], [crossX + 7, crossX + 32]] },
    { z: [R.z1 + R.sidewalkN * 0.4, R.z1 + R.sidewalkN * 0.65], x: [[crossX - 32, crossX - 7], [crossX + 7, crossX + 32]] },
  ];
  for (const ln of lanes) {
    for (const [xa, xb] of ln.x) {
      const [z1, z2] = ln.z;
      const pts = [[xa, z1], [xb, z1], [xb, z2], [xa, z2]];
      if (!routeFree([...pts, pts[0]])) continue;
      const route = new Route(pts, { closed: true });
      const pf = rng.range(0.9, 1.15);
      route.walk(route.length, () => 1.15 * pf, () => 1.35).finish();
      for (let j = 0; j < 2; j++) add({ kind: 'walk', route, offset: (j * 0.5 + rng.range(0, 0.2)) * route.period, look: look(), umbrella: umbrellaKind(0.97), bag: rng.chance(0.3) });
    }
  }

  // ------------------------------------------------------------ 4. 店门口站着的人（有雨棚的一半收着伞）
  const spots = [];
  if (fronts && fronts.length) {
    for (const f of fronts) {
      if (!f.open || !f.a || !f.b) continue;
      const mx = (f.a.x + f.b.x) / 2, mz = (f.a.z + f.b.z) / 2;
      if (Math.abs(mx) < L.STAIR.x1 - 0.5 || Math.abs(mx) > L.STAIR.x1 + 0.5 || mz > L.STAIR.zTop || mz < L.STAIR.zBottom) continue;
      const out = (f.depth || 0) + rng.range(0.8, 1.2);
      spots.push({ x: mx + f.normal.x * out, z: mz + f.normal.z * out + rng.range(-0.6, 0.6), nx: f.normal.x, nz: f.normal.z, kind: f.kind });
    }
  } else {
    for (const lot of L.LOTS) for (let k = 0; k < 2; k++) {
      const s = lot.side === 'W' ? 1 : -1;
      spots.push({ x: lot.front + s * rng.range(1.0, 1.4), z: rng.range(lot.z1 + 1, lot.z0 - 1), nx: s, nz: 0 });
    }
  }
  const shuffled = spots.filter(p => Math.abs(p.x) >= 5 && Math.abs(p.x) < L.STAIR.x1 - 0.5 && !blocked(p.x, p.z, 0.35)).map(p => [rng(), p]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
  let standN = 0;
  for (const p of shuffled) {
    if (standN >= 11) break;
    if (p.z > L.STAIR.zTop - 1) continue;          // 不挡 hero 机位前景
    const toShop = Math.atan2(-p.nx, -p.nz);
    const pair = rng.chance(0.3) && !blocked(p.x, p.z - 0.75, 0.28);
    const sheltered = rng.chance(0.5);
    add({ kind: 'stand', x: p.x, z: p.z, ry: pair ? Math.PI : toShop + rng.range(-0.9, 0.9), look: look(),
      umbrella: sheltered ? (rng.chance(0.6) ? 'closed' : null) : umbrellaKind(0.9), phone: rng.chance(0.3) });
    standN++;
    if (pair) { add({ kind: 'stand', x: p.x + rng.range(-0.15, 0.15), z: p.z - 0.75, ry: 0, look: look(), umbrella: sheltered ? null : umbrellaKind(0.8), talk: true }); standN++; }
  }

  // hero 机位中景：第一段梯坎两侧固定站两个人（看手机 / 等人），保证主镜头里总有清楚的伞剪影
  for (const [x0, z0, ry, um] of [[L.STAIR.x1 - 3.2, L.STAIR.zTop - 3.6, -2.6, 'clear'], [L.STAIR.x0 + 3.2, L.STAIR.zTop - 4.9, 2.2, 'open']]) {
    let z = z0;
    for (let k = 0; k < 6 && blocked(x0, z, 0.3); k++) z -= 0.6;
    if (blocked(x0, z, 0.3)) continue;
    add({ kind: 'stand', x: x0, z, ry, look: look({ umbrella: um === 'open' ? 0x8a1a1e : 0x141418 }), umbrella: um, phone: um === 'clear' });
  }

  // ------------------------------------------------------------ 5. 火锅桌边坐着的人（props 的桌子：walkways 里 1.6×1.6 的方块）
  const tables = walk.filter(w => Math.abs(w.x1 - w.x0 - 1.6) < 0.06 && Math.abs(w.z1 - w.z0 - 1.6) < 0.06);
  let seated = 0;
  for (const tb of tables) {
    if (seated >= 12) break;
    const cx = (tb.x0 + tb.x1) / 2, cz = (tb.z0 + tb.z1) / 2;
    if (cz > L.STAIR.zTop - 1) continue;
    const n = rng.int(2, 3);
    const a0 = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = a0 + k * (Math.PI * 2 / n) + rng.range(-0.25, 0.25);
      const x = cx + Math.cos(a) * 0.68, z = cz + Math.sin(a) * 0.68;
      if (Math.abs(x) < 5 || Math.abs(x) > L.STAIR.x1 - 0.3 || blocked(x, z, 0.12, tb)) continue;
      add({ kind: 'sit', x, z, ry: Math.atan2(cx - x, cz - z), look: look(), umbrella: null, stoolY: ground(cx, cz, false) });
      seated++;
    }
  }

  // ------------------------------------------------------------ 6. 墙根蹲着抽烟的人
  let squat = 0;
  const squatLots = L.LOTS.filter(l => l.side === 'W').slice(0, 3);
  for (let k = 0; k < 30 && squat < 3; k++) {
    const side = rng.sign();
    const lot = squatLots[squat];
    const z = rng.range(lot.z1 + 1, lot.z0 - 1);
    const x = side * rng.range(L.STAIR.x1 - 1.5, L.STAIR.x1 - 1);
    if (blocked(x, z, 0.35)) continue;
    add({ kind: 'squat', x, z, ry: side > 0 ? -Math.PI / 2 + rng.range(-0.6, 0.3) : Math.PI / 2 + rng.range(-0.3, 0.6), look: look(), umbrella: null });
    squat++;
  }

  // ------------------------------------------------------------ 7. 两侧平台的人群与坡底栏杆边看江的剪影（局部 +Z 朝前，朝江为 PI）
  for (const f of L.FLIGHTS.filter(f => f.type === 'landing' && f.z0 - f.z1 >= 4)) {
    for (const side of [-1, 1]) {
      const x = side * rng.range(5.4, 7.6), z = rng.range(f.z1 + 1, f.z0 - 1);
      if (blocked(x, z, 0.4)) continue;
      add({ kind: 'stand', x, z, ry: side * Math.PI / 2, look: look(), umbrella: umbrellaKind(), phone: rng.chance(0.4) });
    }
  }
  const railZ = L.PLAZA.z1 + 1.1;
  for (const [x, z, ry] of [[-17.2, railZ, Math.PI], [-16.4, railZ + 0.1, Math.PI + 0.15],
    [15.5, railZ, Math.PI - 0.1], [16.4, railZ + 0.1, Math.PI], [-7.5, L.PLAZA.z0 - 3, 0.3], [8.6, L.PLAZA.z0 - 3.5, -0.4]]) {
    if (blocked(x, z, 0.25)) continue;
    add({ kind: 'stand', x, z, ry, look: look(), umbrella: umbrellaKind(0.95), lean: z < L.PLAZA.z1 + 2, phone: z > L.PLAZA.z1 + 2 && rng.chance(0.5) });
  }

  // ------------------------------------------------------------ 8. v4 扩展区（layout.DISTRICTS）：放在最后追加，不扰动前面的随机序列
  const DS = L.DISTRICTS;
  if (DS) {
    const loop = (pts, n, o = {}) => {
      const route = new Route(pts, { closed: true });
      const pf = rng.range(0.9, 1.1);
      route.walk(route.length, () => (o.speed ?? 1.05) * pf, () => o.stride ?? 1.3).finish();
      for (let j = 0; j < n; j++) add({ kind: 'walk', route, offset: (j / n + rng.range(-0.06, 0.06)) * route.period, look: look(),
        umbrella: umbrellaKind(o.umbrella ?? 0.9), phone: rng.chance(0.2), bag: rng.chance(0.3) });
    };
    const Y0 = L.Y_UPPER, S = DS.south;
    // 新街区：正街—广场环线、横街、坡上巷、梯坎上下
    loop([[3, 43], [3, 80], [-3, 80], [-3, 43]], 3);
    loop([[-50, 63], [50, 63], [50, 69], [-50, 69]], 4);
    loop([[-30, 94.6], [30, 94.6], [30, 96.2], [-30, 96.2]], 2);
    loop([[1.6, 78], [1.6, 95], [-1.6, 95], [-1.6, 78]], 1, { speed: 0.7, stride: 0.9 });
    // 黄葛树池边坐着歇脚（凳子藏进树池里）
    for (const a of [0.4, 1.9, 3.3, 4.6]) {
      const x = Math.cos(a) * 2.1, z = 66 + Math.sin(a) * 2.1;
      add({ kind: 'sit', x, z, ry: Math.atan2(Math.cos(a), Math.sin(a)), look: look(), umbrella: null, stoolY: Y0 + 0.1 });
    }
    // 大排档摊主、店门口的人
    for (const [x, z, ry] of [[8.5, 57.4, 0], [-8.6, 74.7, Math.PI], [12, 39.2, 0], [-14, 39.3, 0.4], [-20, 61.2, Math.PI], [24, 70.9, 0.2]])
      add({ kind: 'stand', x, z, ry, look: look(), umbrella: z < 40 ? umbrellaKind(0.8) : null, phone: rng.chance(0.4) });
    void S;
    // 山坡巷：横巷来回、后山梯道、巷里蹲着抽烟的
    const H = DS.hill, [l1, l2, l3] = H.lanes;
    for (const s of [-1, 1]) {
      loop([[s * 36, l1.z0 + 2.2], [s * 98, l1.z0 + 2.2], [s * 98, l1.z0 + 3.4], [s * 36, l1.z0 + 3.4]], 1);
      loop([[s * 36, l2.z0 + 2.6], [s * 98, l2.z0 + 2.6], [s * 98, l2.z0 + 3.6], [s * 36, l2.z0 + 3.6]], 1);
      loop([[s * 103.4, l1.z0 + 1], [s * 103.4, l3.z1 - 1], [s * 104.6, l3.z1 - 1], [s * 104.6, l1.z0 + 1]], 1, { speed: 0.6, stride: 0.8 });
      add({ kind: 'squat', x: s * 58, z: l3.z1 - 0.7, ry: Math.PI + rng.range(-0.4, 0.4), look: look(), umbrella: null });
    }
    // 滨江：骑楼下来回、江边步道、趸船上候船
    const R = DS.river, AR = R.arcade, K = R.deck;
    for (const s of [-1, 1]) {
      loop([[s * 70, AR.z0 + 1.4], [s * 190, AR.z0 + 1.4], [s * 190, AR.z0 + 2.0], [s * 70, AR.z0 + 2.0]], 2, { umbrella: 0.3 });
      loop([[s * 70, L.RIVER.zEdge + 0.9], [s * 190, L.RIVER.zEdge + 0.9], [s * 190, L.RIVER.zEdge + 1.5], [s * 70, L.RIVER.zEdge + 1.5]], 2);
    }
    for (const [x, z, ry] of [[-115.6, -163.5, -Math.PI / 2], [-95.2, -165.6, Math.PI], [-96.4, -159.2, Math.PI / 2 + 0.3], [-111, -158.4, 0]])
      add({ kind: 'stand', x, z, ry, look: look(), umbrella: umbrellaKind(0.9), phone: rng.chance(0.5) });
    for (const x of [-109.5, -107.8]) add({ kind: 'sit', x, z: -164.55, ry: 0, look: look(), umbrella: null, stoolY: K.y });
  }

  // ------------------------------------------------------------ 骨架 + 每帧姿态
  // 可选部件只分配给会用到的人（与 rig.pose 里的显隐条件一致）
  const need = (key, i) => {
    const p = people[i], c = p.look, st = c.style, um = p.umbrella;
    switch (key) {
      case 'hairLong': return st === 'long';
      case 'hood': return st === 'hood';
      case 'brim': return st === 'cap';
      case 'bob': return st === 'long' || st === 'bob';
      case 'fringe': return st === 'long' || st === 'bob' || st === 'bun';
      case 'tail': return st === 'ponytail';
      case 'bun': return st === 'bun';
      case 'inner': return !!c.inner;
      case 'scarf': return !!c.scarf;
      case 'backpack': return !!c.backpack && p.kind !== 'porter';
      case 'coatSkirt': return c.outfit === 'trench' || c.outfit === 'raincoat';
      case 'skirt': return c.outfit === 'skirt';
      case 'mask': case 'glasses': case 'visor': return c.acc === key;
      case 'canopy': return um === 'open';
      case 'clear': return um === 'clear' || um === 'led';
      case 'shaft': return um === 'open' || um === 'clear';
      case 'ribs': return um === 'open' || um === 'clear' || um === 'led';
      case 'led': return um === 'led';
      case 'closed': return um === 'closed';
      case 'phone': return !!p.phone;
      case 'ember': return p.kind === 'squat';
      case 'pole': case 'load': return p.kind === 'porter';
      case 'stool': return p.kind === 'sit';
      case 'bag': return !!p.bag;
      default: return true;
    }
  };
  const rig = makeRig(ctx, people.length, need);
  for (const p of people) rig.setColors(p.i, p.look);
  const P = {};
  ctx.onUpdate((dt, t) => {
    for (const p of people) {
      reset(P, p);
      if (p.kind === 'walk' || p.kind === 'porter') walkPose(P, p, t);
      else if (p.kind === 'stand') standPose(P, p, t);
      else if (p.kind === 'sit') sitPose(P, p, t);
      else if (p.kind === 'squat') squatPose(P, p, t);
      rig.pose(p.i, P);
    }
    rig.commit();
  });

  function reset(P, p) {
    P.s = p.s; P.hipY = HIP_H; P.lean = 0; P.side = 0; P.twist = 0; P.headYaw = 0; P.headPitch = 0;
    P.hip = [0, 0]; P.knee = [0.04, 0.04]; P.sh = [0, 0]; P.ab = [0, 0]; P.el = [0.15, 0.15]; P.shYaw = [0, 0];
    P.umbrella = p.umbrella; P.uTilt = -0.12; P.uSpin = 0; P.uRoll = 0.05;
    P.phone = false; P.ember = null; P.pole = false; P.bag = false; P.stool = null; P.legAb = 0.02;
    P.bagSwing = 0; P.poleTilt = 0; P.loadSwing = 0; P.style = p.look.style;
    P.outfit = p.look.outfit; P.acc = p.look.acc; P.inner = !!p.look.inner; P.scarf = !!p.look.scarf; P.backpack = p.look.backpack;
    P.expression = p.expression;
  }
  // 撑伞的右手：肘部弯 90°，手在胸前
  function holdUmbrella(P) {
    if (P.umbrella === 'open' || P.umbrella === 'clear' || P.umbrella === 'led') { P.sh[1] = 0.22; P.el[1] = 1.9; P.shYaw[1] = 0.3; }
    else if (P.umbrella === 'closed') { P.sh[1] = 0.05; P.el[1] = 0.1; }
  }

  function walkPose(P, p, t) {
    const q = p.route.sample(t + p.offset);
    const ry = p.route.heading(t + p.offset);
    const x = q.x, z = q.z;
    P.x = x; P.z = z; P.y = ground(x, z); P.ry = ry;
    const amp = Math.min(1, q.speed / 1.0);
    const ph = q.gait * Math.PI * 2;
    const stairs = onStair(z);
    for (const k of [0, 1]) {
      const a = ph + k * Math.PI;
      P.hip[k] = amp * (0.42 * Math.sin(a) + (stairs ? 0.12 : 0));
      P.knee[k] = 0.05 + amp * (0.62 * Math.pow(Math.max(0, Math.cos(a)), 1.4) + (stairs ? 0.15 : 0));
    }
    P.hipY = HIP_H - 0.035 * amp + 0.03 * amp * Math.abs(Math.cos(ph)) - (stairs ? 0.03 : 0);
    P.lean = 0.05 * amp;
    P.twist = 0.06 * amp * Math.sin(ph);
    P.sh[0] = -0.35 * amp * Math.sin(ph); P.el[0] = 0.25;
    P.sh[1] = 0.35 * amp * Math.sin(ph); P.el[1] = 0.25;
    holdUmbrella(P);
    P.uRoll = 0.05 + 0.03 * Math.sin(ph);
    P.uTilt = -0.16 - 0.04 * amp;
    if (p.phone && q.speed < 0.2 || (p.phone && Math.sin(t * 0.13 + p.seed) > 0.3)) { P.phone = true; P.sh[0] = 0.32; P.el[0] = 1.45; P.headPitch = 0.4; }
    if (p.bag && !P.phone) { P.bag = true; P.sh[0] *= 0.4; P.el[0] = 0.08; P.bagSwing = 0.15 * Math.sin(ph); }
    if (q.speed < 0.05) { P.headYaw = 0.3 * Math.sin(t * 0.35 + p.seed); P.knee = [0.05, 0.05]; P.hip = [0, 0]; }
    if (p.kind === 'porter') {
      P.umbrella = null; P.pole = true;
      P.lean = 0.2 * amp + 0.05;
      P.hipY -= 0.03;
      P.sh[1] = 1.15; P.el[1] = 0.55; P.shYaw[1] = 0.2;                // 右手扶扁担
      P.poleTilt = 0.05 * Math.sin(ph * 2);
      P.loadSwing = 0.08 * Math.sin(ph);
    }
  }

  function standPose(P, p, t) {
    P.x = p.x; P.z = p.z; P.y = ground(p.x, p.z, false); P.ry = p.ry;
    const w = Math.sin(t * 0.4 + p.seed);
    P.side = 0.025 * w; P.hip = [0.03 * w, -0.03 * w]; P.knee = [0.04 + 0.06 * Math.max(0, w), 0.04 + 0.06 * Math.max(0, -w)];
    P.headYaw = 0.45 * Math.sin(t * 0.17 + p.seed * 1.7);
    P.sh = [0.05, 0.05]; P.el = [0.2, 0.2];
    holdUmbrella(P);
    P.uSpin = 0.4 * Math.sin(t * 0.11 + p.seed);
    if (p.phone) { P.phone = true; P.sh[0] = 0.32; P.el[0] = 1.5; P.headPitch = 0.45; P.headYaw = 0; }
    if (p.talk) { P.headYaw = 0.15 * Math.sin(t * 0.6 + p.seed); P.sh[0] = 0.15 + 0.2 * Math.max(0, Math.sin(t * 0.9 + p.seed)); P.el[0] = 0.9; }
    if (p.lean) { P.lean = 0.12; P.sh[0] = 0.7; P.el[0] = 0.4; }
  }

  function sitPose(P, p, t) {
    P.x = p.x; P.z = p.z; P.y = p.stoolY; P.ry = p.ry;
    P.stool = { x: p.x, y: p.stoolY, z: p.z };
    P.hipY = 0.47; P.hip = [1.45, 1.4]; P.knee = [1.4, 1.5]; P.legAb = 0.12;
    P.lean = 0.12;
    P.sh = [0.55, 0.5]; P.el = [1.0, 1.05];
    // 夹菜：右手周期性抬到嘴边
    const c = (t * 0.17 + p.seed) % 1;
    if (c < 0.18) { const k = Math.sin(c / 0.18 * Math.PI); P.sh[1] = 0.5 + 0.5 * k; P.el[1] = 1.05 + 1.0 * k; P.headPitch = -0.1 * k; }
    P.headYaw = 0.35 * Math.sin(t * 0.21 + p.seed);
  }

  function squatPose(P, p, t) {
    P.x = p.x; P.z = p.z; P.y = ground(p.x, p.z, false); P.ry = p.ry;
    P.hipY = 0.3; P.hip = [2.0, 1.95]; P.knee = [2.35, 2.3]; P.legAb = 0.22;
    P.lean = 0.45;
    P.sh = [0.95, 0.9]; P.el = [0.55, 0.6];
    const c = (t * 0.12 + p.seed) % 1;          // 抽一口
    const k = c < 0.2 ? Math.sin(c / 0.2 * Math.PI) : 0;
    P.sh[1] = 0.9 + 0.1 * k; P.el[1] = 0.6 + 1.75 * k;
    P.headPitch = -0.15 - 0.15 * k;
    P.ember = 0.55 + 1.2 * k + 0.1 * Math.sin(t * 7 + p.seed);
  }
}
