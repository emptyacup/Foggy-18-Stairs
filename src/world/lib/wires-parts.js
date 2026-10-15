// wires 模块的零件库：电线杆（横担 + 瓷瓶 + 变压器 + 盘线）、墙面瓷瓶支架、电表箱、衣物剪影、灯泡。
// 只产出静态 Mesh（放 staticRoot，构建后合批）；电线本身统一交给 ctx.wires。
import * as THREE from 'three';
import { BASE } from '../../core/palette.js';

const Y = new THREE.Vector3(0, 1, 0);

export function makeParts(ctx) {
  const { mat, L } = ctx;
  const root = ctx.staticRoot;

  // 与 core/wires.js 同参数 → 命中同一缓存材质，盘线与电线合进同一个 draw call
  const M = {
    cable: mat.std({ color: 0x15161a, roughness: 0.35, wet: 0 }),
    pole: mat.surface('concrete'),
    poleDk: mat.surface('concreteDk'),
    steel: mat.surface('metalDk', { wet: 0.8 }),
    rust: mat.surface('rust'),
    porcelain: mat.std({ color: BASE.tileWhite, roughness: 0.25, wet: 0.6 }),
    box: mat.surface('metal', { wet: 0.7 }),
    boxPale: mat.std({ color: BASE.concrete, roughness: 0.6, wet: 0.7 }),
    boxDk: mat.surface('grime'),
    bamboo: mat.std({ color: BASE.plaster, roughness: 0.55, wet: 0.8 }),
  };
  const CLOTH = [BASE.tarpRed, BASE.plastic, BASE.tilePink, BASE.tileGreen, BASE.plaster, BASE.green, BASE.brick,
    BASE.concrete, BASE.tileWhite, BASE.grime]
    .map(c => mat.std({ color: c, roughness: 0.9, side: THREE.DoubleSide, wet: 0.35 }));

  const G = {
    knob: new THREE.CylinderGeometry(0.028, 0.036, 0.08, 6).translate(0, 0.04, 0),
    bush: new THREE.CylinderGeometry(0.03, 0.045, 0.2, 6).translate(0, 0.1, 0),
    bulb: new THREE.IcosahedronGeometry(0.05, 0),
    socket: new THREE.CylinderGeometry(0.022, 0.022, 0.05, 5).translate(0, -0.025, 0),
    tank: new THREE.CylinderGeometry(0.3, 0.3, 1.05, 10).translate(0, 0.525, 0),
    cap: new THREE.CylinderGeometry(0.33, 0.33, 0.07, 10).translate(0, 0.035, 0),
    rod: new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0),    // 单位细杆，按 scale 拉伸
    cloth: clothGeos(),
  };

  const add = (geo, m, pos, { ry = 0, rx = 0, rz = 0, s } = {}) => {
    const o = new THREE.Mesh(geo, m);
    o.position.copy(pos);
    o.rotation.set(rx, ry, rz, 'YXZ');
    if (s) o.scale.set(...s);
    root.add(o);
    return o;
  };
  const box = (w, h, d, m, pos, ry = 0) => ctx.make.block(w, h, d, m, { x: pos.x, y: pos.y, z: pos.z, ry });

  // 从 a 到 b 的细杆（圆柱，半径 r）
  const rod = (a, b, r, m) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const o = new THREE.Mesh(G.rod, m);
    o.position.copy(a);
    o.quaternion.setFromUnitVectors(Y, d.normalize());
    o.scale.set(r, len, r);
    root.add(o);
    return o;
  };

  // 盘线：几圈随意挂着的黑电缆
  const coil = (pos, rng, n = 3) => {
    for (let i = 0; i < n; i++) {
      const R = rng.range(0.18, 0.38);
      const g = new THREE.TorusGeometry(R, rng.range(0.012, 0.022), 4, 16);
      const p = pos.clone().add(new THREE.Vector3(rng.range(-0.08, 0.08), -R + rng.range(-0.1, 0.05), rng.range(-0.08, 0.08)));
      add(g, M.cable, p, { ry: rng.range(0, Math.PI), rx: rng.range(-0.35, 0.35), rz: rng.range(-0.3, 0.3) });
    }
  };

  // 墙面瓷瓶支架：从立面伸出一根角铁，端头若干瓷瓶。返回瓷瓶顶点（电线落点）
  const wallBracket = (f, u, y, out, n = 3) => {
    const c = f.point(u, y - 0.03, out / 2);
    box(0.04, 0.04, out, M.steel, c, f.ry);
    const tops = [];
    const span = 0.12 * (n - 1);
    const bar = f.point(u, y, out);
    box(span + 0.1, 0.035, 0.04, M.steel, bar.clone().setY(y - 0.035), f.ry);
    for (let i = 0; i < n; i++) {
      const p = f.point(u - span / 2 + i * 0.12, y, out);
      add(G.knob, M.porcelain, p);
      tops.push(p.clone().setY(y + 0.07));
    }
    return tops;
  };

  // 电表箱阵列（立面上），返回箱子上沿中心（线束汇入点）
  const meterCluster = (f, u, y, rng) => {
    const cols = rng.int(2, 3), rows = rng.int(1, 2);
    const w = 0.34, h = 0.44, gap = 0.05;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = f.point(u + (c - (cols - 1) / 2) * (w + gap), y + r * (h + gap), 0.09);
        const m = rng.chance(0.3) ? M.boxPale : rng.chance(0.5) ? M.box : M.boxDk;
        box(w, h, 0.18, m, p, f.ry);
        // 观察窗
        const win = f.point(u + (c - (cols - 1) / 2) * (w + gap), y + r * (h + gap) + h * 0.55, 0.185);
        box(w * 0.5, h * 0.22, 0.012, M.cable, win, f.ry);
      }
    }
    // 底部线槽
    box(cols * (w + gap) + 0.1, 0.08, 0.1, M.steel, f.point(u, y - 0.12, 0.06), f.ry);
    return f.point(u, y + rows * (h + gap), 0.12);
  };

  // 水泥电线杆。side = 朝梯坎中线的方向（+1 / -1，沿 X）。返回横担瓷瓶顶点
  const pole = (x, z, H, side, rng) => {
    const base = L.stairHeightAt(z);
    const shaft = new THREE.CylinderGeometry(0.11, 0.17, H, 8).translate(0, H / 2, 0);
    add(shaft, M.pole, new THREE.Vector3(x, base - 0.2, z));
    box(0.42, 0.5, 0.42, M.poleDk, new THREE.Vector3(x, base - 0.1, z));
    ctx.physics.addBox(x - 0.2, z - 0.2, x + 0.2, z + 0.2, base + H, base - 0.2);
    // 污渍箍 / 编号牌
    box(0.26, 0.32, 0.03, M.boxPale, new THREE.Vector3(x + side * 0.15, base + 2.3, z), Math.PI / 2);

    const tops = [];
    const top = base + H - 0.2;
    const arms = [[top - 0.25, 2.4, [-1.1, -0.6, 0.6, 1.1]], [top - 1.15, 2.0, [-0.9, -0.35, 0.35, 0.9]]];
    for (const [ay, len, ks] of arms) {
      box(0.1, 0.1, len, M.steel, new THREE.Vector3(x, ay - 0.1, z));
      // 斜撑
      for (const s of [-1, 1]) rod(new THREE.Vector3(x, ay - 0.65, z), new THREE.Vector3(x, ay - 0.08, z + s * 0.55), 0.02, M.steel);
      for (const k of ks) {
        const p = new THREE.Vector3(x, ay, z + k);
        add(G.knob, M.porcelain, p);
        tops.push(p.clone().setY(ay + 0.07));
      }
    }
    // 变压器（挂在朝梯坎一侧）
    const ty = top - 3.3;
    const tp = new THREE.Vector3(x + side * 0.5, ty, z);
    for (const dy of [0.2, 0.85]) box(0.6, 0.08, 0.08, M.steel, new THREE.Vector3(x + side * 0.28, ty + dy, z));
    box(0.7, 0.08, 0.7, M.steel, new THREE.Vector3(x + side * 0.5, ty - 0.08, z));
    add(G.tank, M.box, tp);
    add(G.cap, M.steel, tp.clone().setY(ty + 1.05));
    // 散热片
    for (const s of [-1, 1]) box(0.05, 0.75, 0.42, M.steel, new THREE.Vector3(x + side * 0.5, ty + 0.15, z + s * 0.32));
    const bush = [];
    for (const k of [-0.16, 0, 0.16]) {
      const p = new THREE.Vector3(x + side * 0.5, ty + 1.1, z + k);
      add(G.bush, M.porcelain, p);
      bush.push(p.clone().setY(ty + 1.3));
    }
    // 跌落保险（横担下方的小瓷件）
    for (const k of [-0.5, 0, 0.5]) add(G.bush, M.porcelain, new THREE.Vector3(x + side * 0.12, top - 2.1, z + k), { rz: side * 0.4 });
    box(0.1, 0.06, 1.3, M.steel, new THREE.Vector3(x + side * 0.08, top - 2.18, z));
    // 杆上配电箱 + 盘线
    box(0.42, 0.6, 0.24, M.boxPale, new THREE.Vector3(x + side * 0.24, base + 2.7, z), Math.PI / 2);
    coil(new THREE.Vector3(x - side * 0.2, top - 4.6, z + 0.15), rng, rng.int(3, 5));
    coil(new THREE.Vector3(x + side * 0.2, base + 4.8, z - 0.1), rng, rng.int(2, 3));
    return { tops, bush, base, top, x, z, side, ty };
  };

  // 衣物：几何顶边在 y=0，向下垂；平面 XY，法线 +Z
  const cloth = (kind, pos, ry, rng, scale = 1) => {
    const g = G.cloth[kind];
    const m = rng.pick(CLOTH);
    return add(g, m, pos, { ry: ry + rng.range(-0.12, 0.12), rx: rng.range(-0.18, 0.18), rz: rng.range(-0.06, 0.06),
      s: [scale * rng.range(0.85, 1.15), scale * rng.range(0.9, 1.1), 1] });
  };

  return { M, G, add, box, rod, coil, wallBracket, meterCluster, pole, cloth, CLOTH };
}

// 几种衣物剪影（比纯方片更像"衣服"）
function clothGeos() {
  const shape = pts => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  return {
    shirt: shape([[-0.2, 0], [-0.07, 0], [0, -0.06], [0.07, 0], [0.2, 0], [0.36, -0.1], [0.3, -0.24], [0.2, -0.17],
      [0.2, -0.62], [-0.2, -0.62], [-0.2, -0.17], [-0.3, -0.24], [-0.36, -0.1]]),
    pants: shape([[-0.2, 0], [0.2, 0], [0.23, -0.86], [0.05, -0.86], [0, -0.24], [-0.05, -0.86], [-0.23, -0.86]]),
    towel: shape([[-0.24, 0], [0.24, 0], [0.24, -0.55], [-0.24, -0.55]]),
    sheet: shape([[-0.55, 0], [0.55, 0], [0.57, -1.05], [0.1, -1.12], [-0.56, -1.0]]),
    small: shape([[-0.1, 0], [0.1, 0], [0.09, -0.24], [-0.09, -0.22]]),
    dress: shape([[-0.13, 0], [0.13, 0], [0.18, -0.25], [0.3, -0.85], [-0.3, -0.85], [-0.18, -0.25]]),
  };
}

