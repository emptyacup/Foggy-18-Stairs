// props/models —— 各类街面道具的零件定义（局部坐标：原点 = 底面中心，+Z = 正面/车头）
import * as THREE from 'three';
import { BASE, NEON, WINDOW } from '../../core/palette.js';
import { box, cyl, sphere, blob, rod, profile, sheet, fan, xf } from './kit.js';

// 材质表（全部走 ctx.mat）
export function makeMaterials(ctx, kit) {
  const { mat } = ctx;
  const T = (o) => kit.tintable(mat.std({ color: 0xffffff, ...o }));
  return {
    // 可着色
    plastic: T({ roughness: 0.42 }),                                   // 塑料凳、车壳、垃圾桶
    plasticDS: T({ roughness: 0.5, side: THREE.DoubleSide }),          // 伞面、雨披
    crate: T({ roughness: 0.5, map: ctx.tex.grille({ bars: 9, rails: 3, thick: 7 }), alphaTest: 0.5, side: THREE.DoubleSide }),
    cloth: T({ roughness: 0.9, side: THREE.DoubleSide }),              // 挡风被
    leaf: T({ roughness: 0.6, side: THREE.DoubleSide }),
    // 固定色
    white: mat.std({ color: BASE.tileWhite, roughness: 0.5, side: THREE.DoubleSide }),
    rubber: mat.std({ color: 0x0d0d10, roughness: 0.55 }),
    seat: mat.std({ color: 0x111114, roughness: 0.3 }),
    metal: ctx.mat.surface('metal'),
    metalDk: ctx.mat.surface('metalDk'),
    rust: ctx.mat.surface('rust'),
    chrome: mat.std({ color: 0x9aa0a8, roughness: 0.2, metalness: 0.9 }),
    copper: mat.std({ color: 0x8a5230, roughness: 0.3, metalness: 0.8 }),
    soup: mat.std({ color: 0x4a0c06, roughness: 0.12, emissive: NEON.hotpot, emissiveIntensity: 0.22, wet: 0 }),
    broth: mat.std({ color: 0x8a8270, roughness: 0.15, wet: 0 }),
    ceramic: mat.std({ color: 0xa8acb0, roughness: 0.3 }),
    bottle: mat.std({ color: 0x173a20, roughness: 0.08, metalness: 0.1 }),
    tableTop: mat.std({ color: 0x5a4632, roughness: 0.45 }),
    wood: ctx.mat.surface('wood'),
    foam: mat.std({ map: boxTex(ctx, 'foam'), color: 0xffffff, roughness: 0.9 }),
    card: mat.std({ map: boxTex(ctx, 'card'), color: 0xffffff, roughness: 0.95 }),
    tape: mat.std({ color: 0x6a5a40, roughness: 0.4 }),
    terracotta: mat.std({ color: 0x5a3026, roughness: 0.9 }),
    soil: mat.std({ color: 0x1e1814, roughness: 1 }),
    green: mat.std({ color: BASE.green, roughness: 0.65, flat: true }),
    greenLt: mat.std({ color: 0x3e5a2c, roughness: 0.6, flat: true }),
    scallion: mat.std({ color: 0x3a5e2a, roughness: 0.55 }),
    bloom: mat.std({ color: 0x8a1f5a, roughness: 0.7, flat: true }),  // 三角梅
    bamboo: mat.std({ color: 0x6a6438, roughness: 0.6 }),
    rope: mat.std({ color: 0x6e6040, roughness: 0.95 }),
    glassDk: ctx.mat.surface('glass'),
    concrete: ctx.mat.surface('concreteDk'),
    tailOff: mat.std({ color: 0x3a0808, roughness: 0.2 }),
    tailOn: mat.neon(NEON.hotpot, 4),
    lamp: mat.neon(0xffd2a0, 0.9),
    bulb: mat.neon(WINDOW.warm, 6),
    cord: mat.std({ color: 0x0a0a0a, roughness: 0.6 }),
    broom: mat.std({ color: 0x6a5a34, roughness: 1 }),
    led: mat.neon(NEON.cyan, 2.2),
    foliage: mat.std({ map: foliageTex(ctx, 'leaf'), color: 0xffffff, roughness: 0.55, alphaTest: 0.5, side: THREE.DoubleSide }),
    bougain: mat.std({ map: foliageTex(ctx, 'bougain'), color: 0xffffff, roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide }),
    vine: mat.std({ map: foliageTex(ctx, 'vine'), color: 0xffffff, roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide }),
  };
}

// 叶簇：n 片交叉的 alpha 叶片卡（中心 (x,y,z)，尺寸 s）
function cluster(x, y, z, s, n, m, seed = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(s, s * 0.9);
    const ry = (i / n) * Math.PI + seed * 0.7, rx = ((i + seed) % 3 - 1) * 0.35;
    out.push({ g: xf(g, { x: x + Math.sin(i * 2.1 + seed) * s * 0.08, y: y + Math.cos(i * 1.7) * s * 0.06, z: z + Math.cos(i * 2.9 + seed) * s * 0.08, ry, rx }), m });
  }
  // 一片近水平的，遮住顶部
  out.push({ g: xf(new THREE.PlaneGeometry(s * 0.85, s * 0.85), { x, y: y + s * 0.18, z, rx: -Math.PI / 2 + 0.25, ry: seed }), m });
  return out;
}

// 纸箱 / 泡沫箱贴图：印刷块、胶带、底部被雨水洇湿的深色
function boxTex(ctx, kind) {
  const c = ctx.tex.canvas(128, 128), g = c.getContext('2d');
  const r = ctx.rng('boxtex-' + kind);
  const card = kind === 'card';
  g.fillStyle = card ? '#5e4a32' : '#8a8c8e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r.range(0.02, 0.06)})`;
    g.fillRect(r.range(0, 128), r.range(0, 128), r.range(2, 10), r.range(2, 10));
  }
  if (card) {
    g.fillStyle = 'rgba(30,20,12,0.55)'; g.font = `900 22px ${'"Microsoft YaHei","SimHei",sans-serif'}`; g.textAlign = 'center';
    g.fillText(r.pick(['精品水果', '山城啤酒', '易碎', '鲜货']), 64, 58);
    g.strokeStyle = 'rgba(30,20,12,0.5)'; g.lineWidth = 3; g.strokeRect(22, 30, 84, 40);
    g.fillStyle = 'rgba(150,130,90,0.55)'; g.fillRect(54, 0, 20, 128);     // 胶带
  } else {
    g.fillStyle = 'rgba(140,30,30,0.6)'; g.font = `900 20px ${'"Microsoft YaHei","SimHei",sans-serif'}`; g.textAlign = 'center';
    g.fillText(r.pick(['鲜鱼', '冻品', '蔬菜']), 64, 60);
    g.fillStyle = 'rgba(40,40,40,0.25)'; g.fillRect(0, 0, 128, 6);
  }
  const wet = g.createLinearGradient(0, 70, 0, 128);
  wet.addColorStop(0, 'rgba(10,8,6,0)'); wet.addColorStop(1, 'rgba(10,8,6,0.55)');
  g.fillStyle = wet; g.fillRect(0, 70, 128, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 叶片 / 花帘贴图（透明底，配 alphaTest）
function foliageTex(ctx, kind) {
  const W = 128, Hh = kind === 'vine' ? 256 : 128;
  const c = ctx.tex.canvas(W, Hh), g = c.getContext('2d');
  const r = ctx.rng('foliage-' + kind);
  g.clearRect(0, 0, W, Hh);
  const greens = ['#2a4a2a', '#34552c', '#24402a', '#3e5e30', '#1e3622'];
  const pinks = ['#a0206a', '#8a1a5a', '#b8307a', '#7a1450'];
  const leaf = (x, y, len, ang, col) => {
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
    g.beginPath(); g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
    g.restore();
  };
  if (kind === 'vine') {
    for (let s = 0; s < 4; s++) {
      let x = 20 + s * 30 + r.range(-8, 8);
      for (let y = 4; y < Hh; y += r.range(5, 9)) {
        const t = y / Hh;
        if (r() < t * 0.75) continue;                 // 越往下越稀
        x += r.range(-3, 3);
        const flower = r() < 0.55 * (0.4 + t);
        leaf(x + r.range(-10, 10), y, r.range(5, 9) * (1 - t * 0.4), r.range(0, 6.28), flower ? r.pick(pinks) : r.pick(greens));
      }
    }
  } else {
    const n = kind === 'bougain' ? 70 : 85;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, 6.28), d = Math.pow(r(), 0.7) * 54;
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.9;
      const col = kind === 'bougain' && r() < 0.5 ? r.pick(pinks) : r.pick(greens);
      leaf(x, y, r.range(7, 13), a + r.range(-0.6, 0.6), col);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function defineModels(ctx, kit, M) {
  const D = (name, parts, o) => kit.define(name, parts, o);

  // ---------------------------------------------------------- 塑料凳（方凳：凳面 + 裙边 + 4 条外撇的腿）
  {
    const p = [];
    p.push({ g: box(0.30, 0.03, 0.30, { y: 0.42 }), m: M.plastic });
    p.push({ g: box(0.22, 0.012, 0.22, { y: 0.452 }), m: M.plastic });   // 凳面中间的凹槽沿
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      p.push({ g: box(sz ? 0.27 : 0.02, 0.06, sz ? 0.02 : 0.27, { x: sx * 0.135, y: 0.36, z: sz * 0.135 }), m: M.plastic });
    }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      p.push({ g: rod([sx * 0.12, 0.42, sz * 0.12], [sx * 0.165, 0, sz * 0.165], 0.018, 5), m: M.plastic });
    }
    // 腿间横撑
    p.push({ g: box(0.30, 0.02, 0.02, { y: 0.12, z: 0.155 }), m: M.plastic });
    p.push({ g: box(0.30, 0.02, 0.02, { y: 0.12, z: -0.155 }), m: M.plastic });
    D('stool', p, { tint: 0x8a1e1e });
  }

  // ---------------------------------------------------------- 火锅矮圆桌（桌面 + 腿 + 鸳鸯锅 + 碗碟 + 啤酒瓶）
  {
    const p = [];
    p.push({ g: cyl(0.43, 0.43, 0.03, 22, { y: 0.66 }), m: M.tableTop });
    p.push({ g: cyl(0.44, 0.44, 0.012, 22, { y: 0.655 }), m: M.metalDk });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.push({ g: rod([sx * 0.2, 0.66, sz * 0.2], [sx * 0.27, 0, sz * 0.27], 0.016, 5), m: M.metal });
    p.push({ g: rod([-0.24, 0.18, 0.24], [0.24, 0.18, -0.24], 0.01, 4), m: M.metal });
    p.push({ g: rod([-0.24, 0.18, -0.24], [0.24, 0.18, 0.24], 0.01, 4), m: M.metal });
    // 锅
    p.push({ g: cyl(0.2, 0.17, 0.12, 18, { y: 0.69 }), m: M.copper });
    p.push({ g: box(0.06, 0.025, 0.03, { x: 0.215, y: 0.78 }), m: M.copper });
    p.push({ g: box(0.06, 0.025, 0.03, { x: -0.215, y: 0.78 }), m: M.copper });
    p.push({ g: cyl(0.185, 0.185, 0.005, 18, { y: 0.8 }), m: M.soup });
    p.push({ g: cyl(0.075, 0.075, 0.008, 12, { y: 0.8 }), m: M.broth });
    // 碗、碟
    const dishes = [[0.3, 0.06], [-0.28, 0.14], [0.05, -0.31], [-0.12, 0.3], [0.24, -0.22]];
    dishes.forEach(([x, z], i) => {
      if (i % 2) p.push({ g: cyl(0.085, 0.07, 0.015, 10, { x, y: 0.69, z }), m: M.ceramic });
      else p.push({ g: cyl(0.06, 0.035, 0.045, 9, { x, y: 0.69, z }), m: M.ceramic });
    });
    // 啤酒瓶
    for (const [x, z] of [[0.18, 0.26], [0.27, 0.2], [-0.3, -0.12]]) {
      p.push({ g: cyl(0.032, 0.032, 0.17, 7, { x, y: 0.69, z }), m: M.bottle });
      p.push({ g: cyl(0.012, 0.03, 0.08, 6, { x, y: 0.86, z }), m: M.bottle });
    }
    // 桌下的空瓶
    p.push({ g: cyl(0.032, 0.032, 0.25, 7, { x: 0.1, y: 0.035, z: -0.1, rz: Math.PI / 2, ry: 0.6 }), m: M.bottle });
    D('table', p);
  }

  // ---------------------------------------------------------- 啤酒箱里的瓶子（放在筐里）
  {
    const p = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      if ((i * 3 + j) % 5 === 3) continue;
      const x = -0.19 + i * 0.125, z = -0.11 + j * 0.11;
      p.push({ g: cyl(0.032, 0.032, 0.2, 6, { x, y: 0.02, z }), m: M.bottle });
      p.push({ g: cyl(0.012, 0.03, 0.08, 5, { x, y: 0.22, z }), m: M.bottle });
    }
    D('bottles', p);
  }

  // ---------------------------------------------------------- 塑料筐（镂空侧板 + 实心边框）
  {
    const W = 0.56, H = 0.3, Dp = 0.4;
    const p = [];
    p.push({ g: box(W, 0.02, Dp, { y: 0.0 }), m: M.plastic });
    const q = (w, h) => new THREE.PlaneGeometry(w, h);
    p.push({ g: xf(q(W, H), { y: H / 2, z: Dp / 2 }), m: M.crate });
    p.push({ g: xf(q(W, H), { y: H / 2, z: -Dp / 2 }), m: M.crate });
    p.push({ g: xf(q(Dp, H), { x: W / 2, y: H / 2, ry: Math.PI / 2 }), m: M.crate });
    p.push({ g: xf(q(Dp, H), { x: -W / 2, y: H / 2, ry: Math.PI / 2 }), m: M.crate });
    p.push({ g: box(W + 0.03, 0.035, 0.03, { y: H - 0.035, z: Dp / 2 }), m: M.plastic });
    p.push({ g: box(W + 0.03, 0.035, 0.03, { y: H - 0.035, z: -Dp / 2 }), m: M.plastic });
    p.push({ g: box(0.03, 0.035, Dp, { x: W / 2, y: H - 0.035 }), m: M.plastic });
    p.push({ g: box(0.03, 0.035, Dp, { x: -W / 2, y: H - 0.035 }), m: M.plastic });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.push({ g: box(0.035, H, 0.035, { x: sx * W / 2, z: sz * Dp / 2 }), m: M.plastic });
    D('crate', p, { tint: 0x2a5a8a });
  }

  // ---------------------------------------------------------- 泡沫箱（+ 盖子）
  {
    D('foam', [
      { g: box(0.6, 0.28, 0.4), m: M.foam },
      { g: box(0.54, 0.01, 0.34, { y: 0.28 }), m: M.soil },
    ]);
    D('foamLid', [{ g: box(0.62, 0.035, 0.42), m: M.foam }]);
  }
  // 泡沫箱里种的葱 / 蒜苗
  {
    const p = [];
    let k = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const x = -0.22 + i * 0.11 + ((k * 37) % 7) * 0.004, z = -0.11 + j * 0.11;
      const h = 0.22 + ((k * 53) % 11) * 0.02;
      const lean = (((k * 29) % 9) - 4) * 0.05;
      p.push({ g: cyl(0.004, 0.012, h, 4, { x, y: 0.28, z, rz: lean, rx: lean * 0.6 }), m: M.scallion });
      p.push({ g: cyl(0.003, 0.009, h * 0.8, 4, { x: x + 0.02, y: 0.28, z: z + 0.015, rz: -lean * 1.4, rx: 0.15 }), m: M.scallion });
      k++;
    }
    D('scallion', p);
  }

  // ---------------------------------------------------------- 煤气罐
  {
    D('gas', [
      { g: cyl(0.16, 0.16, 0.48, 12, { y: 0.04 }), m: M.plastic },
      { g: sphere(0.16, 12, 6, { y: 0.52, sy: 0.55 }), m: M.plastic },
      { g: cyl(0.16, 0.14, 0.04, 12), m: M.metalDk },
      { g: cyl(0.1, 0.1, 0.1, 10, { y: 0.56 }, true), m: M.metalDk },
      { g: cyl(0.025, 0.025, 0.08, 6, { y: 0.6 }), m: M.copper },
    ], { tint: 0x3c5a7a });
  }

  // ---------------------------------------------------------- 垃圾桶（240L 带轮，盖子可微张）
  {
    const body = new THREE.CylinderGeometry(0.42, 0.36, 0.95, 4);
    body.rotateY(Math.PI / 4);                       // 先转成方截面，再非均匀缩放
    xf(body, { y: 0.05 + 0.475, sz: 1.15 });
    D('bin', [
      { g: body, m: M.plastic },
      { g: box(0.64, 0.05, 0.72, { y: 1.0, z: 0.02, rx: -0.05 }), m: M.plastic },
      { g: box(0.62, 0.04, 0.06, { y: 0.92, z: -0.36 }), m: M.plastic },
      { g: cyl(0.1, 0.1, 0.05, 10, { x: -0.27, y: 0.1, z: -0.3, rz: Math.PI / 2 }), m: M.rubber },
      { g: cyl(0.1, 0.1, 0.05, 10, { x: 0.27, y: 0.1, z: -0.3, rz: Math.PI / 2 }), m: M.rubber },
      { g: rod([-0.27, 0.98, -0.4], [0.27, 0.98, -0.4], 0.018, 5), m: M.plastic },
    ], { tint: 0x2f5a3a });
  }

  // ---------------------------------------------------------- 扫帚（靠墙）
  {
    D('broom', [
      { g: rod([0, 0.3, 0], [0, 1.45, 0], 0.014, 5), m: M.bamboo },
      { g: cyl(0.03, 0.17, 0.34, 7, { sz: 0.35 }), m: M.broom },
    ]);
  }

  // ---------------------------------------------------------- 棒棒：扁担 + 一圈麻绳
  {
    D('pole', [
      { g: rod([0, 0, 0], [0, 1.75, 0], 0.028, 6), m: M.bamboo },
      { g: xf(new THREE.TorusGeometry(0.15, 0.016, 4, 12), { y: 1.25, z: 0.06, rx: 0.3 }), m: M.rope },
      { g: xf(new THREE.TorusGeometry(0.13, 0.016, 4, 12), { y: 1.2, z: 0.07, rx: 0.2, ry: 0.4 }), m: M.rope },
      { g: rod([0.02, 1.08, 0.08], [0.06, 0.5, 0.1], 0.01, 4), m: M.rope },
    ]);
  }

  // ---------------------------------------------------------- 纸箱（单个，摆放时非均匀缩放）
  {
    D('carton', [
      { g: box(0.5, 0.36, 0.4), m: M.card },
      { g: box(0.08, 0.004, 0.41, { y: 0.36 }), m: M.tape },
      { g: box(0.25, 0.004, 0.4, { y: 0.36, x: 0.12, rz: -0.25 }), m: M.card },   // 翘起的盖片
    ]);
    D('cardFlat', [{ g: box(0.9, 0.012, 0.65), m: M.card }]);
  }

  // ---------------------------------------------------------- 盆栽
  {
    D('potBush', [
      { g: cyl(0.24, 0.17, 0.36, 12), m: M.terracotta },
      { g: cyl(0.23, 0.23, 0.01, 12, { y: 0.33 }), m: M.soil },
      ...cluster(0.02, 0.62, 0, 0.62, 5, M.foliage),
      ...cluster(-0.12, 0.78, 0.06, 0.4, 3, M.foliage, 1),
    ]);
    // 铁树 / 剑麻：放射状尖叶
    const p = [{ g: cyl(0.2, 0.15, 0.3, 10), m: M.terracotta }, { g: cyl(0.06, 0.08, 0.35, 6, { y: 0.28 }), m: M.wood }];
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, tilt = 0.5 + (i % 3) * 0.3;
      p.push({ g: cyl(0.002, 0.045, 0.75 - (i % 3) * 0.12, 4, { y: 0.6, rx: tilt, ry: a, sx: 0.4 }), m: i % 2 ? M.greenLt : M.green });
    }
    D('potSpiky', p);
    // 高的发财树：细干 + 三团叶
    D('potTall', [
      { g: cyl(0.26, 0.2, 0.42, 12), m: M.terracotta },
      { g: rod([0, 0.4, 0], [0.05, 1.3, 0.02], 0.03, 5), m: M.wood },
      { g: rod([0.03, 0.9, 0], [-0.2, 1.4, 0.05], 0.02, 5), m: M.wood },
      ...cluster(0.05, 1.55, 0, 0.7, 4, M.foliage),
      ...cluster(-0.25, 1.42, 0.1, 0.55, 3, M.foliage, 2),
      ...cluster(0.2, 1.25, -0.1, 0.45, 3, M.foliage, 3),
    ]);
    // 三角梅：挑檐上的花槽 + 顶上一团 + 沿 +Z 外沿垂下的几条花枝（局部 +Z = 朝外）
    const b = [{ g: box(0.85, 0.22, 0.26), m: M.terracotta }];
    const H = (n) => ((n * 2654435761) >>> 0) / 4294967296;   // 确定性小哈希
    b.push(...cluster(-0.2, 0.36, 0, 0.55, 3, M.bougain, 1), ...cluster(0.22, 0.34, 0.02, 0.5, 3, M.bougain, 2));
    // 垂下的花帘：几片竖向卡片，贴图本身是"上密下稀"的垂枝
    for (let st = 0; st < 5; st++) {
      const len = 1.0 + H(st + 50) * 0.8, w = 0.38 + H(st + 7) * 0.15;
      const g = new THREE.PlaneGeometry(w, len);
      g.translate(0, -len / 2, 0);
      b.push({ g: xf(g, { x: -0.36 + st * 0.18, y: 0.32, z: 0.12 + H(st + 3) * 0.12, ry: (H(st + 11) - 0.5) * 1.4, rx: 0.08 }), m: M.vine });
    }
    D('bougain', b);
  }

  // ---------------------------------------------------------- 伞：地上撑开的小伞（侧放）
  {
    D('umbrella', [
      { g: fan(0.5, 0.26, 8, -1, 0.04), m: M.plasticDS },
      { g: rod([0, 0.26, 0], [0, -0.5, 0], 0.009, 5), m: M.metalDk },
      { g: xf(new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI), { y: -0.5, x: 0.05, rz: Math.PI }), m: M.rubber },
    ], { tint: 0x7a2a2a });
    // 收起的伞（靠墙）
    D('umbrellaShut', [
      { g: cyl(0.004, 0.05, 0.62, 6, { y: 0.2 }), m: M.plasticDS },
      { g: rod([0, 0, 0], [0, 0.95, 0], 0.008, 4), m: M.metalDk },
      { g: xf(new THREE.TorusGeometry(0.045, 0.012, 4, 8, Math.PI), { y: 0.95, x: 0.045 }), m: M.rubber },
    ], { tint: 0x1e2a44 });
    // 店门口的大遮阳伞：条纹伞面（tint + 白）+ 杆 + 底座
    const R = 0.9, H = 0.36, Y = 2.42;
    D('parasol', [
      { g: xf(fan(R, H, 12, 0, 0.06), { y: Y }), m: M.plasticDS },
      { g: xf(fan(R, H, 12, 1, 0.06), { y: Y }), m: M.white },
      { g: rod([0, 0.08, 0], [0, Y + H + 0.08, 0], 0.022, 6), m: M.metal },
      { g: cyl(0.26, 0.3, 0.1, 10), m: M.concrete },
      { g: cyl(0.04, 0.0, 0.08, 6, { y: Y + H }), m: M.metal },
    ], { tint: 0x7a2a2a });
  }

  // ---------------------------------------------------------- 灯泡（挂在伞下 / 电线上）
  D('bulb', [{ g: sphere(0.05, 8, 6), m: M.bulb }, { g: cyl(0.018, 0.022, 0.05, 6, { y: 0.03 }), m: M.cord }]);
  D('cord', [{ g: rod([0, 0, 0], [0, 1, 0], 0.005, 3), m: M.cord }]);

  // ---------------------------------------------------------- 电瓶车（踏板式）
  {
    const p = [];
    // 车壳：前护板 + 后车身（侧轮廓挤出）
    p.push({ g: profile([[0.32, 0.27], [0.43, 0.27], [0.51, 0.36], [0.54, 0.47], [0.5, 0.64], [0.44, 0.84], [0.4, 0.96], [0.33, 1.0], [0.3, 0.9], [0.35, 0.62], [0.31, 0.4]], 0.4, { bevel: 0.04 }), m: M.plastic });
    p.push({ g: profile([[-0.08, 0.27], [-0.34, 0.27], [-0.42, 0.44], [-0.56, 0.49], [-0.8, 0.5], [-0.95, 0.55], [-1.0, 0.61], [-0.94, 0.68], [-0.6, 0.68], [-0.22, 0.66], [-0.12, 0.5], [-0.1, 0.38]], 0.33, { bevel: 0.04 }), m: M.plastic });
    // 尾部扶手 + 车牌
    p.push({ g: rod([-0.17, 0.74, -0.62], [-0.17, 0.76, -0.95], 0.012, 5), m: M.chrome });
    p.push({ g: rod([0.17, 0.74, -0.62], [0.17, 0.76, -0.95], 0.012, 5), m: M.chrome });
    p.push({ g: rod([-0.17, 0.76, -0.95], [0.17, 0.76, -0.95], 0.012, 5), m: M.chrome });
    p.push({ g: box(0.2, 0.11, 0.008, { y: 0.44, z: -0.97, rx: 0.25 }), m: M.white });
    // 车身侧面的分色腰线（深色），打破大色块
    p.push({ g: box(0.345, 0.03, 0.5, { y: 0.52, z: -0.62 }), m: M.metalDk });
    // 前挡泥板
    p.push({ g: box(0.13, 0.04, 0.4, { y: 0.47, z: 0.6, rx: 0.12 }), m: M.plastic });
    // 车头罩（仪表 / 车把罩）
    p.push({ g: box(0.36, 0.11, 0.17, { y: 0.96, z: 0.37 }), m: M.plastic });
    // 坐垫
    p.push({ g: profile([[-0.17, 0.64], [-0.2, 0.735], [-0.42, 0.775], [-0.78, 0.8], [-0.93, 0.765], [-0.9, 0.68]], 0.29, { bevel: 0.03 }), m: M.seat });
    // 脚踏板
    p.push({ g: box(0.32, 0.05, 0.48, { y: 0.24, z: 0.09 }), m: M.rubber });
    // 车轮
    for (const z of [0.6, -0.6]) {
      p.push({ g: cyl(0.23, 0.23, 0.085, 14, { z, y: 0.23, rz: Math.PI / 2 }), m: M.rubber });
      p.push({ g: cyl(0.12, 0.12, 0.095, 8, { z, y: 0.23, rz: Math.PI / 2 }), m: M.chrome });
    }
    p.push({ g: rod([0.07, 0.23, 0.6], [0.07, 0.62, 0.47], 0.018, 5), m: M.chrome });
    p.push({ g: rod([-0.07, 0.23, 0.6], [-0.07, 0.62, 0.47], 0.018, 5), m: M.chrome });
    p.push({ g: rod([0.12, 0.23, -0.6], [0.12, 0.5, -0.4], 0.02, 5), m: M.metalDk });   // 后减震
    // 车把 + 把套
    p.push({ g: rod([0, 0.95, 0.36], [0, 1.07, 0.32], 0.025, 6), m: M.metalDk });
    p.push({ g: rod([-0.3, 1.05, 0.3], [0.3, 1.05, 0.3], 0.013, 5), m: M.metalDk });
    p.push({ g: rod([-0.34, 1.05, 0.3], [-0.24, 1.05, 0.3], 0.022, 6), m: M.rubber });
    p.push({ g: rod([0.24, 1.05, 0.3], [0.34, 1.05, 0.3], 0.022, 6), m: M.rubber });
    // 后视镜：细杆 + 椭圆镜面
    for (const s of [-1, 1]) {
      p.push({ g: rod([s * 0.21, 1.06, 0.32], [s * 0.28, 1.32, 0.33], 0.007, 4), m: M.metalDk });
      p.push({ g: cyl(0.055, 0.055, 0.016, 10, { x: s * 0.29, y: 1.34, z: 0.335, rx: Math.PI / 2, sx: 1.35 }), m: M.metalDk });
      p.push({ g: cyl(0.048, 0.048, 0.002, 10, { x: s * 0.29, y: 1.34, z: 0.326, rx: Math.PI / 2, sx: 1.35 }), m: M.chrome });
    }
    // 前大灯（灭）
    p.push({ g: box(0.16, 0.08, 0.02, { y: 0.96, z: 0.46 }), m: M.lamp });
    // 后货架 + 脚撑
    p.push({ g: box(0.28, 0.02, 0.26, { y: 0.72, z: -0.86 }), m: M.metalDk });
    p.push({ g: rod([-0.12, 0.3, -0.2], [-0.26, 0.0, -0.32], 0.012, 4), m: M.metalDk });
    D('scooter', p, { tint: 0xb4b8be });
    D('tailOff', [{ g: box(0.17, 0.05, 0.03, { y: 0.6, z: -0.99 }), m: M.tailOff }]);
    D('tailOn', [{ g: box(0.17, 0.05, 0.03, { y: 0.6, z: -0.99 }), m: M.tailOn }]);
    // 外卖箱
    D('delivery', [
      { g: box(0.44, 0.4, 0.4, { y: 0.74, z: -0.8 }), m: M.plastic },
      { g: box(0.46, 0.03, 0.42, { y: 1.14, z: -0.8 }), m: M.plastic },
      { g: box(0.3, 0.12, 0.005, { y: 0.98, z: -0.598 }), m: M.white },
    ], { tint: 0x8a6a1a });
    // 雨披：搭在车上，两侧下垂
    const ytop = (z) => {
      const K = [[0.42, 1.08], [0.3, 0.98], [0.12, 0.74], [-0.2, 0.8], [-0.9, 0.85], [-1.02, 0.72]];
      for (let i = 0; i < K.length - 1; i++) {
        const [z0, y0] = K[i], [z1, y1] = K[i + 1];
        if (z <= z0 && z >= z1) return y0 + (y1 - y0) * (z0 - z) / (z0 - z1);
      }
      return 0.7;
    };
    D('raincover', [{
      g: sheet(10, 8, (u, v) => {
        const z = 0.42 - u * 1.44, s = v * 2 - 1, a = Math.abs(s);
        const y0 = ytop(z) + 0.03;
        const drop = (y0 - 0.32) * 0.9 * Math.pow(a, 1.6);
        const w = Math.sin(u * 17 + s * 4) * 0.012 + Math.sin(u * 31) * 0.008;
        return [s * (0.19 + 0.16 * Math.sqrt(a)) + w, y0 - drop, z + w];
      }), m: M.plasticDS,
    }], { tint: 0x1e2a44 });
    // 挡风被（车头前的棉被）
    D('quilt', [{
      g: sheet(6, 8, (u, v) => {
        const s = u * 2 - 1, h = v;
        const x = s * (0.3 + 0.1 * (1 - h));
        const z = 0.48 + 0.12 * (1 - h) - 0.14 * s * s + Math.sin(h * 9 + s * 3) * 0.01;
        return [x, 0.2 + h * 0.86, z];
      }), m: M.cloth,
    }], { tint: 0x6a1a22 });
  }

  // ---------------------------------------------------------- 江边：长椅 / 望远镜 / 路牌杆
  {
    const p = [];
    for (const x of [-0.72, 0.72]) {
      p.push({ g: box(0.06, 0.42, 0.06, { x, z: 0.2 }), m: M.metalDk });
      p.push({ g: box(0.06, 0.82, 0.06, { x, z: -0.22, rx: -0.12 }), m: M.metalDk });
      p.push({ g: box(0.06, 0.05, 0.5, { x, y: 0.38 }), m: M.metalDk });
    }
    for (let i = 0; i < 4; i++) p.push({ g: box(1.7, 0.035, 0.095, { y: 0.42, z: 0.18 - i * 0.12 }), m: M.wood });
    for (let i = 0; i < 2; i++) p.push({ g: box(1.7, 0.09, 0.03, { y: 0.55 + i * 0.16, z: -0.25 - i * 0.02, rx: -0.12 }), m: M.wood });
    D('bench', p);
    D('scope', [
      { g: cyl(0.07, 0.12, 1.0, 8), m: M.metalDk },
      { g: cyl(0.18, 0.2, 0.05, 10), m: M.metalDk },
      { g: box(0.24, 0.2, 0.3, { y: 1.0, rx: -0.15 }), m: M.plastic },
      { g: cyl(0.055, 0.06, 0.22, 8, { x: 0.065, y: 1.14, z: 0.12, rx: Math.PI / 2 - 0.15 }), m: M.metalDk },
      { g: cyl(0.055, 0.06, 0.22, 8, { x: -0.065, y: 1.14, z: 0.12, rx: Math.PI / 2 - 0.15 }), m: M.metalDk },
      { g: box(0.3, 0.08, 0.1, { y: 1.12, z: -0.2 }), m: M.rubber },
    ], { tint: 0x3c6f8a });
  }

  // 江边 LED 矮柱灯（只发光，不登记光场）
  D('bollard', [
    { g: cyl(0.075, 0.085, 0.72, 10), m: M.metalDk },
    { g: cyl(0.078, 0.078, 0.06, 10, { y: 0.56 }), m: M.led },
    { g: cyl(0.06, 0.08, 0.04, 10, { y: 0.72 }), m: M.metalDk },
  ]);

  // ---------------------------------------------------------- 落叶 / 井盖 / 铁箅子
  D('leaf', [{ g: xf(new THREE.PlaneGeometry(0.07, 0.045), { rx: -Math.PI / 2, y: 0.006 }), m: M.leaf }]);
}
