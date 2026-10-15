// 山城老居民楼生成器（buildingsW / buildingsE 共用；monorail 站楼也用它）。
// 组成：底商基座（podium）+ 分层立面（窗洞内凹、窗台、腰线、上部悬挑、凸阳台、楼梯间）
//      + 立面杂物（防盗网、空调+滴水痕、晾衣杆、热水器、腊肉、落水管、小广告）
//      + 侧/背立面窗 + 屋顶（女儿墙、加建铁皮房、吊脚木楼、水箱、太阳能、菜园、晾衣架、天线）。
// 所有零件经 Builder 累加，每栋楼每种材质合成一个 Mesh。
//
// spec（monorail 只传前 9 个；其余为 side.js 的可选增强，默认关闭 → 干净的"新楼"）：
//   { id, x0, x1, z0, z1, ground, podiumTop, height, face: 'E'|'W'|'N'|'S', setback,
//     old: bool        老居民楼杂物、悬挑、加建
//     sides: bool      侧/背立面开窗
//     cutA, cutB       立面两端（u=0 / u=length）楼身收进的宽度 → 楼间窄缝
//     sideMinA/B       两端侧墙从此高度以上才开窗（邻楼楼顶）
//     stilt: bool      顶部两层做成悬挑吊脚木楼
//     reserveZ         屋顶 z > reserveZ 的区域不放高杂物（楼顶大字招牌位置）
//     lights           窗口溢光光场数（默认 2）
//     lightsLow: bool  溢光只取低层亮窗（默认低/中层交替）
//     roofLight        屋顶灯泡登记光场：true = 不限；数字 = 该楼屋顶最多登记几盏
//     maxOut           正立面（含悬挑、凸阳台、笼子、屋顶加建）相对地块前沿的最大外挑（米）
//     lit              亮窗率覆盖（0..1）
//     roofRich         屋顶生活气倍率（伞、灯泡串、葡萄架、鸽笼、蓝篷布…；默认 0 = 关）
//     roofNeon         屋顶小霓虹 { text, color, color2 }（转向 hero 机位，无光场）
//     roofFront: bool  屋顶杂物偏向临街一侧
//     roofStrings      沿临街前沿强制拉几条灯泡串 }
// 返回立面描述（signs / shops / wires / props 依赖，字段只增不改）。
import * as THREE from 'three';
import { boxGeo } from '../../core/make.js';
import { BASE, WINDOW, NEON } from '../../core/palette.js';
import { Builder, FaceFrame } from './tower-geo.js';
import { wallTex, corrugatedTex, woodTex, windowAtlas, atlasUV, ATLAS_TONES, streakTex, adsTex, adsUV, ADS_N, WALL_METERS } from './tower-tex.js';

const RY = { E: Math.PI / 2, W: -Math.PI / 2, S: 0, N: Math.PI };

function frameAt(B, cx, cz, nx, nz, len) {
  const F = new FaceFrame(B, new THREE.Vector3(), Math.atan2(nx, nz));
  F.origin.set(cx, 0, cz).addScaledVector(F.t, -len / 2);
  return F;
}

// ------------------------------------------------------------------ 材质
function materials(ctx, B, rng, old) {
  const { mat, tex } = ctx;
  const W = (m, s = WALL_METERS) => B.worldUV(m, s);
  const kinds = old ? [['tile', 4], ['mosaic', 2], ['plaster', 3], ['brick', 1.2], ['concrete', 1]] : [['concrete', 2], ['tile', 1]];
  const pickWall = (exclude) => {
    let k; do { k = rng.weighted(kinds); } while (k === exclude && kinds.length > 1);
    const tint = {
      tile: rng.pick([BASE.tileWhite, BASE.tileWhite, BASE.tilePink, BASE.tileGreen]),
      mosaic: rng.pick([BASE.tileWhite, BASE.tileGreen, BASE.tilePink]),
      plaster: rng.pick([BASE.plaster, BASE.concrete, BASE.tilePink]),
      brick: rng.pick([BASE.plaster, BASE.tileWhite]),
      concrete: rng.pick([BASE.concrete, BASE.concreteDk, BASE.plaster]),
    }[k];
    return { kind: k, m: W(mat.std({ map: wallTex(ctx, k), color: tint, roughness: k === 'tile' || k === 'mosaic' ? 0.55 : 0.92 })) };
  };
  const wall = pickWall();
  const second = pickWall(wall.kind);     // 加建 / 凸阳台用的另一种墙
  const corrTint = [BASE.plastic, BASE.tarpRed, BASE.metal, BASE.rust, BASE.plastic];
  const corr = corrTint.map(c => W(mat.std({ map: corrugatedTex(ctx), color: c, roughness: 0.55, metalness: 0.3 }), 2));
  const atlas = windowAtlas(ctx);
  return {
    wall: wall.m, wallKind: wall.kind, second: second.m,
    trim: W(mat.std({ map: wallTex(ctx, 'concrete'), color: rng.pick([BASE.concrete, BASE.plaster, BASE.concreteDk]), roughness: 0.9 })),
    trimDk: W(mat.std({ map: wallTex(ctx, 'concrete'), color: BASE.concreteDk, roughness: 0.92 })),
    brick: W(mat.std({ map: wallTex(ctx, 'brick'), color: BASE.plaster, roughness: 0.9 })),
    plaster: W(mat.std({ map: wallTex(ctx, 'plaster'), color: BASE.plaster, roughness: 0.95 })),
    corr,
    wood: W(mat.std({ map: woodTex(ctx), color: BASE.wood, roughness: 0.85 }), 2),
    woodDk: mat.std({ color: BASE.wood, roughness: 0.9 }),
    frame: rng.pick([mat.surface('metal', { wet: 0.4 }), mat.surface('metalDk', { wet: 0.4 }), mat.std({ color: BASE.tileGreen, roughness: 0.6 })]),
    glassLit: mat.emissiveMap(atlas, 1.55),
    glassDim: mat.emissiveMap(atlas, 0.6),
    glassDark: mat.std({ map: atlas, roughness: 0.12, metalness: 0.35, wet: 0 }),
    grille: mat.std({ map: tex.grille(), color: 0x3a3d42, roughness: 0.5, metalness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide, wet: 0.5 }),
    metalDk: mat.surface('metalDk', { wet: 0.6 }),
    metal: mat.surface('metal', { wet: 0.6 }),
    rust: mat.surface('rust'),
    ac: mat.std({ color: BASE.tileWhite, roughness: 0.6, wet: 0.6 }),
    acFan: mat.std({ color: BASE.grime, roughness: 0.7 }),
    pipe: mat.std({ color: rng.pick([BASE.metal, BASE.concrete, BASE.grime]), roughness: 0.6 }),
    heater: mat.std({ color: BASE.tileWhite, roughness: 0.4 }),
    plastic: mat.surface('plastic'),
    foam: mat.std({ color: BASE.tileWhite, roughness: 0.9 }),
    green: mat.std({ color: BASE.green, roughness: 0.8 }),
    soil: mat.std({ color: BASE.wood, roughness: 0.95 }),
    meat: mat.std({ color: BASE.tarpRed, roughness: 0.5, wet: 0.2 }),
    streak: mat.std({ map: streakTex(ctx), color: BASE.grime, roughness: 0.9, alphaTest: 0.5 }),
    ads: mat.std({ map: adsTex(ctx), roughness: 0.9, alphaTest: 0.4 }),
    laundry: [BASE.tarpRed, BASE.plastic, BASE.plaster, BASE.tilePink, BASE.tileGreen, BASE.tileWhite, BASE.wood]
      .map(c => mat.std({ color: c, roughness: 0.9, side: THREE.DoubleSide, wet: 0.3 })),
    solar: mat.std({ color: BASE.glassDk, roughness: 0.15, metalness: 0.4, wet: 0.8 }),
    bulb: mat.neon(WINDOW.warm, 4),
    bulbs: [mat.neon(WINDOW.warm, 4), mat.neon(WINDOW.warm, 4), mat.neon(NEON.amber, 4), mat.neon(NEON.hotpot, 3.5), mat.neon(NEON.cyan, 3.5)],
    umbrella: [BASE.tarpRed, BASE.plastic, BASE.tileGreen, BASE.tarpRed, BASE.tilePink]
      .map(c => mat.std({ color: c, roughness: 0.55, side: THREE.DoubleSide, wet: 1 })),
    tarp: mat.std({ color: BASE.plastic, roughness: 0.5, wet: 1 }),
    tube: mat.neon(WINDOW.fluor, 1.8),
    grime: mat.surface('grime', { wet: 0.3 }),
  };
}

export function buildTower(ctx, spec, builder) {
  const { mat, make } = ctx;
  const rng = ctx.rng('tower-' + spec.id);
  const old = !!spec.old;
  const xa = Math.min(spec.x0, spec.x1), xb = Math.max(spec.x0, spec.x1);
  const za = Math.min(spec.z0, spec.z1), zb = Math.max(spec.z0, spec.z1);
  const face = spec.face;
  const ry = RY[face];
  const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));          // 立面外法线
  const t = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));         // 沿立面方向（u）
  const setback = spec.setback ?? 0;
  const top = spec.ground + spec.height;
  const podiumTop = spec.podiumTop ?? spec.ground + 4.5;

  // 楼身范围（正面后退 setback）
  let bx0 = xa, bx1 = xb, bz0 = za, bz1 = zb;
  if (face === 'E') bx1 -= setback; if (face === 'W') bx0 += setback;
  if (face === 'S') bz1 -= setback; if (face === 'N') bz0 += setback;
  const W = bx1 - bx0, D = bz1 - bz0, Hb = top - podiumTop;
  const faceLen = face === 'E' || face === 'W' ? D : W;
  const depth = face === 'E' || face === 'W' ? W : D;

  // ---------------- 基座（底商层）—— 店面归 shops，这里只给实体与挑檐
  // spec.podiumHoles = [{x0,x1,z0,z1}]：基座在这些平面矩形内挖空（可进入的店铺由 shops / districts 自己搭房间）
  let podRects = [{ x0: xa, x1: xb, z0: za, z1: zb }];
  for (const h of spec.podiumHoles || []) {
    podRects = podRects.flatMap(r => {
      if (h.x0 >= r.x1 || h.x1 <= r.x0 || h.z0 >= r.z1 || h.z1 <= r.z0) return [r];
      const ix0 = Math.max(r.x0, h.x0), ix1 = Math.min(r.x1, h.x1);
      return [
        { x0: r.x0, x1: ix0, z0: r.z0, z1: r.z1 }, { x0: ix1, x1: r.x1, z0: r.z0, z1: r.z1 },
        { x0: ix0, x1: ix1, z0: r.z0, z1: Math.max(r.z0, h.z0) }, { x0: ix0, x1: ix1, z0: Math.min(r.z1, h.z1), z1: r.z1 },
      ].filter(q => q.x1 - q.x0 > 0.01 && q.z1 - q.z0 > 0.01);
    });
  }
  for (const r of podRects) make.block(r.x1 - r.x0, podiumTop - spec.ground + 0.5, r.z1 - r.z0, mat.surface('concreteDk'),
    { x: (r.x0 + r.x1) / 2, y: spec.ground - 0.5, z: (r.z0 + r.z1) / 2, solid: true });
  const eave = new THREE.Mesh(boxGeo(face === 'E' || face === 'W' ? 0.9 : W, 0.25, face === 'E' || face === 'W' ? D : 0.9), mat.surface('concrete'));
  const frontPlane = face === 'E' ? xb : face === 'W' ? xa : face === 'S' ? zb : za;
  if (face === 'E' || face === 'W') eave.position.set(frontPlane + n.x * 0.4, podiumTop, (bz0 + bz1) / 2);
  else eave.position.set((bx0 + bx1) / 2, podiumTop, frontPlane + n.z * 0.4);
  ctx.staticRoot.add(eave);

  // ---------------- 立面坐标系：origin = 立面左端（u=0）底部
  const fp = face === 'E' ? bx1 : face === 'W' ? bx0 : face === 'S' ? bz1 : bz0;
  const center = face === 'E' || face === 'W' ? new THREE.Vector3(fp, 0, (bz0 + bz1) / 2) : new THREE.Vector3((bx0 + bx1) / 2, 0, fp);
  const origin = center.clone().addScaledVector(t, -faceLen / 2);
  const P = (u, y, out = 0) => origin.clone().addScaledVector(t, u).addScaledVector(n, out).setY(y);

  const B = builder || new Builder(ctx);
  const M = materials(ctx, B, rng, old);
  const F = new FaceFrame(B, origin.clone(), ry);

  const floors = Math.max(2, Math.round(Hb / 3.0));
  const bays = Math.max(2, Math.round(faceLen / 3.2));
  const fh = Hb / floors, bw = faceLen / bays;
  const ua = spec.cutA ?? 0, ub = faceLen - (spec.cutB ?? 0), uc = (ua + ub) / 2, uw = ub - ua;
  const R = old ? rng.range(0.18, 0.3) : 0.25;            // 窗洞内凹深度
  const fixtures = [];                                      // 立面挑出物（给 signs 等避让）
  const fix = (u0, u1, y0, y1, out) => fixtures.push({ u0, u1, y0, y1, out });

  // ---------------- 上部悬挑：越往上越宽（从招牌高度以上开始，避免与竖招牌打架）
  const stiltFloors = spec.stilt && floors >= 5 ? 2 : 0;
  let f1 = floors, f2 = floors, ov1 = 0, ov2 = 0;
  if (old && floors >= 6 && rng() < 0.65) {
    f1 = Math.max(2, Math.ceil(11.5 / fh));
    ov1 = rng.range(0.35, 0.8);
    if (rng() < 0.5) { f2 = f1 + rng.int(2, 3); ov2 = rng.range(0.2, 0.4); }
  }
  // 外挑上限（相对地块前沿；楼身已后退 setback）：楼体悬挑至少给凸阳台留 0.5 m
  const cap = spec.maxOut !== undefined ? spec.maxOut + setback : Infinity;
  ov1 = Math.min(ov1, Math.max(0, cap - 0.5)); ov2 = Math.min(ov2, Math.max(0, cap - 0.5 - ov1));
  const ovAt = (f) => (f >= f1 ? ov1 : 0) + (f >= f2 ? ov2 : 0);
  const outAt = (y) => ovAt(Math.max(0, Math.min(floors - 1, Math.floor((y - podiumTop) / fh))));

  // 楼身核心：按悬挑分段，各一个实体盒（正面退到窗洞底）
  const bodyFloors = floors - stiltFloors;
  for (let f = 0; f < bodyFloors;) {
    let g = f; while (g + 1 < bodyFloors && ovAt(g + 1) === ovAt(f)) g++;
    const ov = ovAt(f), y0 = podiumTop + f * fh, h = (g - f + 1) * fh;
    F.box(M.wall, uc, y0, (ov - R - depth) / 2, uw, h, depth + ov - R);
    if (f > 0 && ov > ovAt(f - 1)) {   // 悬挑底部的托梁（一排小挑梁）
      for (let u = ua + 0.4; u < ub; u += rng.range(1.2, 1.8)) F.box(M.trimDk, u, y0 - 0.35, ovAt(f - 1) + (ov - ovAt(f - 1)) / 2, 0.18, 0.35, ov - ovAt(f - 1));
    }
    f = g + 1;
  }
  {
    const a = P(ua, 0, -depth), b = P(ub, 0, 0);
    ctx.physics.addBox(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), top, podiumTop);
  }

  // ---------------- 立面列规划：每个开间一列（窗 / 宽窗 / 凸阳台 / 楼梯间 / 实墙）
  const colKind = [];
  let stairCol = old && bays >= 3 && rng() < 0.6 ? rng.int(0, bays - 1) : -1;
  for (let b = 0; b < bays; b++) {
    if (b === stairCol) { colKind.push('stair'); continue; }
    colKind.push(old ? rng.weighted([['win', 6], ['wide', 2.5], ['balc', 1.8], ['blank', 0.6]]) : rng.weighted([['win', 3], ['wide', 2]]));
  }
  const balcRange = colKind.map(() => { const a = rng.int(0, Math.max(0, bodyFloors - 3)); return [a, Math.min(bodyFloors - 1, a + rng.int(2, bodyFloors))]; });
  let lit = old ? rng.range(0.38, 0.62) : rng.range(0.4, 0.6);
  if (spec.lit !== undefined) lit = spec.lit;
  const P_ = {   // 杂物概率（每栋楼不同的"生活气"）
    cage: old ? rng.range(0.12, 0.4) : 0, ac: old ? rng.range(0.2, 0.45) : 0, pole: old ? rng.range(0.04, 0.14) : 0,
    heater: old ? 0.06 : 0, meat: old ? 0.035 : 0, streak: old ? 0.35 : 0.1,
    belt: old ? rng.pick([0, 1, 1, 2]) : 1, lintel: rng() < 0.5,
  };
  const litWins = [];                                       // 记录亮窗（光场用）

  // 一扇窗：玻璃（图集）+ 窗框 + 窗台；o0 = 窗洞底（玻璃所在平面）的 out 值
  const glass = (Fr, u, yb, w, h, o0, forceLit, f) => {
    const isLit = forceLit ?? (rng() < lit * (0.4 + 1.2 * ((f ?? 0) * 7919 % 13) / 13));
    let m, cell;
    if (isLit) { cell = rng.int(0, 15); m = rng() < 0.22 ? M.glassDim : M.glassLit; }
    else { cell = 16 + rng.int(0, 15); m = M.glassDark; }
    Fr.quad(m, u, yb + h / 2, o0 + 0.02, w, h, atlasUV(new THREE.PlaneGeometry(1, 1), cell));
    if (isLit && m === M.glassLit) litWins.push({ Fr, u, y: yb + h / 2, o: o0, tone: ATLAS_TONES[cell] });
    return isLit;
  };
  const frameRing = (Fr, u, yb, w, h, o0) => {
    const fd = 0.08, ft = 0.06, oc = o0 + 0.02 + fd / 2;
    Fr.box(M.frame, u, yb + h - ft, oc, w, ft, fd);
    Fr.box(M.frame, u, yb, oc, w, ft, fd);
    Fr.box(M.frame, u - w / 2 + ft / 2, yb, oc, ft, h, fd);
    Fr.box(M.frame, u + w / 2 - ft / 2, yb, oc, ft, h, fd);
  };
  const streakBelow = (Fr, u, y, o, w, len) => Fr.quad(M.streak, u, y - len / 2, o + 0.006, w, len);

  // 窗外杂物（防盗网、空调、晾衣杆、热水器、腊肉）
  const clutter = (Fr, f, u, yb, w, h, ov, room) => {
    const yt = yb + h;
    if (rng() < P_.cage) {
      const cd = Math.max(0.25, Math.min(rng.range(0.3, 0.75), cap - ov)), cw = w + 0.3;
      Fr.box(M.grille, u, yb - 0.15, ov + cd / 2, cw, h + 0.35, cd);
      Fr.box(M.trim, u, yb - 0.23, ov + cd / 2, cw + 0.1, 0.08, cd + 0.02);
      fix(u - cw / 2, u + cw / 2, yb - 0.25, yt + 0.6, cd);
      for (let k = 0, nk = rng.int(1, 4); k < nk; k++) {      // 笼子里塞的东西
        const sw = rng.range(0.22, 0.5), sh = rng.range(0.2, 0.7), sd = Math.min(cd - 0.08, rng.range(0.2, 0.4));
        Fr.box(rng.pick([M.plastic, M.foam, M.green, M.woodDk, M.green, M.rust]), u + rng.range(-cw / 2 + sw / 2, cw / 2 - sw / 2), yb - 0.15, ov + 0.05 + sd / 2, sw, sh, sd);
      }
      if (rng() < 0.4) {    // 笼里晾衣服
        for (let k = 0, nk = rng.int(2, 4); k < nk; k++) Fr.quad(rng.pick(M.laundry), u + rng.range(-cw * 0.35, cw * 0.35), yt - 0.35, ov + cd * 0.6, rng.range(0.3, 0.55), rng.range(0.45, 0.8));
      }
      if (rng() < 0.45) { const rd = Math.min(cd + 0.45, cap - ov); Fr.box(rng.pick(M.corr), u, yt + 0.3, ov + rd / 2 - 0.05, cw + 0.4, 0.03, rd, 0.22); }   // 雨棚
      if (rng() < P_.streak) streakBelow(Fr, u, yb - 0.25, ov, cw * 0.7, rng.range(1.0, 2.8));
      return;
    }
    if (rng() < P_.ac) {    // 空调外机：窗边或窗下
      const side = rng() < 0.5 ? -1 : 1;
      let au = u + side * (w / 2 + 0.55), ay = yb + rng.range(-0.1, 0.4);
      if (room < 1.2) { au = u + rng.range(-0.3, 0.3); ay = yb - 0.75; }
      Fr.box(M.ac, au, ay, ov + 0.2, 0.82, 0.56, 0.34);
      Fr.quad(M.acFan, au + 0.12, ay + 0.28, ov + 0.375, 0.38, 0.38, new THREE.CircleGeometry(0.5, 12));
      Fr.box(M.metalDk, au - 0.3, ay - 0.05, ov + 0.2, 0.04, 0.05, 0.42);
      Fr.box(M.metalDk, au + 0.3, ay - 0.05, ov + 0.2, 0.04, 0.05, 0.42);
      if (rng() < 0.4) Fr.box(M.rust, au, ay + 0.62, ov + 0.24, 0.95, 0.04, 0.5, 0.15);
      if (rng() < 0.6) streakBelow(Fr, au, ay - 0.05, ov, 0.45, rng.range(1.2, 3.5));
      fix(au - 0.45, au + 0.45, ay, ay + 0.6, 0.4);
    }
    if (rng() < P_.pole && cap - ov >= 0.6) {  // 晾衣杆（垂直墙面挑出）+ 衣服
      const len = Math.min(rng.range(0.9, 1.4), cap - ov - 0.05);
      for (const s of [-1, 1]) Fr.box(M.metal, u + s * (w / 2 - 0.15), yt + 0.05, ov + len / 2, 0.03, 0.03, len);
      for (let k = 0, nk = rng.int(2, 5); k < nk; k++) Fr.quad(rng.pick(M.laundry), u + rng.range(-w / 2 + 0.3, w / 2 - 0.3), yt - 0.3, ov + rng.range(0.2, len), rng.range(0.35, 0.6), rng.range(0.5, 0.75));
      fix(u - w / 2, u + w / 2, yt - 0.7, yt + 0.1, len);
    } else if (rng() < P_.meat && cap - ov >= 0.5) {   // 腊肉香肠
      const len = Math.min(0.8, cap - ov - 0.1);
      Fr.box(M.metal, u, yt + 0.05, ov + len / 2, 0.03, 0.03, len);
      Fr.box(M.metal, u, yt + 0.05, ov + len, w * 0.8, 0.03, 0.03);
      for (let k = 0, nk = rng.int(3, 6); k < nk; k++) Fr.box(M.meat, u + rng.range(-w * 0.38, w * 0.38), yt - rng.range(0.3, 0.5), ov + len, rng.range(0.06, 0.14), rng.range(0.3, 0.5), 0.05);
    }
    if (rng() < P_.heater && room > 1.4) {   // 热水器（横放白色筒）
      const s = rng() < 0.5 ? -1 : 1;
      Fr.cyl(M.heater, u + s * (w / 2 + 0.2) + s * 0.75, yt - 0.1, ov + 0.25, 0.2, 0.75, 10, 0, Math.PI / 2 * s);
    }
  };

  // ---------------- 正立面：逐层"带"几何
  const winBand = [];   // 每层 [{u0,u1}] 记录开口，给小广告找空墙
  for (let f = 0; f < bodyFloors; f++) {
    const y0 = podiumTop + f * fh, ov = ovAt(f), o0 = ov - R, oc = ov - R / 2;
    const hs = Math.min(0.95, fh * 0.3), wh = Math.min(1.65, fh - hs - 0.4), yb = y0 + hs, yt = yb + wh;
    const ops = [];
    for (let b = 0; b < bays; b++) {
      let k = colKind[b];
      if (k === 'balc' && !(f >= balcRange[b][0] && f <= balcRange[b][1])) k = 'win';
      if (old && (k === 'win' || k === 'wide') && rng() < 0.12) k = rng.pick(['win', 'wide', 'blank', 'small']);
      const u = (b + 0.5) * bw;
      if (k === 'blank' || k === 'balc') { ops.push({ k, u }); continue; }
      let w = k === 'wide' ? bw * 0.74 : k === 'small' ? Math.min(0.8, bw * 0.3) : k === 'stair' ? 0.7 : bw * 0.48;
      let b0 = yb, h = wh;
      if (k === 'small') { b0 = yb + 0.5; h = 0.7; }
      if (k === 'stair') { b0 = y0 + fh * 0.45; h = Math.min(1.1, fh * 0.45); }
      if (u - w / 2 < ua + 0.2 || u + w / 2 > ub - 0.2) { ops.push({ k: 'blank', u }); continue; }
      ops.push({ k, u, w, b0, h });
    }
    // 墙带：窗下槛墙 + 窗上过梁 + 窗间墙
    F.box(M.wall, uc, y0, oc, uw, hs, R);
    F.box(M.wall, uc, yt, oc, uw, y0 + fh - yt, R);
    let cur = ua;
    const band = [];
    for (const op of ops) {
      if (!op.w) continue;
      const a = op.u - op.w / 2, c = op.u + op.w / 2;
      F.box(M.wall, (cur + a) / 2, yb, oc, a - cur, wh, R);
      if (op.b0 > yb) F.box(M.wall, op.u, yb, oc, op.w, op.b0 - yb, R);
      if (op.b0 + op.h < yt) F.box(M.wall, op.u, op.b0 + op.h, oc, op.w, yt - op.b0 - op.h, R);
      band.push([cur, a]);
      cur = c;
    }
    F.box(M.wall, (cur + ub) / 2, yb, oc, ub - cur, wh, R);
    band.push([cur, ub]);
    winBand.push(band);
    // 腰线
    if (P_.belt && f > 0 && f % P_.belt === 0) F.box(M.trim, uc, y0 - 0.1, ov + 0.03, uw + 0.06, 0.2, 0.18);
    // 窗、窗台、窗楣、杂物
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (op.k === 'balc') continue;
      if (!op.w) {   // 实墙：偶尔一个排风扇
        if (old && rng() < 0.2) {
          F.box(M.metalDk, op.u, yb + 0.6, ov + 0.06, 0.42, 0.42, 0.12);
          F.quad(M.acFan, op.u, yb + 0.81, ov + 0.125, 0.32, 0.32, new THREE.CircleGeometry(0.5, 10));
          if (rng() < 0.5) streakBelow(F, op.u, yb + 0.6, ov, 0.35, rng.range(0.8, 2));
        }
        continue;
      }
      const forceLit = op.k === 'stair' ? rng() < 0.75 : undefined;
      glass(F, op.u, op.b0, op.w, op.h, o0, forceLit, f);
      frameRing(F, op.u, op.b0, op.w, op.h, o0);
      F.box(M.trim, op.u, op.b0 - 0.07, ov - R / 2 + 0.05, op.w + 0.16, 0.07, R + 0.1);
      if (P_.lintel && op.k !== 'stair') F.box(M.trim, op.u, op.b0 + op.h, ov + 0.04, op.w + 0.2, 0.1, 0.08);
      if (old && rng() < 0.25) streakBelow(F, op.u, op.b0 - 0.07, ov, op.w * 0.8, rng.range(0.6, 1.8));
      const prev = ops[i - 1], next = ops[i + 1];
      const room = Math.min(prev ? op.u - op.w / 2 - (prev.w ? prev.u + prev.w / 2 : prev.u - bw / 2) : 9, next ? (next.w ? next.u - next.w / 2 : next.u + bw / 2) - op.u - op.w / 2 : 9);
      if (old && op.k !== 'stair') clutter(F, f, op.u, op.b0, op.w, op.h, ov, room);
    }
  }

  // ---------------- 凸阳台（封闭阳台，竖向一串）
  for (let b = 0; b < bays; b++) {
    if (colKind[b] !== 'balc') continue;
    const [fa, fb] = balcRange[b];
    const u = (b + 0.5) * bw, w = Math.min(bw * rng.range(0.78, 0.95), uw - 0.4), pd0 = rng.range(0.7, 1.15);
    if (u - w / 2 < ua || u + w / 2 > ub) continue;
    const bm = rng() < 0.5 ? M.second : M.wall;
    for (let f = fa; f <= fb; f++) {
      const ov = ovAt(f), pd = Math.max(0.5, Math.min(pd0, Math.min(1.5, cap) - ov)), y0 = podiumTop + f * fh, oc = ov + pd / 2;   // 总挑出 ≤ 1.5 m（或 cap）
      const kind = rng() < 0.18 ? 'open' : 'closed';
      F.box(M.trim, u, y0 - 0.05, oc, w + 0.1, 0.15, pd);                       // 楼板
      F.box(bm, u, y0 + 0.1, oc, w, 0.9, pd);                                   // 栏板
      if (kind === 'closed') {
        const gh = fh - 1.35;
        F.box(bm, u, y0 + 1.0 + gh, oc, w, fh - 1.0 - gh, pd);                   // 上沿
        const panes = Math.max(2, Math.round(w / 0.9));
        for (let k = 0; k < panes; k++) {
          const pu = u - w / 2 + (k + 0.5) * w / panes;
          glass(F, pu, y0 + 1.0, w / panes - 0.04, gh, ov + pd - 0.06, undefined, f);
        }
        for (let k = 0; k <= panes; k++) F.box(M.frame, u - w / 2 + k * w / panes, y0 + 1.0, ov + pd - 0.02, 0.05, gh, 0.06);
        for (const s of [-1, 1]) {                                              // 侧面小窗
          const sF = frameAt(B, ...(() => { const p = F.P(u + s * w / 2, 0, oc); return [p.x, p.z]; })(), t.x * s, t.z * s, pd);
          const sl = rng() < lit;
          sF.quad(sl ? M.glassLit : M.glassDark, pd / 2, y0 + 1.0 + gh / 2, 0.01, pd - 0.2, gh - 0.1, atlasUV(new THREE.PlaneGeometry(1, 1), sl ? rng.int(0, 15) : rng.int(16, 31)));
        }
        if (rng() < P_.ac * 0.8 && ov + pd + 0.34 <= cap) {   // 阳台外挂空调
          F.box(M.ac, u + rng.range(-w / 3, w / 3), y0 + 0.2, ov + pd + 0.17, 0.82, 0.56, 0.34);
          if (rng() < 0.5) streakBelow(F, u, y0 + 0.15, ov + pd - 0.01, 0.4, rng.range(1, 3));
        }
      } else {
        F.box(M.grille, u, y0 + 1.0, oc, w, fh - 1.1, pd);
        glass(F, u, y0 + 1.0, w * 0.4, fh - 1.4, ov + 0.1, undefined, f);
        for (let k = 0, nk = rng.int(2, 5); k < nk; k++) F.quad(rng.pick(M.laundry), u + rng.range(-w * 0.4, w * 0.4), y0 + fh - 0.75, ov + pd * rng.range(0.3, 0.8), rng.range(0.3, 0.6), rng.range(0.5, 0.8));
        for (let k = 0, nk = rng.int(1, 3); k < nk; k++) F.box(M.green, u + rng.range(-w * 0.4, w * 0.4), y0 + 0.1, ov + pd * 0.5, 0.35, rng.range(0.3, 0.7), 0.3);
      }
      if (f === fb) F.box(M.trim, u, y0 + fh - 0.05, oc, w + 0.1, 0.12, pd + 0.02);
      if (old && f === fb && rng() < 0.5) {   // 顶上一片雨棚（外沿不超过 cap）
        const cd2 = Math.min(pd + 0.3, 2 * (cap - oc - 0.1));
        if (cd2 > 0.3) F.box(rng.pick(M.corr), u, y0 + fh + 0.1, oc + 0.1, w + 0.3, 0.03, cd2, 0.18);
      }
      fix(u - w / 2, u + w / 2, y0, y0 + fh, pd);
    }
  }

  // ---------------- 落水管（每层一段，悬挑处有折弯）
  if (old || rng() < 0.5) {
    const np = rng.int(1, 3);
    for (let i = 0; i < np; i++) {
      const u = rng.pick([ua + 0.18, ub - 0.18, Math.round(rng.range(1, bays - 1)) * bw]);
      if (u < ua + 0.1 || u > ub - 0.1) continue;
      for (let f = 0; f < bodyFloors; f++) {
        const ov = ovAt(f), y0 = podiumTop + f * fh;
        F.box(M.pipe, u, y0, ov + 0.09, 0.11, fh, 0.11);
        if (f > 0 && ov !== ovAt(f - 1)) F.box(M.pipe, u, y0 - 0.06, (ov + ovAt(f - 1)) / 2 + 0.09, 0.11, 0.11, Math.abs(ov - ovAt(f - 1)) + 0.11);
        if (rng() < 0.15) F.box(M.pipe, u, y0 + rng.range(0.5, 2), ov + 0.09, 0.16, 0.12, 0.16);   // 管箍
      }
    }
  }

  // ---------------- 墙上小广告（喷漆字）：找底层窗间空墙
  if (old && winBand.length) {
    for (let k = 0, nk = rng.int(1, 3); k < nk; k++) {
      const f = rng.int(0, Math.min(1, winBand.length - 1));
      const gaps = winBand[f].filter(([a, c]) => c - a > 1.0);
      if (!gaps.length) continue;
      const [a, c] = rng.pick(gaps);
      const w = Math.min(c - a - 0.2, rng.range(0.8, 1.4)), h = w / 2;
      const y = podiumTop + f * fh + rng.range(1.2, 2.2);
      F.quad(M.ads, (a + c) / 2, y, ovAt(f) + 0.008, w, h, adsUV(new THREE.PlaneGeometry(1, 1), rng.int(0, ADS_N - 1)));
    }
  }

  // ---------------- 吊脚木楼（顶部两层整体外挑，斜撑 + 立柱吊在立面上）
  if (stiltFloors) {
    const f0 = bodyFloors, y0 = podiumTop + f0 * fh, h = stiltFloors * fh;
    const ov0 = ovAt(f0 - 1), cant = rng.range(1.2, 1.7);
    const front = ov0 + cant;
    // 下部砖砌部分（后半截）
    F.box(M.brick, uc, y0, (-depth + ov0 - 0.6) / 2, uw, h, depth + ov0 - 0.6);
    // 木楼：楼板 + 木板墙
    F.box(M.woodDk, uc, y0 - 0.25, (front + ov0 - 0.6) / 2, uw + 0.2, 0.25, front - ov0 + 0.6);
    F.box(M.wood, uc, y0, (front + ov0 - 0.6) / 2 - 0.02, uw, h, front - ov0 + 0.56);
    for (let f = 0; f < stiltFloors; f++) {   // 木窗 + 走马廊栏杆
      const yy = y0 + f * fh;
      for (let u = ua + 1.2; u < ub - 1; u += rng.range(1.8, 2.6)) {
        glass(F, u, yy + 0.9, 1.1, Math.min(1.3, fh - 1.3), front, rng() < 0.6, f0 + f);
        F.box(M.woodDk, u, yy + 0.82, front + 0.06, 1.3, 0.08, 0.14);
        F.box(M.woodDk, u, yy + 0.9 + Math.min(1.3, fh - 1.3), front + 0.04, 1.3, 0.1, 0.1);
      }
      F.box(M.woodDk, uc, yy - 0.05, front + 0.05, uw + 0.1, 0.16, 0.16);
    }
    // 吊脚：立柱从木楼底一直落到两层以下的挑梁上 + 斜撑
    const footY = y0 - 2 * fh;
    for (let u = ua + 0.5; u < ub; u += rng.range(2.2, 3.0)) {
      F.box(M.woodDk, u, footY, front - 0.15, 0.2, y0 - footY, 0.2);
      const ovF = ovAt(Math.max(0, f0 - 2));
      F.box(M.woodDk, u, footY - 0.2, (ovF + front - 0.05) / 2, 0.22, 0.22, front - 0.05 - ovF);
      const len = Math.hypot(cant - 0.15, fh * 1.2);
      F.box(M.woodDk, u + 0.2, y0 - fh * 1.2, ov0 + 0.05, 0.14, len, 0.14, Math.atan2(cant - 0.15, fh * 1.2));
    }
    fix(ua, ub, footY - 0.3, y0 + h, front);
    // 青瓦坡屋顶
    const rw = front - ov0 + 1.4;
    F.box(M.grime, uc, y0 + h + 0.35, front - rw / 2 + 0.6, uw + 0.8, 0.08, rw, 0.3);
  }

  // ---------------- 侧/背立面
  if (spec.sides) {
    const xs = [];
    // 两端侧墙（法线 ∓t），背墙（法线 -n）
    const endA = F.P(ua, 0, -depth / 2), endB = F.P(ub, 0, -depth / 2), back = F.P(uc, 0, -depth);
    xs.push([frameAt(B, endA.x, endA.z, -t.x, -t.z, depth), spec.sideMinA ?? -1e9, depth]);
    xs.push([frameAt(B, endB.x, endB.z, t.x, t.z, depth), spec.sideMinB ?? -1e9, depth]);
    xs.push([frameAt(B, back.x, back.z, -n.x, -n.z, uw), -1e9, uw]);
    const sLit = lit;
    for (const [Fr, yMin, len] of xs) {
      const nb = Math.max(1, Math.round((len - 1.6) / 3.3)), sbw = (len - 1.6) / nb;
      for (let f = 0; f < bodyFloors; f++) {
        const y0 = podiumTop + f * fh;
        if (y0 < yMin + 0.3) continue;
        for (let b = 0; b < nb; b++) {
          if (rng() < 0.3) continue;
          const u = 0.8 + (b + 0.5) * sbw, w = Math.min(sbw * 0.5, 1.6), h = Math.min(1.5, fh - 1.3), yb = y0 + 0.95;
          glass(Fr, u, yb, w, h, 0, rng() < sLit, f);
          Fr.box(M.trim, u, yb - 0.08, 0.06, w + 0.18, 0.08, 0.14);
          Fr.box(M.trim, u, yb + h, 0.04, w + 0.12, 0.1, 0.1);
          if (old) {
            const r = rng();
            if (r < 0.14) {
              const cd = rng.range(0.3, 0.6);
              Fr.box(M.grille, u, yb - 0.15, cd / 2, w + 0.3, h + 0.35, cd);
              Fr.box(M.trim, u, yb - 0.23, cd / 2, w + 0.4, 0.08, cd);
            } else if (r < 0.3) {
              Fr.box(M.ac, u + 1.0, yb, 0.2, 0.82, 0.56, 0.34);
              if (rng() < 0.6) streakBelow(Fr, u + 1.0, yb - 0.02, 0, 0.45, rng.range(1.2, 3));
            } else if (r < 0.45) streakBelow(Fr, u, yb - 0.08, 0, w * 0.8, rng.range(0.8, 2.5));
          }
        }
      }
      if (old && rng() < 0.4) Fr.quad(M.ads, len * rng.range(0.3, 0.7), Math.max(podiumTop, yMin) + rng.range(0.8, 2.5), 0.008, 1.2, 0.6, adsUV(new THREE.PlaneGeometry(1, 1), rng.int(0, ADS_N - 1)));
    }
  }

  // ---------------- 楼间窄缝：缝内 2.6 m 深处一道黑墙（缝看起来又黑又深）
  for (const [cut, u, hMax] of [[spec.cutA ?? 0, 0, spec.sideMinA], [spec.cutB ?? 0, faceLen, spec.sideMinB]]) {
    if (cut <= 0.05) continue;
    const yTop = Math.min(top, hMax ?? top);
    if (yTop <= podiumTop) continue;
    F.box(M.grime, u === 0 ? cut / 2 : faceLen - cut / 2, podiumTop, -2.6, cut + 0.02, yTop - podiumTop, 0.3);
    if (old && rng() < 0.7) {   // 缝里横穿的管子 / 电缆
      for (let k = 0; k < rng.int(1, 3); k++) F.box(M.pipe, u === 0 ? cut / 2 : faceLen - cut / 2, podiumTop + rng.range(1, yTop - podiumTop - 1), -rng.range(0.3, 2), cut + 0.02, 0.08, 0.08);
    }
  }

  // ---------------- 屋顶
  const roofTop = top + 0.15;
  roof(ctx, { B, F, M, rng, spec, old, ua, ub, uc, uw, depth, top, ovT: stiltFloors ? 0 : ovAt(floors - 1), stilt: !!stiltFloors, cap });

  // ---------------- 窗口溢光：给梯坎 / 街面染上暖色（取低层的真实亮窗）
  const nL = spec.lights ?? 2;
  // 一半取低层（染梯坎），一半取中层（照亮防盗网、阳台与墙面凹凸）
  const low = litWins.filter(w => w.Fr === F && w.y < podiumTop + 3 * fh);
  const mid = litWins.filter(w => w.Fr === F && w.y >= podiumTop + 3 * fh && w.y < podiumTop + 9 * fh);
  for (let i = 0; i < nL; i++) {
    const pool = !spec.lightsLow && i % 2 === 1 && mid.length ? mid : low;
    const w = pool.length ? pool.splice(rng.int(0, pool.length - 1), 1)[0] : null;
    const pos = w ? F.P(w.u, w.y, w.o + 1.4) : P(rng.range(1, faceLen - 1), podiumTop + rng.range(1, Math.min(10, Hb - 1)), 1.5);
    ctx.lights.add({ position: pos, color: w ? w.tone : rng.pick([WINDOW.warm, WINDOW.fluor]), intensity: 0.7, radius: 8 });
  }

  if (!builder) B.flush(ctx.staticRoot, 'tower-' + spec.id);

  return { id: spec.id, face, ry, normal: n, tangent: t, origin, length: faceLen, ground: spec.ground,
    podiumTop, top, floors, bays, floorH: fh, bayW: bw, frontPlane: fp, point: P,
    // 新增字段（可选使用）
    podiumHoles: spec.podiumHoles || [],   // 基座挖空（可进入店铺）
    fixtures,                 // 立面挑出物 [{u0,u1,y0,y1,out}]：竖招牌可据此避让
    outAt,                    // outAt(y) → 该高度楼面相对 frontPlane 的外挑量（悬挑层 > 0）
    roofTop,                  // 屋面（女儿墙内地面）高度
    cutA: ua, cutB: faceLen - ub,
  };
}

// ------------------------------------------------------------------ 屋顶：女儿墙 + 加建 + 杂物
function roof(ctx, o) {
  const { B, F, M, rng, spec, old, ua, ub, uc, uw, depth, top, ovT, stilt, cap } = o;
  let lightLeft = spec.roofLight === true ? Infinity : (+spec.roofLight || 0);   // 屋顶光场配额
  const y = top;
  const d = depth + ovT;
  // 屋面板 + 女儿墙（偶有缺口）
  F.box(M.trimDk, uc, y - 0.05, (ovT - depth) / 2, uw + 0.08, 0.2, d + 0.08);
  const ph = old ? rng.range(0.6, 1.1) : 1.1, pt = 0.2;
  const parapet = (u0, u1, oo, alongU) => {
    if (alongU) {
      let u = u0;
      while (u < u1 - 0.1) {
        const seg = old && rng() < 0.25 ? rng.range(0.6, 1.5) : u1 - u;
        const e = Math.min(u1, u + seg);
        F.box(M.wall, (u + e) / 2, y + 0.15, oo, e - u, ph, pt);
        F.box(M.trim, (u + e) / 2, y + 0.15 + ph, oo, e - u + 0.05, 0.06, pt + 0.06);
        u = e + (e < u1 && old ? rng.range(0.6, 1.4) : 0);
      }
    }
  };
  if (!stilt) parapet(ua, ub, ovT - pt / 2, true);
  parapet(ua, ub, -depth + pt / 2, true);
  F.box(M.wall, ua + pt / 2, y + 0.15, (ovT - depth) / 2, pt, ph, d);
  F.box(M.wall, ub - pt / 2, y + 0.15, (ovT - depth) / 2, pt, ph, d);
  const ry0 = y + 0.15;

  // 屋顶可用矩形（u,o），记录占用
  const occ = [];
  const uOK = (u) => {
    if (spec.reserveZ === undefined) return true;
    return F.P(u, 0, 0).z <= spec.reserveZ;
  };
  // front: true = 贴正面边缘；'near' = 正面一半（spec.roofFront 时屋顶杂物默认偏向临街一侧，好让天际线碎起来）
  const place = (w, dd, tries = 12, front = spec.roofFront ? 'near' : false) => {
    for (let i = 0; i < tries; i++) {
      const u = rng.range(ua + 0.4 + w / 2, ub - 0.4 - w / 2);
      const oMin = front === 'near' && i < tries - 3 ? Math.max(-depth + 0.4, ovT - depth * 0.5) : -depth + 0.4;
      const oo = front === true ? ovT - 0.25 - dd / 2 : rng.range(oMin + dd / 2, ovT - 0.4 - dd / 2);
      if (!uOK(u - w / 2) || !uOK(u + w / 2)) continue;
      if (occ.some(r => Math.abs(r.u - u) < (r.w + w) / 2 + 0.3 && Math.abs(r.o - oo) < (r.d + dd) / 2 + 0.3)) continue;
      occ.push({ u, o: oo, w, d: dd });
      return { u, o: oo };
    }
    return null;
  };
  const roofLight = (Fr, u, yy, oo) => {
    Fr.box(M.bulb, u, yy, oo + 0.08, 0.1, 0.14, 0.1);
    if (lightLeft > 0) {
      lightLeft--;
      const p = Fr.P(u, yy, oo + 0.5);
      ctx.lights.add({ position: p, color: WINDOW.warm, intensity: 0.9, radius: 7 });
      ctx.halos.add({ position: Fr.P(u, yy + 0.07, oo + 0.15), color: WINDOW.warm, size: 1.6, intensity: 0.3 });
    }
  };

  if (spec.roofNeon) roofNeonSign(ctx, { B, F, M, rng, spec, ua, ub, depth, ovT, ry0, occ,
    okZ: (u) => spec.reserveZ === undefined || F.P(u, 0, 0).z <= spec.reserveZ });

  // 加建：贴着正面边缘的铁皮房 / 砖房，可能外挑；可能再叠一层小棚
  if (old && rng() < 0.75) {
    const aw = Math.max(3, uw * rng.range(0.35, 0.75)), ad = Math.min(depth - 1, rng.range(3, 6));
    let ex = rng() < 0.5 ? rng.range(0.2, 0.7) : -rng.range(0, 1.2);
    if (ex > 0) ex = Math.min(ex, Math.max(0, cap - ovT - 0.4));   // 雨棚还要再挑 0.4
    const p = place(aw, ad, 16, true);
    if (p) {
      const oo = p.o + 0.25 + ex, ah = rng.range(2.6, 3.1);
      const wm = rng.weighted([[M.second, 3], [M.brick, 2], [rng.pick(M.corr), 2], [M.plaster, 1]]);
      F.box(wm, p.u, ry0 - 0.15, oo, aw, ah + 0.15, ad);
      // 正面窗 + 门
      const nw = Math.max(1, Math.floor(aw / 2.4));
      for (let k = 0; k < nw; k++) {
        const u = p.u - aw / 2 + (k + 0.5) * aw / nw;
        glass(F, M, rng, u, ry0 + 0.9, Math.min(1.3, aw / nw - 0.5), 1.1, oo + ad / 2, rng() < 0.55);
        F.box(M.trim, u, ry0 + 0.82, oo + ad / 2 + 0.04, Math.min(1.3, aw / nw - 0.5) + 0.16, 0.08, 0.1);
      }
      if (ex > 0) {   // 外挑部分下面的斜撑
        for (const s of [-1, 1]) F.box(M.metalDk, p.u + s * (aw / 2 - 0.3), ry0 - 1.2, ovT - 0.04, 0.08, Math.hypot(1.2, ex) + 0.1, 0.08, Math.atan2(ex, 1.2));
      }
      // 彩钢瓦坡屋面（外挑 0.4）
      const corr = rng.pick(M.corr);
      F.box(corr, p.u, ry0 + ah + 0.15, oo, aw + 0.7, 0.05, ad + 0.8, rng.pick([-0.12, 0.12]));
      roofLight(F, p.u + aw / 2 - 0.5, ry0 + ah - 0.3, oo + ad / 2);
      F.box(M.tube, p.u - aw / 4, ry0 + ah - 0.2, oo + ad / 2 + 0.06, 1.0, 0.05, 0.05);   // 门头日光灯管
      // 二层小棚
      if (rng() < 0.4) {
        const sw = aw * rng.range(0.35, 0.6), sd = ad * rng.range(0.5, 0.8), sh = rng.range(2, 2.4), su = p.u + rng.range(-aw / 4, aw / 4);
        F.box(rng.pick(M.corr), su, ry0 + ah + 0.2, oo - (ad - sd) / 2, sw, sh, sd);
        F.box(rng.pick(M.corr), su, ry0 + ah + 0.2 + sh, oo - (ad - sd) / 2, sw + 0.5, 0.05, sd + 0.5, -0.15);
        if (rng() < 0.5) glass(F, M, rng, su, ry0 + ah + 1.0, 0.8, 0.7, oo - (ad - sd) / 2 + sd / 2, true);
      }
    }
  } else if (!old || rng() < 0.6) {   // 楼梯间出屋面
    const sw = rng.range(2.5, 4), sd = rng.range(2.5, 3.5), sh = rng.range(2.4, 3);
    const p = place(sw, sd);
    if (p) {
      F.box(old ? M.plaster : M.wall, p.u, ry0 - 0.15, p.o, sw, sh + 0.15, sd);
      F.box(M.trimDk, p.u, ry0 + sh, p.o, sw + 0.3, 0.15, sd + 0.3);
      glass(F, M, rng, p.u, ry0 + 1.2, 0.8, 0.7, p.o + sd / 2, rng() < 0.6);
    }
  }

  // 零星灯泡（不登记光场，只做远景亮点）
  if (old) for (let i = 0, nb = rng.int(1, 3); i < nb; i++) {
    const u = rng.range(ua + 0.5, ub - 0.5), oo = rng() < 0.5 ? ovT - 0.1 : -depth + 0.1;
    F.box(M.bulb, u, y + 0.15 + ph + 0.06, oo, 0.09, 0.12, 0.09);
  }
  // 水箱（圆罐 + 锈架）
  for (let i = 0, nt = rng.int(1, old ? 3 : 2); i < nt; i++) {
    const p = place(1.8, 1.8); if (!p) break;
    const pp = F.P(p.u, 0, p.o);
    B.box(M.rust, 1.4, 0.8, 1.4, pp.x, ry0, pp.z);
    B.cyl(rng() < 0.5 ? M.metal : M.plastic, 0.8, 1.6, pp.x, ry0 + 0.8, pp.z, 14);
  }
  if (!old) {
    for (let i = 0, na = rng.int(1, 3); i < na; i++) { const p = place(0.4, 0.4); if (p) F.box(M.metalDk, p.u, ry0, p.o, 0.06, rng.range(2, 5), 0.06); }
    return;
  }
  // 太阳能热水器（斜板 + 白色水筒）
  for (let i = 0, ns = rng.int(0, 2); i < ns; i++) {
    const p = place(2.2, 1.6); if (!p) break;
    F.box(M.metal, p.u, ry0, p.o, 2.0, 0.9, 0.06);
    F.box(M.solar, p.u, ry0 + 0.3, p.o + 0.2, 2.0, 0.04, 1.6, 0.7);
    F.cyl(M.heater, p.u + 1.0, ry0 + 1.3, p.o - 0.4, 0.18, 2.0, 10, 0, Math.PI / 2);
  }
  // 楼顶菜园：种植箱 + 泡沫箱 + 盆
  if (rng() < 0.6) {
    const p = place(rng.range(2.5, 4.5), rng.range(1.5, 3));
    if (p) {
      const r = occ[occ.length - 1];
      for (let k = 0, nk = rng.int(3, 8); k < nk; k++) {
        const u = p.u + rng.range(-r.w / 2 + 0.3, r.w / 2 - 0.3), oo = p.o + rng.range(-r.d / 2 + 0.3, r.d / 2 - 0.3);
        const kind = rng();
        if (kind < 0.4) { F.box(M.foam, u, ry0, oo, 0.55, 0.32, 0.4); F.box(M.green, u, ry0 + 0.32, oo, 0.5, rng.range(0.1, 0.4), 0.36); }
        else if (kind < 0.7) { F.box(M.soil, u, ry0, oo, 1.0, 0.35, 0.5); F.box(M.green, u, ry0 + 0.35, oo, 0.9, rng.range(0.15, 0.5), 0.45); }
        else F.cyl(M.green, u, ry0, oo, 0.25, rng.range(0.4, 1.0), 7);
      }
    }
  }
  // 晾衣架：两根立杆 + 横杆 + 衣服
  if (rng() < 0.6) {
    const lw = rng.range(2.5, 4.5);
    const p = place(lw, 0.8);
    if (p) {
      for (const s of [-1, 1]) F.box(M.metal, p.u + s * lw / 2, ry0, p.o, 0.05, 1.8, 0.05);
      F.box(M.metal, p.u, ry0 + 1.75, p.o, lw, 0.03, 0.03);
      for (let k = 0, nk = rng.int(3, 7); k < nk; k++) {
        const u = p.u + rng.range(-lw / 2 + 0.3, lw / 2 - 0.3);
        F.quad(rng.pick(M.laundry), u, ry0 + 1.35, p.o, rng.range(0.4, 0.8), rng.range(0.5, 0.9));
      }
    }
  }
  // 小铁皮棚 / 杂物堆
  for (let i = 0, nk = rng.int(0, 2); i < nk; i++) {
    const sw = rng.range(1.5, 2.8), sd = rng.range(1.2, 2.2), sh = rng.range(1.4, 2.2);
    const p = place(sw, sd); if (!p) break;
    const c = rng.pick(M.corr);
    F.box(c, p.u, ry0, p.o, sw, sh, sd);
    F.box(rng.pick(M.corr), p.u, ry0 + sh, p.o, sw + 0.4, 0.04, sd + 0.4, rng.pick([-0.1, 0.1]));
  }
  if (spec.roofRich) roofLife(ctx, { B, F, M, rng, spec, ua, ub, depth, ovT, ry0, ph, place, occ, rich: spec.roofRich,
    takeLight: () => (lightLeft > 0 ? (lightLeft--, true) : false) });
  // 天线 / 卫星锅 / 避雷针
  for (let i = 0, na = rng.int(1, 4); i < na; i++) {
    const p = place(0.4, 0.4); if (!p) break;
    const h = rng.range(1.5, 5);
    F.box(M.metalDk, p.u, ry0, p.o, 0.05, h, 0.05);
    if (rng() < 0.5) F.box(M.metalDk, p.u, ry0 + h * 0.8, p.o, rng.range(0.6, 1.2), 0.03, 0.03);
  }
  if (rng() < 0.4) { const p = place(1, 1); if (p) F.cyl(M.metal, p.u, ry0 + 1.0, p.o, 0.45, 0.06, 12, 0.9, 0); }
}

// 屋顶用的独立玻璃函数（不进 litWins）
function glass(F, M, rng, u, yb, w, h, o0, isLit) {
  const cell = isLit ? rng.int(0, 15) : 16 + rng.int(0, 15);
  F.quad(isLit ? M.glassLit : M.glassDark, u, yb + h / 2, o0 + 0.015, w, h, atlasUV(new THREE.PlaneGeometry(1, 1), cell));
}

// ------------------------------------------------------------------ 屋顶小霓虹（最先占位；转向坡顶主机位，背后铁架；只发光不登记光场，给一个光晕）
function roofNeonSign(ctx, o) {
  const { B, F, M, rng, spec, ua, ub, depth, ovT, ry0, occ, okZ } = o;
  const { text, color, color2 } = spec.roofNeon;
  const size = 0.75;
  // 候选位置按"在坡顶主机位画面里看得见"打分：在画框内（FOV 62°）> 不落在阶梯口牌坊横梁那条仰角带 > 近
  const cam = ctx.L.CAMS.hero;
  const score = (q, yBot, yTop) => {
    const dx = q.x - cam[0], dz = q.z - cam[2], dist = Math.hypot(dx, dz);
    const bear = Math.abs(Math.atan2(dx, -dz));
    const eB = Math.atan2(yBot - cam[1], dist), eT = Math.atan2(yTop - cam[1], dist);
    // 透视投影：屏幕 x ∝ tan(bear)，y ∝ tan(仰角 - pitch)/cos(bear)；tan(31°)=0.6，16:9 → 横向 1.067（留边）
    const inFrame = dz < 0 && Math.tan(bear) < 0.95 && Math.tan(eT - cam[4]) / Math.cos(bear) < 0.52;
    const arch = bear < 0.5 && eT > 0.15 && eB < 0.205;     // 牌坊横梁约占仰角 0.16–0.2（z=-26, y≈44.8–45.5）
    return (inFrame ? 0 : 100) + (arch ? 50 : 0) + dist * 0.02 + bear;
  };
  let best = null;
  for (let tries = 0; tries < 32; tries++) {
    const u = rng.range(ua + 1.5, ub - 1.5), oo = tries < 16 ? ovT - rng.range(1.2, 3) : rng.range(-depth + 1.5, ovT - 1.5);
    if (!okZ(u)) continue;
    if (occ.some(r => Math.abs(r.u - u) < r.w / 2 + 1.8 && Math.abs(r.o - oo) < r.d / 2 + 0.6)) continue;
    for (const rack of [2.8, 5.0, 6.5]) {           // 普通支架 / 高广告架（越过横梁）
      const sc = score(F.P(u, 0, oo), ry0 + rack - 1.25, ry0 + rack) + (rack > 3 ? 0.15 * rack : 0);
      if (!best || sc < best.sc) best = { u, oo, sc, rack };
    }
  }
  if (best) {
    const { u, oo } = best;
    const p = F.P(u, 0, oo);
    const yTop = ry0 + best.rack + rng.range(0, 0.3);
    const fy = Math.atan2(cam[0] - p.x, cam[2] - p.z);
    const s = ctx.make.neonSign({ text, pos: [p.x, yTop, p.z], ry: fy, color, color2, size, intensity: 2.2,
      style: rng() < 0.4 ? 'box' : 'tube', light: false, halo: true });
    for (const dx of [-s.width / 2 + 0.3, s.width / 2 - 0.3]) {
      B.box(M.rust, 0.1, yTop - ry0, 0.1, p.x + Math.cos(fy) * dx - Math.sin(fy) * 0.15, ry0, p.z - Math.sin(fy) * dx - Math.cos(fy) * 0.15);
    }
    occ.push({ u, o: oo, w: s.width, d: 1 });
  }
}

// ------------------------------------------------------------------ 屋顶生活：伞、灯泡串、葡萄架、鸽笼、蓝篷布、小霓虹
// 从坡顶（hero）看，近处楼顶就在视线高度：这些东西是天际线上的"碎轮廓"和零星暖光。
function roofLife(ctx, o) {
  const { B, F, M, rng, spec, ua, ub, depth, ovT, ry0, ph, place, occ, rich, takeLight } = o;
  const n = (k) => Math.floor(k * rich + rng());           // 按倍率取件数（带随机取整）
  const roofZ = (u, oo) => F.P(u, 0, oo).z;
  const okZ = (u) => spec.reserveZ === undefined || roofZ(u, 0) <= spec.reserveZ;

  // 加建棚屋：铁皮 / 砖砌小屋，高低不一，多数门窗亮着（从坡顶看是屋顶上的"第二层天际线"）
  for (let i = 0, ns = n(1.4); i < ns; i++) {
    const w = rng.range(2.2, 4.2), d = rng.range(2, 3.6), h = rng.range(2.1, 2.9);
    const p = place(w, d, 14); if (!p) break;
    const wm = rng.weighted([[rng.pick(M.corr), 3], [M.brick, 1.5], [M.second, 1.5], [M.plaster, 1]]);
    F.box(wm, p.u, ry0 - 0.15, p.o, w, h + 0.15, d);
    F.box(rng.pick(M.corr), p.u, ry0 + h, p.o, w + 0.5, 0.05, d + 0.5, rng.pick([-0.14, 0.14]), rng.range(-0.05, 0.05));
    // 朝外（立面方向）开一扇窗；朝 u 两端之一开门
    const lit = rng() < 0.7;
    glass(F, M, rng, p.u + rng.range(-w / 4, w / 4), ry0 + 0.95, Math.min(1.1, w - 0.8), 0.9, p.o + d / 2, lit);
    if (lit && rng() < 0.5) F.box(M.tube, p.u, ry0 + h - 0.25, p.o + d / 2 + 0.05, 0.9, 0.05, 0.05);
    if (rng() < 0.5) F.box(M.ac, p.u + rng.range(-w / 3, w / 3), ry0 + h + 0.1, p.o, 0.82, 0.56, 0.34);
  }
  // 额外水箱（不锈钢 / 蓝塑料）
  for (let i = 0, nt = n(0.8); i < nt; i++) {
    const r = rng.range(0.5, 0.8), p = place(r * 2.2, r * 2.2); if (!p) break;
    const hh = rng.range(0.3, 1.0);
    F.box(M.rust, p.u, ry0, p.o, r * 1.8, hh, r * 1.8);
    F.cyl(rng() < 0.5 ? M.metal : M.plastic, p.u, ry0 + hh, p.o, r, rng.range(1.2, 2), 12);
  }

  // 撑开的伞 + 塑料桌凳（屋顶夜宵 / 打牌）
  for (let i = 0, nu = n(1.1); i < nu; i++) {
    const r = rng.range(0.9, 1.35);
    const p = place(r * 2, r * 2); if (!p) break;
    const um = rng.pick(M.umbrella);
    const h = rng.range(2.0, 2.4);
    F.box(M.metal, p.u, ry0, p.o, 0.04, h, 0.04);
    F.B.cone(um, r, rng.range(0.35, 0.5), ...F.P(p.u, ry0 + h - 0.3, p.o).toArray(), 8, rng.range(0, 1));
    F.box(M.plastic, p.u, ry0 + 0.68, p.o, 0.8, 0.04, 0.8);                 // 桌面
    F.box(M.plastic, p.u, ry0, p.o, 0.08, 0.68, 0.08);
    for (let k = 0, ns = rng.int(1, 4); k < ns; k++) {                      // 塑料凳
      const a = rng.range(0, Math.PI * 2), d = rng.range(0.6, 0.85);
      F.box(rng() < 0.6 ? M.meat : M.plastic, p.u + Math.cos(a) * d, ry0, p.o + Math.sin(a) * d, 0.32, 0.45, 0.32);
    }
  }

  // 灯泡串：两根竹竿 / 铁杆之间的悬链，挂一串小灯泡（不登记光场，配额允许时给一盏 + 光晕）
  const bulbString = (front, minLen = 2.5) => {
    const u0 = rng.range(ua + 0.3, ub - 0.3), u1 = rng.range(ua + 0.3, ub - 0.3);
    if (Math.abs(u1 - u0) < minLen || !okZ(u0) || !okZ(u1)) return false;
    const o0 = front ? ovT - 0.15 : rng.range(-depth + 0.3, ovT - 0.3);
    const o1 = front ? ovT - 0.15 - rng.range(0, 3) : rng.range(-depth + 0.3, ovT - 0.3);
    const h0 = rng.range(2.2, 3.2), h1 = rng.range(2.2, 3.2);
    const A = F.P(u0, ry0 + h0, o0), C = F.P(u1, ry0 + h1, o1);
    F.box(M.metalDk, u0, ry0, o0, 0.05, h0, 0.05);
    F.box(M.metalDk, u1, ry0, o1, 0.05, h1, 0.05);
    const L = A.distanceTo(C), sag = L * rng.range(0.08, 0.14);
    const N = Math.max(3, Math.round(L / 0.55));
    const bm = rng() < 0.6 ? [M.bulbs[0]] : M.bulbs;
    const prev = A.clone(), pt = new THREE.Vector3();
    for (let k = 1; k <= N; k++) {
      const s = k / N;
      pt.lerpVectors(A, C, s); pt.y -= sag * 4 * s * (1 - s);
      B.seg(M.metalDk, prev, pt, 0.02);
      if (k < N) B.box(rng.pick(bm), 0.07, 0.1, 0.07, pt.x, pt.y - 0.12, pt.z);
      prev.copy(pt);
    }
    const mid = new THREE.Vector3().lerpVectors(A, C, 0.5); mid.y -= sag + 0.1;
    if (front || rng() < 0.4) ctx.halos.add({ position: mid, color: WINDOW.warm, size: Math.min(4, L * 0.6), intensity: 0.22 });
    if (takeLight()) ctx.lights.add({ position: mid.clone().setY(mid.y - 0.6), color: WINDOW.warm, intensity: 0.8, radius: 6 });
    return true;
  };
  for (let i = 0; i < (spec.roofStrings || 0); i++) {
    for (let k = 0; k < 8 && !bulbString(true, 5); k++);       // 沿临街前沿的长灯串（重试到成功）
  }
  for (let i = 0, nb = n(1.0); i < nb; i++) bulbString(rng() < 0.7);

  // 葡萄架 / 丝瓜棚：四根立柱 + 网格顶 + 一层绿
  if (rng() < 0.45 * rich) {
    const w = rng.range(2.5, 4), d = rng.range(2, 3), h = rng.range(2.1, 2.5);
    const p = place(w, d);
    if (p) {
      for (const su of [-1, 1]) for (const so of [-1, 1]) F.box(M.woodDk, p.u + su * (w / 2 - 0.05), ry0, p.o + so * (d / 2 - 0.05), 0.08, h, 0.08);
      F.box(M.grille, p.u, ry0 + h, p.o, w, 0.04, d);
      for (let k = 0, nk = rng.int(4, 8); k < nk; k++) {
        const gw = rng.range(0.6, 1.4), gd = rng.range(0.5, 1.2);
        F.box(M.green, p.u + rng.range(-w / 2 + gw / 2, w / 2 - gw / 2), ry0 + h - rng.range(0, 0.15), p.o + rng.range(-d / 2 + gd / 2, d / 2 - gd / 2), gw, rng.range(0.15, 0.35), gd);
      }
      for (let k = 0; k < 3; k++) F.box(M.foam, p.u + rng.range(-w / 2, w / 2), ry0, p.o + rng.range(-d / 2, d / 2), 0.5, 0.3, 0.4);
    }
  }

  // 鸽笼：铁丝网箱 + 木架
  if (rng() < 0.3 * rich) {
    const w = rng.range(1.6, 2.6), d = rng.range(1, 1.5), h = rng.range(1.2, 1.8);
    const p = place(w, d);
    if (p) {
      F.box(M.woodDk, p.u, ry0, p.o, w, 0.5, d);
      F.box(M.grille, p.u, ry0 + 0.5, p.o, w, h, d);
      F.box(rng.pick(M.corr), p.u, ry0 + 0.5 + h, p.o, w + 0.3, 0.04, d + 0.3, 0.12);
    }
  }

  // 蓝篷布盖着的杂物堆
  for (let i = 0, nt = n(0.8); i < nt; i++) {
    const w = rng.range(1.2, 2.4), d = rng.range(1, 1.8);
    const p = place(w, d); if (!p) break;
    F.box(rng() < 0.7 ? M.tarp : rng.pick(M.umbrella), p.u, ry0, p.o, w, rng.range(0.6, 1.1), d, rng.range(-0.05, 0.05), rng.range(-0.06, 0.06));
    F.box(M.woodDk, p.u + rng.range(-0.3, 0.3), ry0, p.o + d / 2 + 0.2, 0.8, 0.12, 0.6);
  }

  // 女儿墙上的盆栽一排（沿临街前沿）
  if (rng() < 0.6 * rich) {
    for (let u = ua + 0.4; u < ub - 0.4; u += rng.range(0.4, 1.2)) {
      if (rng() < 0.35) continue;
      const hh = rng.range(0.15, 0.55);
      F.box(rng() < 0.5 ? M.foam : M.rust, u, ry0 + ph, ovT - 0.1, 0.3, 0.2, 0.2);
      F.box(M.green, u, ry0 + ph + 0.2, ovT - 0.1, rng.range(0.25, 0.5), hh, 0.25);
    }
  }

}
