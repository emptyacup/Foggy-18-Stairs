// districts —— v4 扩展可活动范围（布局见 layout.DISTRICTS，可走高程见 layout.districtHeightAt）：
//   1) 两侧山坡巷：山坡楼群之间的三条横巷 L1–L3（平），楼群尽头的后山梯道把三条横巷串成环线；补齐尽头的楼。
//   2) 坡顶后方新街区：后街南墙打开 → 牌坊 + 正街 → 黄葛树小广场 + 横街 → 30 级梯坎 → 坡上巷。
//   3) 滨江两头：滨江路南侧骑楼街（|x| 62–200），江边跳板 + 趸船候船室。
// 楼一律用 lib/tower.js（与两侧居民楼同一套生成器），底商用 shops 的"假室内"开门洞。
import * as THREE from 'three';
import { buildTower } from './lib/tower.js';
import { Builder } from './lib/tower-geo.js';
import { createInteriors } from './shops/interior.js';
import { region, paintBack, paintMid } from './shops/paint.js';
import { BASE, NEON, WINDOW } from '../core/palette.js';
import { buildRoom } from './lib/rooms.js';

const RY = { E: Math.PI / 2, W: -Math.PI / 2, S: 0, N: Math.PI };
// 假室内参数（与 shops.js 的 KINDS.room 同一套色）
const ROOMS = {
  hotpot:   { wall: '#7a2a1e', floor: '#3a2622', ceil: '#4a2418', lamp: WINDOW.warm, intensity: 1.5, light: NEON.orange },
  noodle:   { wall: '#c8c4b4', floor: '#4a4644', ceil: '#d0d0c8', lamp: 0xfff0d0, intensity: 1.35, tubes: 1, light: WINDOW.warm },
  store:    { wall: '#b4c0c0', floor: '#6a6e70', ceil: '#c8d0d0', lamp: WINDOW.fluor, intensity: 1.35, tubes: 1, shelves: 1, light: WINDOW.fluor },
  tea:      { wall: '#8a6232', floor: '#3a2c22', ceil: '#5a4228', lamp: NEON.amber, intensity: 1.35, light: NEON.amber },
  barber:   { wall: '#9cc4d0', floor: '#80888c', ceil: '#b8dce8', lamp: 0xc0f0ff, intensity: 1.4, tubes: 1, light: NEON.cyan },
  pharmacy: { wall: '#b0ccc0', floor: '#7a8a80', ceil: '#c8e0d4', lamp: 0xd0ffe0, intensity: 1.4, tubes: 1, shelves: 1, light: NEON.teal },
  hardware: { wall: '#6a6250', floor: '#3a3632', ceil: '#5a5448', lamp: 0xfff0c0, intensity: 1.1, tubes: 1, shelves: 1, light: WINDOW.warm },
};
const NAMES = {
  hotpot: ['老火锅', '江湖火锅', '串串香', '冒菜'], noodle: ['重庆小面', '豌杂面', '酸辣粉', '抄手'], store: ['便利店', '小卖部', '烟酒副食'],
  tea: ['老茶馆', '盖碗茶', '棋牌茶室'], barber: ['理发', '发廊'], pharmacy: ['大药房', '诊所'], hardware: ['五金', '修锁配钥匙', '家电维修'],
};
const SIGN_COLORS = ['hotpot', 'amber', 'cyan', 'magenta', 'green', 'pink', 'teal', 'violet'];

export function build(ctx) {
  const { L, make, mat, tex } = ctx;
  const D = L.DISTRICTS;
  const rng = ctx.rng('districts');
  const S = ctx.staticRoot;

  const pave = mat.std({ map: tex.paving('pave-a'), color: 0xffffff, roughness: 0.7 });
  const stepMat = mat.std({ map: tex.paving('step'), color: 0xe8e4e0, roughness: 0.65 });
  const wallStone = mat.std({ map: tex.paving('wall'), color: 0xb0aca6, roughness: 0.9 });
  const concrete = mat.surface('concrete');
  const metal = mat.surface('metalDk');
  const wood = mat.surface('wood');
  const rust = mat.surface('rust');
  const leaves = mat.std({ color: BASE.green, roughness: 0.85, wet: 0.4 });
  const bark = mat.std({ color: 0x3a3028, roughness: 0.95 });
  const redPlastic = mat.std({ color: 0x8a1a1e, roughness: 0.45 });
  const bluePlastic = mat.std({ color: 0x1e3a7a, roughness: 0.45 });

  // ------------------------------------------------------------ 小工具
  let lightsLeft = 0, halosLeft = 110;   // 光场按片区分配（山坡 24 / 新街区 26 / 滨江 18）
  const light = (p, color, intensity, radius) => { if (lightsLeft-- > 0) ctx.lights.add({ position: p, color, intensity, radius }); };
  const halo = (p, color, size, intensity) => { if (halosLeft-- > 0) ctx.halos.add({ position: p, color, size, intensity }); };
  // 实心块：x0<x1, z0<z1, 顶面 top，底面 bottom
  const slab = (x0, x1, z0, z1, top, bottom, m = pave, solid = false) =>
    make.block(x1 - x0, top - bottom, z1 - z0, m, { x: (x0 + x1) / 2, y: bottom, z: (z0 + z1) / 2, uv: 3, solid });
  const wallX = (x, z0, z1, y, h, m = concrete, t = 0.2) => make.block(t, h, z1 - z0, m, { x, y, z: (z0 + z1) / 2, solid: true });
  const wallZ = (z, x0, x1, y, h, m = concrete, t = 0.2) => make.block(x1 - x0, h, t, m, { x: (x0 + x1) / 2, y, z, solid: true });
  // 沿 z 扫描可走高程，把等高的一段合成一级踏步（与 layout 的阶梯函数逐点一致）
  const stairsZ = (x0, x1, zA, zB, yAt, bottomAt, m = stepMat) => {
    const dz = 0.04, n = Math.ceil((zB - zA) / dz - 1e-6);
    let start = zA, y = yAt(zA + dz / 2);
    for (let i = 1; i <= n; i++) {
      const z = Math.min(zB, zA + i * dz);
      const yy = i < n ? yAt(Math.min(zB, z + dz / 2)) : NaN;
      if (i === n || Math.abs(yy - y) > 1e-4) {
        const b = bottomAt(start, z);
        make.block(x1 - x0, y - b, z - start + 0.004, m, { x: (x0 + x1) / 2, y: b, z: (start + z) / 2, uv: 2 });   // 相邻踏步互相压 2 mm，避免接缝
        start = z; y = yy;
      }
    }
  };
  const cyl = (r, h, x, y, z, m, seg = 10, rTop = r) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), m);
    mesh.position.set(x, y + h / 2, z); S.add(mesh); return mesh;
  };
  // 路灯：竖杆 + 灯头 + 光锥；arm 为灯头相对杆的水平偏移 [dx, dz]
  const lamp = (x, y, z, { h = 4.6, color = WINDOW.warm, intensity = 2.0, radius = 11, arm = [0, 0] } = {}) => {
    make.block(0.12, h, 0.12, metal, { x, y, z });
    const hx = x + arm[0], hz = z + arm[1];
    if (arm[0] || arm[1]) make.block(Math.abs(arm[0]) + 0.1, 0.07, Math.abs(arm[1]) + 0.1, metal, { x: (x + hx) / 2, y: y + h - 0.1, z: (z + hz) / 2 });
    make.block(0.45, 0.1, 0.28, mat.neon(color, 3.6), { x: hx, y: y + h - 0.24, z: hz });
    make.block(0.5, 0.1, 0.32, metal, { x: hx, y: y + h - 0.14, z: hz });
    make.lightCone({ pos: [hx, y + h - 0.3, hz], length: h - 0.4, radius: 1.8, color, intensity: 0.07 });
    light([hx, y + h - 0.6, hz], color, intensity, radius);
    halo([hx, y + h - 0.3, hz], color, 2.4, 0.6);
  };
  // 素墙贴面：一张带窗的立面贴图（亮窗走 emissiveMap），贴在楼的背面/基座上。
  // axis='z'：墙面在 z=c、沿 x 从 a0 到 a1；axis='x'：墙面在 x=c、沿 z。dir = 法线朝向（+1/-1）
  const dress = (axis, c, a0, a1, y0, h, dir, seed, wall = 'concrete') => {
    const w = Math.abs(a1 - a0);
    if (w < 1.5 || h < 1) return;
    const f = tex.facade({ bays: Math.max(1, Math.round(w / 3.4)), floors: Math.max(1, Math.round(h / 3.1)), seed: 'dress-' + seed, wall, lit: 0.42 });
    const m = mat.std({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.9, wet: 0.15 });
    const mid = (a0 + a1) / 2;
    if (axis === 'z') make.quad(w, h, m, { x: mid, y: y0 + h / 2, z: c + dir * 0.03, ry: dir > 0 ? 0 : Math.PI });
    else make.quad(w, h, m, { x: c + dir * 0.03, y: y0 + h / 2, z: mid, ry: dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
  };
  // 顺坡矮墙：沿 z 分段的剪切盒，顶面贴着 topAt(z) 走（不再是一级级"城垛"）；碰撞按段登记
  const slopeWall = (x, zA, zB, topAt, bottomAt, m, t = 0.24) => {
    const n = Math.max(1, Math.round((zB - zA) / 1.2));
    for (let i = 0; i < n; i++) {
      const za = zA + (zB - zA) * i / n, zb = zA + (zB - zA) * (i + 1) / n;
      const g = new THREE.BoxGeometry(t, 1, zb - za);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const z = (za + zb) / 2 + pos.getZ(k);
        pos.setY(k, pos.getY(k) > 0 ? topAt(z) : bottomAt(z));
      }
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, 0, (za + zb) / 2);
      S.add(mesh);
      ctx.physics.addBox(x - t / 2, za, x + t / 2, zb, Math.max(topAt(za), topAt(zb)), Math.min(bottomAt(za), bottomAt(zb)));
    }
  };
  const lantern = (x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 7), mat.neon(NEON.hotpot, 2.4));
    m.scale.set(1, 0.8, 1); m.position.set(x, y, z); S.add(m);
    make.block(0.2, 0.05, 0.2, mat.neon(NEON.amber, 2), { x, y: y - 0.22, z });
    halo([x, y, z], NEON.hotpot, 1.0, 0.35);
  };

  // ------------------------------------------------------------ 假室内：一本图集，每种店 3 个变体共用（控制纹理像素）
  const I = createInteriors(ctx);
  const pool = new Map();
  const VARIANTS = 3, CELL_W = 3.2, CELL_H = 2.55;
  const paintCell = (kind, r) => {
    const key = kind + ':' + r.int(0, VARIANTS - 1);
    if (!pool.has(key)) {
      const a = I.alloc();
      const pr = ctx.rng('dpaint-' + key);
      paintBack(region(I.g, a.x, a.y, 384, 192, CELL_W, CELL_H), kind, pr);
      paintMid(region(I.g, a.x, a.y + 192, 384, 192, CELL_W, CELL_H), kind, pr);
      const R = ROOMS[kind];
      I.setRoom(a.cell, { ...R, w: CELL_W, h: CELL_H, depth: pr.range(2.6, 4.0), intensity: R.intensity * pr.range(0.85, 1.15),
        mid: pr.range(0.35, 0.55), glass: pr() < 0.3 ? 1 : 0, shelves: R.shelves || 0, tubes: R.tubes || 0 });
      pool.set(key, a.cell);
    }
    return pool.get(key);
  };

  // 临街店面：沿楼正面等分 n 个开间，每间一个门洞（假室内）+ 卷帘箱 + 门楣招牌；少数挂门口光
  // 楼正面的立面坐标系：P(u, y, out)，u 沿立面、out 朝外
  const frameOf = (b) => {
    const ry = RY[b.face];
    const N = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), T = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const ew = b.face === 'E' || b.face === 'W';
    const front = b.face === 'E' ? b.x1 : b.face === 'W' ? b.x0 : b.face === 'S' ? b.z1 : b.z0;
    const len = ew ? b.z1 - b.z0 : b.x1 - b.x0;
    const depth = ew ? b.x1 - b.x0 : b.z1 - b.z0;
    const c = ew ? new THREE.Vector3(front, 0, (b.z0 + b.z1) / 2) : new THREE.Vector3((b.x0 + b.x1) / 2, 0, front);
    const origin = c.clone().addScaledVector(T, -len / 2);
    const P = (u, y, out = 0) => origin.clone().addScaledVector(T, u).addScaledVector(N, out).setY(y);
    return { ry, N, T, len, depth, origin, P };
  };
  // 可进入店铺：第 i 个开间整间挖空基座，进深取楼深减 1 m（上限 6 m）
  const roomDepth = b => Math.min(6, frameOf(b).depth - 1);
  const roomHoles = (b) => {
    const F = frameOf(b), w = F.len / b.shops, D = roomDepth(b);
    return (b.rooms || []).map(i => {
      const a = F.P(i * w, 0, 0.05), c = F.P((i + 1) * w, 0, -D - 0.05);
      return { x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), z0: Math.min(a.z, c.z), z1: Math.max(a.z, c.z) };
    });
  };
  let roomCount = 0;
  const shopfronts = (b, y, n, opt = {}) => {
    const { ry, N, T, len, origin } = frameOf(b);
    const r = ctx.rng('dshop-' + b.id);
    const w = len / n;
    for (let i = 0; i < n; i++) {
      if (opt.skip?.includes(i)) continue;
      const kind = r.pick(opt.kinds || Object.keys(ROOMS));
      const R = ROOMS[kind];
      const ow = Math.min(3.6, w - 0.9), oh = 2.55;
      if (ow < 1.2) continue;
      const u = (i + 0.5) * w;
      const p = origin.clone().addScaledVector(T, u);
      const enter = (b.rooms || []).includes(i);
      const closed = !enter && r() < (opt.closed ?? 0.18);
      const cell = paintCell(kind, r);
      if (enter) {
        buildRoom(ctx, frameOf(b), { u0: i * w, u1: (i + 1) * w, floorY: y + 0.12, depth: roomDepth(b), height: 3.05,
          topY: b.podiumTop, baseY: y - 1, door: [u - ow / 2, u + ow / 2], doorH: oh, kind, seed: `${b.id}-${i}` });
        roomCount++;
      } else I.quad(cell, ow, oh, p.clone().addScaledVector(N, 0.012).setY(y + oh / 2), ry);
      // 卷帘箱 + 两侧导轨（沿 ry 摆放的细块）
      const at = (du, dy, dn) => p.clone().addScaledVector(T, du).addScaledVector(N, dn).setY(y + dy);
      const q = at(0, oh, 0.12); make.block(ow + 0.1, 0.3, 0.24, metal, { x: q.x, y: q.y, z: q.z, ry });
      for (const s of [-1, 1]) { const g = at(s * (ow / 2 + 0.03), 0, 0.04); make.block(0.06, oh, 0.08, metal, { x: g.x, y: g.y, z: g.z, ry }); }
      if (closed) {   // 卷帘拉下一大半
        const sh = at(0, oh * 0.35, 0.05);
        make.block(ow, oh * 0.65, 0.04, mat.surface('metal', { wet: 0.6 }), { x: sh.x, y: sh.y, z: sh.z, ry });
      }
      // 门楣招牌（灯箱）：大多不登记光场，只取少数
      const text = r.pick(NAMES[kind]);
      const sp = at(0, oh + 1.25, 0.16);
      const lit = !closed && r() < (opt.litP ?? 0.45) && lightsLeft > 4;
      // 每种店固定一种配色/样式：同名招牌共用缓存纹理
      const sk = Object.keys(ROOMS).indexOf(kind);
      make.neonSign({ text, pos: [sp.x, sp.y, sp.z], ry, size: Math.min(0.42, ow / ([...text].length + 1.4)), style: sk % 2 ? 'box' : 'tube',
        color: NEON[SIGN_COLORS[sk % SIGN_COLORS.length]], light: lit, halo: lit && halosLeft-- > 0 });
      if (lit) lightsLeft -= 1;
      if (!closed && r() < (opt.doorLight ?? 0.35)) light(at(0, 2.2, 1.0).toArray(), R.light, 1.3, 6);
    }
  };

  // 楼：buildTower 的薄封装。street = 正面街面高程（店面开在这里）
  const towers = (name) => {
    const B = new Builder(ctx);
    const list = [];
    return {
      add(spec) {
        const sp = { old: true, sides: true, lights: 0, setback: 0, lit: rng.range(0.3, 0.55), ...spec };
        if (sp.rooms?.length && sp.shops) sp.podiumHoles = roomHoles(sp);
        buildTower(ctx, sp, B);
        list.push(sp);
        return sp;
      },
      flush() { B.flush(S, name); return list; },
    };
  };
  const faceIn = s => (s < 0 ? 'E' : 'W');      // 朝向中轴（x=0）
  const FL = 3.0;

  // ============================================================ 1) 两侧山坡巷
  const H = D.hill, lanes = H.lanes, P = H.path;
  lightsLeft = 24;
  for (const s of [-1, 1]) {
    const X = a => s * a, xr = (a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];
    // ---- 横巷路面（填到台地顶以下）、路沿、端墙
    for (const ln of lanes) {
      const bottom = Math.min(L.terraceTop(ln.z0), L.terraceTop(ln.z1)) - 0.4;
      const [x0, x1] = xr(H.a0, H.a1);
      slab(x0, x1, ln.z0, ln.z1, ln.y, bottom);
      wallX(X(H.a1 + 0.12), ln.z0, ln.z1, ln.y, 1.1);
      // 横巷灯：沿巷每 ~15 m 一盏，挂在北侧路沿上方，灯头伸向巷中
      for (let a = 42; a < P.a0 - 4; a += 21 + rng.range(-2, 2)) lamp(X(a), ln.y, ln.z0 + 0.35, { h: 4.2, arm: [0, 1.0], color: rng() < 0.7 ? WINDOW.warm : 0xdfe8ff, intensity: 1.7, radius: 10 });
      // 晾衣绳 + 衣物（横跨窄巷）
      for (let a = 46; a < P.a0 - 6; a += 21) {
        const y = ln.y + 3.4 + rng.range(-0.2, 0.3);
        make.block(0.02, 0.02, ln.z1 - ln.z0, metal, { x: X(a), y, z: (ln.z0 + ln.z1) / 2 });
        for (let k = 0; k < 4; k++) {
          const z = ln.z0 + 0.5 + k * (ln.z1 - ln.z0 - 1) / 3;
          make.block(0.04, rng.range(0.5, 0.8), rng.range(0.35, 0.55), mat.std({ color: rng.pick([0x8a1a1e, 0x2a5a8a, 0x9a9ea4, 0x9a8a5a, 0x3a5a4a]), roughness: 0.8, side: THREE.DoubleSide }),
            { x: X(a), y: y - 0.75, z });
        }
      }
      // 盆栽、塑料凳、小桌
      for (let a = 37; a < P.a0 - 3; a += rng.range(7, 12)) {
        const z = rng() < 0.5 ? ln.z0 + 0.55 : ln.z1 - 0.55;
        if (rng() < 0.6) {
          cyl(0.24, 0.36, X(a), ln.y, z, rust, 8, 0.3);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5), leaves);
          m.scale.set(1, 1.4, 1); m.position.set(X(a), ln.y + 0.75, z); S.add(m);
        } else {
          cyl(0.17, 0.42, X(a), ln.y, z, rng() < 0.5 ? redPlastic : bluePlastic, 8, 0.15);
        }
      }
    }
    // ---- 后山梯道（三条横巷的西/东尽头连成环）；横巷在梯道段下方补基础
    for (const ln of lanes) { const [x0, x1] = xr(P.a0 - 0.1, H.a1); slab(x0, x1, ln.z0, ln.z1, ln.y - 0.02, L.Y_LOWER - 6, wallStone); }
    const pathBottom = () => L.Y_LOWER - 6;      // 梯道自带基础（terrain 台地止于梯道内侧）
    const [px0, px1] = xr(P.a0, P.a1);
    for (let i = 0; i < lanes.length - 1; i++) {
      const a = lanes[i], b = lanes[i + 1];
      stairsZ(px0, px1, b.z1, a.z0, z => L.hillPathY(z), pathBottom);
      // 梯道两侧矮墙：顺坡压顶，在中间横巷处断开
      for (const edge of [P.a0 - 0.12, P.a1 + 0.12]) {
        slopeWall(X(edge), b.z1, a.z0, z => L.hillPathY(z, true) + 0.95, z => pathBottom(z, z), wallStone);
      }
    }
    for (let z = lanes[0].z0 - 6; z > lanes[2].z1 + 4; z -= 12) {
      if (lanes.some(l => z > l.z0 - 2 && z < l.z1 + 2)) continue;
      lamp(X(P.a1 - 0.3), L.hillPathY(z), z, { h: 4.0, arm: [-s * 1.0, 0], color: WINDOW.warm, intensity: 1.8, radius: 10 });
    }
    // ---- 补楼：横巷尽头的空地、后山梯道外侧一排
    const T1 = towers('dhill-' + s);
    const l1 = lanes[0], l2 = lanes[1], l3 = lanes[2];
    const hb = (id, a0, a1, z0, z1, face, street, ground, nF, shops, extra = {}) => {
      const [x0, x1] = xr(a0, a1);
      const sp = T1.add({ id: `D${s}-${id}`, x0, x1, z0, z1, face, ground: ground - 0.6, podiumTop: street + 3.9, height: street + 3.9 + nF * FL - ground + 0.6, shops, ...extra });
      if (shops) shopfronts({ ...sp, x0, x1, z0, z1 }, street, shops, { litP: 0.4, doorLight: 0.3 });
    };
    hb('F1', 73, 101, l1.z1 + 0.3, -13, 'N', l1.y, l1.y, 3 + rng.int(0, 2), 3, { rooms: [1] });
    hb('F2', 83, 101, l2.z1 + 0.35, l1.z0 - 0.3, 'S', l1.y, l2.y, 2 + rng.int(0, 2), 2, { lit: 0.5 });
    hb('F3', 93, 101, l3.z1 + 0.35, l2.z0 - 0.3, 'S', l2.y, l3.y, 2 + rng.int(0, 2), 1);
    hb('W1', 102, 121, l1.z1 + 0.3, -13, 'N', l1.y, l1.y, 3 + rng.int(0, 2), 2);
    const wr = [[l1.z1 - 0.25, -44], [-44, l2.z0 + 0.1], [l2.z0 + 0.1, -71], [-71, l3.z0 - 0.1]];
    wr.forEach(([zb, za], k) => {
      const ys = [], zz = [];
      for (let z = za; z <= zb; z += 0.5) { const y = L.districtHeightAt(X(P.a1 - 0.5), z); if (y != null) { ys.push(y); zz.push(z); } }
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      const [x0, x1] = xr(P.a1 + 1, 121);
      T1.add({ id: `D${s}-R${k}`, x0, x1, z0: za, z1: zb, face: faceIn(s), ground: yMin - 0.6, podiumTop: yMax + 3.6, height: yMax + 3.6 + (3 + rng.int(0, 2)) * FL - yMin + 0.6, lit: 0.45 });
      dress('x', X(P.a1 + 1), za + 0.4, zb - 0.4, yMin - 0.2, yMax + 3.4 - yMin, -s, `R${s}${k}`, k % 2 ? 'tile' : 'concrete');
    });
    hb('N3', 102, 121, -100, l3.z0 - 0.2, 'S', l3.y, l3.y - 3, 4 + rng.int(0, 2), 2);
    T1.flush();
    // 素墙贴面：山坡楼群的背面（横巷南侧）、补楼背面、补楼临梯道的侧面
    dress('z', l1.z1, X(H.a0 + 0.2), X(72), l1.y - 0.2, 6.4, -1, `hb1${s}`, 'tile');
    dress('z', l2.z1, X(H.a0 + 0.2), X(82), l2.y - 0.2, 6.4, -1, `hb2${s}`);
    dress('z', l3.z1, X(H.a0 + 0.2), X(92), l3.y - 0.2, 6.4, -1, `hb3${s}`, 'tilePink');
    dress('z', l2.z1 + 0.35, X(83), X(101), l2.y - 0.2, l1.y + 3.6 - l2.y, -1, `f2b${s}`);
    dress('z', l3.z1 + 0.35, X(93), X(101), l3.y - 0.2, l2.y + 3.6 - l3.y, -1, `f3b${s}`);
    dress('x', X(101), l2.z1 + 0.6, l1.z0 - 0.5, l2.y - 0.2, l1.y + 3.6 - l2.y, s, `f2s${s}`, 'tile');
    dress('x', X(101), l3.z1 + 0.6, l2.z0 - 0.5, l3.y - 0.2, l2.y + 3.6 - l3.y, s, `f3s${s}`, 'tile');
    // 梯道入口牌
    make.neonSign({ text: s < 0 ? '后山梯道' : '坡后梯道', pos: [X(P.a0 + 2), l1.y + 3.6, l1.z0 + 0.2], ry: Math.PI, size: 0.3, color: NEON.amber, light: false, halo: false });
    make.neonSign({ text: s < 0 ? '一巷' : '东一巷', pos: [X(H.a0 + 1.3), l1.y + 3.2, l1.z1 - 0.2], ry: 0, size: 0.26, color: NEON.teal, light: false, halo: false });
    make.neonSign({ text: s < 0 ? '二巷' : '东二巷', pos: [X(H.a0 + 1.3), l2.y + 3.2, l2.z1 - 0.2], ry: 0, size: 0.26, color: NEON.teal, light: false, halo: false });
    make.neonSign({ text: s < 0 ? '三巷' : '东三巷', pos: [X(H.a0 + 1.3), l3.y + 3.2, l3.z1 - 0.2], ry: 0, size: 0.26, color: NEON.teal, light: false, halo: false });
  }

  // ============================================================ 2) 坡顶后方新街区
  const SO = D.south, Y0 = L.Y_UPPER, YU = SO.upper.y;
  lightsLeft = 26;
  slab(-72, 72, 39.9, SO.steps.z1, Y0, Y0 - 6);
  slab(-56.4, 56.4, SO.steps.z1, 113, YU, Y0 - 6, wallStone);
  slab(-56.4, 56.4, SO.steps.z1, 113, YU + 0.02, YU - 0.3);   // 坡上巷铺面
  stairsZ(SO.steps.x0, SO.steps.x1, SO.steps.z0, SO.steps.z1, z => L.districtHeightAt(0, z), () => Y0 - 0.1);
  for (const s of [-1, 1]) {      // 梯坎两侧扶手 + 挡墙
    const x = s * (SO.steps.x1 - 0.1);
    for (let z = SO.steps.z0; z < SO.steps.z1 - 0.01; z += 1) make.block(0.06, 1.0, 0.06, metal, { x, y: L.districtHeightAt(0, z + 0.05), z: z + 0.05 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, Math.hypot(SO.steps.z1 - SO.steps.z0, YU - Y0)), metal);
    rail.position.set(x, (Y0 + YU) / 2 + 1.0, (SO.steps.z0 + SO.steps.z1) / 2);
    rail.rotation.x = -Math.atan2(YU - Y0, SO.steps.z1 - SO.steps.z0);
    S.add(rail);
    for (let z = SO.steps.z0; z < SO.steps.z1 - 1e-3; z += 1.0) {   // 扶手碰撞（顺坡分段）
      const z1 = Math.min(SO.steps.z1, z + 1.0);
      ctx.physics.addBox(x - 0.06, z, x + 0.06, z1, L.districtHeightAt(0, z1 - 1e-3) + 1.05, L.districtHeightAt(0, z + 1e-3) - 0.1);
    }
  }
  // 牌坊：正街入口
  for (const s of [-1, 1]) make.block(0.5, 5.2, 0.5, mat.std({ color: 0x5a1a18, roughness: 0.6 }), { x: s * 4.6, y: Y0, z: 41.2, solid: true });
  make.block(10.4, 0.6, 0.7, mat.std({ color: 0x3a1210, roughness: 0.6 }), { x: 0, y: Y0 + 5.2, z: 41.2 });
  make.block(11.2, 0.25, 1.2, mat.surface('tarpRed', { roughness: 0.5 }), { x: 0, y: Y0 + 5.8, z: 41.2 });
  make.neonSign({ text: '梯后老街', pos: [0, Y0 + 5.15, 40.8], ry: Math.PI, size: 0.75, style: 'box', color: NEON.amber, color2: NEON.hotpot, intensity: 2.6 });
  make.neonSign({ text: '梯后老街', pos: [0, Y0 + 5.15, 41.6], ry: 0, size: 0.75, style: 'box', color: NEON.amber, color2: NEON.hotpot, intensity: 2.6, light: false, halo: false });
  for (const s of [-1, 1]) lantern(s * 3.2, Y0 + 4.6, 41.2);

  // ---- 黄葛树（广场中心）+ 石砌树池（可坐）
  const TX = 0, TZ = 66;
  cyl(2.3, 0.55, TX, Y0, TZ, wallStone, 18);
  ctx.physics.addBox(TX - 1.9, TZ - 1.9, TX + 1.9, TZ + 1.9, Y0 + 0.55 + 0.6, Y0);
  cyl(0.55, 4.2, TX, Y0 + 0.5, TZ, bark, 9, 0.38);
  for (let k = 0; k < 6; k++) {     // 板根
    const a = k / 6 * Math.PI * 2 + 0.3;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.24, 1.3, 5), bark);
    root.position.set(TX + Math.cos(a) * 0.55, Y0 + 0.95, TZ + Math.sin(a) * 0.55);
    root.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); S.add(root);
  }
  for (let k = 0; k < 4; k++) {     // 主枝
    const a = k / 4 * Math.PI * 2 + 0.7;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 3.4, 6), bark);
    br.position.set(TX + Math.cos(a) * 1.0, Y0 + 5.4, TZ + Math.sin(a) * 1.0);
    br.rotation.set(Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75); S.add(br);
  }
  const tr = ctx.rng('banyan');
  for (let k = 0; k < 16; k++) {    // 树冠
    const a = tr.range(0, Math.PI * 2), d = tr.range(0.5, 4.6);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(tr.range(1.3, 2.2), 1), leaves);
    m.scale.set(1, tr.range(0.55, 0.8), 1);
    m.position.set(TX + Math.cos(a) * d, Y0 + tr.range(6.6, 8.6) - d * 0.25, TZ + Math.sin(a) * d);
    S.add(m);
  }
  // 树上挂红绸 + 灯笼
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; lantern(TX + Math.cos(a) * 2.6, Y0 + 4.9 + (k % 2) * 0.4, TZ + Math.sin(a) * 2.6); }
  light([TX, Y0 + 4.2, TZ], NEON.hotpot, 2.2, 10);
  // 广场边大排档：折叠桌 + 塑料凳 + 遮阳伞
  const stall = (x, z) => {
    make.block(1.1, 0.04, 0.8, mat.std({ color: 0x9a9ea4, roughness: 0.5 }), { x, y: Y0 + 0.72, z });
    for (const [dx, dz] of [[-0.48, -0.32], [0.48, -0.32], [-0.48, 0.32], [0.48, 0.32]]) make.block(0.03, 0.72, 0.03, metal, { x: x + dx, y: Y0, z: z + dz });
    ctx.physics.addBox(x - 0.55, z - 0.4, x + 0.55, z + 0.4, Y0 + 0.76, Y0);
    for (const [dx, dz] of [[-0.85, 0], [0.85, 0], [0, 0.65], [0, -0.65]]) cyl(0.15, 0.42, x + dx, Y0, z + dz, rng() < 0.6 ? redPlastic : bluePlastic, 8, 0.13);
    cyl(0.025, 2.4, x, Y0, z, metal, 5);
    const um = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.45, 8, 1, true), mat.std({ color: rng.pick([0x8a1a1e, 0x1f4a3a, 0x9a8a1c]), roughness: 0.5, side: THREE.DoubleSide }));
    um.position.set(x, Y0 + 2.45, z); S.add(um);
    make.block(0.25, 0.12, 0.25, mat.neon(WINDOW.warm, 3), { x, y: Y0 + 2.12, z });
  };
  for (const [x, z] of [[-8.5, 58.5], [8.5, 58.5], [-8.6, 73.6], [8.6, 73.6]]) stall(x, z);
  light([-8.5, Y0 + 2.1, 58.5], WINDOW.warm, 1.6, 7); light([8.6, Y0 + 2.1, 73.6], WINDOW.warm, 1.6, 7);
  // 正街 / 横街 / 坡上巷路灯
  for (const z of [47, 53]) for (const s of [-1, 1]) lamp(s * 5.2, Y0, z, { h: 4.6, arm: [-s * 0.9, 0], intensity: 1.9 });
  for (const a of [20, 38, 52]) for (const s of [-1, 1]) lamp(s * a, Y0, SO.cross.z0 + 0.4, { h: 4.8, arm: [0, 0.9], color: rng() < 0.5 ? WINDOW.warm : 0xdfe8ff });
  for (const a of [12, 28]) for (const s of [-1, 1]) lamp(s * a, YU, SO.upper.z1 - 0.3, { h: 4.0, arm: [0, -0.8], intensity: 1.7 });
  // 横街上空灯笼串
  for (const a of [14, 30, 46]) for (const s of [-1, 1]) {
    make.block(0.02, 0.02, SO.cross.z1 - SO.cross.z0, metal, { x: s * a, y: Y0 + 5.2, z: (SO.cross.z0 + SO.cross.z1) / 2 });
    for (let k = 1; k < 4; k++) lantern(s * a, Y0 + 4.85, SO.cross.z0 + k * 2);
  }

  // ---- 楼
  for (const s of [-1, 1]) {
    const X = a => s * a, xr = (a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];
    const T2 = towers('dsouth-' + s);
    const sb = (id, a0, a1, z0, z1, face, street, nF, shops, extra = {}) => {
      const [x0, x1] = xr(a0, a1);
      const ground = extra.ground ?? street;
      const sp = T2.add({ id: `S${s}-${id}`, x0, x1, z0, z1, face, ground: ground - 0.6, podiumTop: street + 4.2, height: street + 4.2 + nF * FL - ground + 0.6, shops, ...extra });
      if (shops) shopfronts({ ...sp, x0, x1, z0, z1 }, street, shops, { litP: 0.5, doorLight: 0.4 });
    };
    sb('A1', 5.5, 26, 40.2, 49.4, 'N', Y0, 5 + rng.int(0, 2), 4, { rooms: [0, 2] });
    sb('A2', 26.6, 56, 40.2, 49.4, 'N', Y0, 4 + rng.int(0, 2), 5, { rooms: [1, 3] });
    sb('B0', 5.5, 12, 51, 55.6, faceIn(s), Y0, 3, 1, { rooms: [0] });
    sb('B1', 12.6, 56, 51, 61.6, 'S', Y0, 4 + rng.int(0, 2), 6, { rooms: [1, 4] });
    sb('C0', 5.5, 12, 76.4, 80, faceIn(s), Y0, 3, 1, { rooms: [0] });
    sb('C1', 12.6, 56, 70.4, 80, 'N', Y0, 4 + rng.int(0, 2), 6, { rooms: [2] });
    sb('D1', 5.9, 56, 80.2, SO.steps.z1, 'S', YU, 3 + rng.int(0, 2), 5, { ground: Y0 });
    sb('E1', 0.3, 18, SO.upper.z1 + 0.4, 112.6, 'N', YU, 5 + rng.int(0, 3), 3);
    sb('E2', 18.6, 36.4, SO.upper.z1 + 0.4, 112.6, 'N', YU, 6 + rng.int(0, 3), 3);
    sb('UE', 36.6, 56.4, SO.steps.z1 + 0.2, 112.6, faceIn(s), YU, 5 + rng.int(0, 2), 0);
    sb('SC', 56.6, 72, 40.2, SO.steps.z1, faceIn(s), Y0, 6 + rng.int(0, 3), 0);
    T2.flush();
    // 窄后巷（A/B 之间）尽头路灯
    lamp(X(30), Y0, 50.2, { h: 3.6, arm: [0, 0], color: WINDOW.fluor, intensity: 1.2, radius: 7 });
  }
  make.neonSign({ text: '坡上巷', pos: [-7.2, YU + 3.4, SO.upper.z0 + 0.3], ry: 0, size: 0.32, color: NEON.cyan, light: false, halo: false });
  make.neonSign({ text: '黄葛树', pos: [0, Y0 + 2.6, TZ - 2.35], ry: Math.PI, size: 0.24, color: NEON.amber, light: false, halo: false });

  // ============================================================ 3) 滨江两头：骑楼街 + 趸船
  const RV = D.river, R = L.ROAD, AR = RV.arcade;
  lightsLeft = 18;
  for (const s of [-1, 1]) {
    const X = a => s * a, xr = (a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];
    const T3 = towers('driver-' + s);
    let a = RV.a0;
    let k = 0;
    while (a < RV.a1 - 8) {
      const w = Math.min(RV.a1 - a, rng.range(16, 24));
      const [x0, x1] = xr(a, a + w - 0.4);
      const nF = 3 + rng.int(0, 5);
      const nShops = Math.max(2, Math.round(w / 4.2));
      const sp = T3.add({ id: `R${s}-${k}`, x0, x1, z0: AR.z1, z1: AR.z1 + 13, face: 'N', ground: R.y - 0.6, podiumTop: AR.y + 0.6, height: AR.y + 0.6 + nF * FL - R.y + 0.6,
        shops: nShops, rooms: k === 0 ? [0, 2] : k === 2 ? [1] : [] });
      shopfronts({ ...sp, x0, x1, z0: AR.z1, z1: AR.z1 + 13 }, R.y + 0.15, nShops, { litP: 0.35, doorLight: 0.2 });
      a += w; k++;
    }
    T3.flush();
    // 骑楼：人行道上方的廊顶 + 廊柱
    const [x0, x1] = xr(RV.a0, a);
    make.block(x1 - x0, 0.32, AR.z1 - AR.z0, concrete, { x: (x0 + x1) / 2, y: AR.y, z: (AR.z0 + AR.z1) / 2 });
    make.block(x1 - x0, 0.5, 0.18, mat.surface('tilePink'), { x: (x0 + x1) / 2, y: AR.y + 0.32, z: AR.z0 + 0.09 });
    for (let c = RV.a0 + 2; c < a; c += 4.2) {
      make.block(0.36, AR.y, 0.36, mat.surface('tile', { wet: 0.4 }), { x: X(c), y: R.y, z: AR.z0 + 0.25, solid: true });
    }
    for (let c = RV.a0 + 8; c < a; c += 25) {
      const p = [X(c), AR.y - 0.1, (AR.z0 + AR.z1) / 2];
      make.block(0.8, 0.06, 0.2, mat.neon(WINDOW.fluor, 3), { x: p[0], y: p[1], z: p[2] });
      light([p[0], p[1] - 0.3, p[2]], WINDOW.fluor, 1.6, 9);
    }
    // 江边人行道：路灯延长 + 树池 + 长凳
    for (const lx of [120, 150, 180]) lamp(X(lx), R.y + 0.15, R.z1 + 1.0, { h: 8, color: 0xdfe8ff, intensity: 2.2, radius: 14 });
    for (let c = RV.a0 + 6; c < RV.a1; c += 15) {
      if (Math.abs(X(c) - (RV.gangway.x0 + RV.gangway.x1) / 2) < 6) continue;
      const z = R.z1 + 1.6;
      make.block(1.6, 0.45, 1.6, wallStone, { x: X(c), y: R.y + 0.15, z, solid: true });
      cyl(0.12, 2.2, X(c), R.y + 0.6, z, bark, 6, 0.09);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), leaves);
      m.scale.set(1, 0.85, 1); m.position.set(X(c), R.y + 3.1, z); S.add(m);
      if ((c | 0) % 2) make.block(1.8, 0.45, 0.5, wood, { x: X(c) + 2.6, y: R.y + 0.15, z: R.z1 + 2.2, solid: true });
    }
  }
  // ---- 趸船：跳板（踏步）+ 浮船甲板 + 候船室 + 小渡轮
  const G = RV.gangway, K = RV.deck;
  stairsZ(G.x0, G.x1, G.z0, G.z1, z => L.districtHeightAt((G.x0 + G.x1) / 2, z), () => L.RIVER.y - 0.6, mat.surface('metal', { wet: 1 }));
  for (const x of [G.x0 - 0.06, G.x1 + 0.06]) {
    for (let z = G.z0; z < G.z1 - 0.01; z += 0.75) {
      const y = L.districtHeightAt((G.x0 + G.x1) / 2, Math.min(G.z1 - 0.01, z + 0.74));
      make.block(0.08, 1.05, 0.75, metal, { x, y: y - 0.05, z: z + 0.375, solid: true });
    }
  }
  const hull = mat.std({ color: 0x2a2e36, roughness: 0.5, metalness: 0.4 });
  make.block(K.x1 - K.x0, K.y - (L.RIVER.y - 1.2), K.z1 - K.z0, hull, { x: (K.x0 + K.x1) / 2, y: L.RIVER.y - 1.2, z: (K.z0 + K.z1) / 2 });
  make.block(K.x1 - K.x0 - 0.3, 0.05, K.z1 - K.z0 - 0.3, mat.surface('wood', { roughness: 0.7 }), { x: (K.x0 + K.x1) / 2, y: K.y, z: (K.z0 + K.z1) / 2, uv: 2 });
  // 甲板栏杆（跳板入口处断开）
  const railY = K.y + 0.05;
  wallZ(K.z0 + 0.1, K.x0, K.x1, railY, 1.05, metal, 0.08);
  wallX(K.x0 + 0.1, K.z0, K.z1, railY, 1.05, metal, 0.08);
  wallX(K.x1 - 0.1, K.z0, K.z1, railY, 1.05, metal, 0.08);
  wallZ(K.z1 - 0.1, K.x0, G.x0, railY, 1.05, metal, 0.08);
  wallZ(K.z1 - 0.1, G.x1, K.x1, railY, 1.05, metal, 0.08);
  for (let x = K.x0 + 1.5; x < K.x1; x += 3) cyl(0.12, 0.45, x, K.y, K.z0 + 0.5, mat.surface('rust'), 8);   // 系缆桩
  // 候船室
  const cab = { x0: -113, x1: -101.5, z0: -165.4, z1: -160.6 };
  wallZ(cab.z0, cab.x0, cab.x1, K.y, 3.0, mat.surface('tileGreen'), 0.2);
  wallX(cab.x0, cab.z0, cab.z1, K.y, 3.0, mat.surface('tileGreen'), 0.2);
  wallX(cab.x1, cab.z0, cab.z1, K.y, 3.0, mat.surface('tileGreen'), 0.2);
  for (const [xa, xb] of [[cab.x0, -109], [-105.5, cab.x1]]) wallZ(cab.z1, xa, xb, K.y, 3.0, mat.surface('tileGreen'), 0.2);
  make.block(cab.x1 - cab.x0 + 0.6, 0.25, cab.z1 - cab.z0 + 0.8, metal, { x: (cab.x0 + cab.x1) / 2, y: K.y + 3.0, z: (cab.z0 + cab.z1) / 2 });
  make.block(cab.x1 - cab.x0 - 0.6, 0.45, 0.6, wood, { x: (cab.x0 + cab.x1) / 2, y: K.y, z: cab.z0 + 0.6, solid: true });   // 候船长椅
  for (const dx of [-3.4, 3.2]) make.quad(1.8, 1.1, mat.emissiveMap(tex.facade({ bays: 2, floors: 1, seed: 'cabin', wall: 'tileGreen', lit: 1 }).emissive, 1.4), { x: (cab.x0 + cab.x1) / 2 + dx, y: K.y + 1.7, z: cab.z1 + 0.11 });
  make.neonSign({ text: '江渡 · 候船室', pos: [(cab.x0 + cab.x1) / 2, K.y + 3.25 + 0.75, cab.z1 + 0.2], ry: 0, size: 0.4, style: 'box', color: NEON.cyan, color2: NEON.white });
  light([(cab.x0 + cab.x1) / 2, K.y + 2.6, (cab.z0 + cab.z1) / 2], WINDOW.fluor, 2.2, 8);
  lamp(K.x0 + 1.0, K.y, K.z1 - 1.0, { h: 3.8, intensity: 1.8 });
  lamp(K.x1 - 1.0, K.y, K.z1 - 1.0, { h: 3.8, intensity: 1.8 });
  make.neonSign({ text: '趸船 ↓', pos: [G.x0 - 0.6, R.y + 3.2, G.z1 + 0.6], ry: 0, size: 0.32, color: NEON.amber, light: false, halo: false });
  make.block(0.1, 3.2, 0.1, metal, { x: G.x0 - 0.6, y: R.y + 0.15, z: G.z1 + 0.6 });
  // 停靠的小渡轮
  const boat = { x0: -114, x1: -96, z0: -171.5, z1: -167.4 };
  make.block(boat.x1 - boat.x0, 2.0, boat.z1 - boat.z0, mat.std({ color: 0x9a9ea4, roughness: 0.5 }), { x: (boat.x0 + boat.x1) / 2, y: L.RIVER.y - 0.6, z: (boat.z0 + boat.z1) / 2 });
  make.block(boat.x1 - boat.x0 - 0.2, 0.25, boat.z1 - boat.z0 + 0.1, mat.surface('tarpRed'), { x: (boat.x0 + boat.x1) / 2, y: L.RIVER.y + 1.2, z: (boat.z0 + boat.z1) / 2 });
  make.block(9, 2.0, 3.0, mat.surface('tile'), { x: -106, y: L.RIVER.y + 1.4, z: (boat.z0 + boat.z1) / 2 });
  make.quad(8.2, 0.9, mat.emissiveMap(tex.facade({ bays: 6, floors: 1, seed: 'ferry', wall: 'tile', lit: 1 }).emissive, 1.6), { x: -106, y: L.RIVER.y + 2.7, z: boat.z1 - 0.48 });
  halo([-97, L.RIVER.y + 2.0, boat.z1 - 2], NEON.green, 0.8, 0.6);
  halo([-113, L.RIVER.y + 2.0, boat.z1 - 2], NEON.hotpot, 0.8, 0.6);

  I.flush();
}
