// signs —— 霓虹招牌：竖向挑出的双面灯牌、底商横向灯箱、楼顶大字、跨梯坎门头。
// 读取服务 'facades'（buildings 发布）；缺失时用 layout.LOTS 兜底。全部店名均为虚构。
import * as THREE from 'three';
import { NEON, NEON_SETS } from '../core/palette.js';
import { fixtureBounds, overlapsFixtures } from './lib/shops-signs-fixtures.js';

const VERT = ['山城老火锅', '雾都小面', '十八梯旅社', '老街茶馆', '幺妹串串', '江湖菜', '嘉陵烧烤', '夜宵', '麻将', '足浴',
  '网吧', '药房', '冰粉凉虾', '酸辣粉', '豆花饭', '红油抄手', '宾馆', '歌厅', '棋牌室', '理发', '诊所', '烟酒', '火锅',
  '烤鱼', '兔头', '牛肉面', '住宿', '按摩', '小龙虾', '串串香'];
const HORI = ['便民超市', '五金杂货', '手机维修', '渝味面馆', '老字号火锅', '烟酒副食', '眼镜', '开锁换锁', '麻辣烫', '鸡公煲',
  '水果', '干洗店', '饺子馆', '茶餐厅', '书报亭', '修鞋配钥匙'];
const SUBS = ['', '', '', 'SINCE 1998', '24H', '营业中', '正宗', 'HOTPOT', ''];

function fallbackFacades(L) {
  return L.LOTS.map(l => {
    const ry = l.side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const t = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const zs = l.side === 'W' ? l.z0 : l.z1;
    const origin = new THREE.Vector3(l.front, 0, zs);
    const podiumTop = Math.max(L.stairHeightAt(l.z0), L.stairHeightAt(l.z1)) + 4.2;
    return { id: l.id, face: l.side === 'W' ? 'E' : 'W', ry, normal: n, tangent: t, origin, length: Math.abs(l.z0 - l.z1),
      podiumTop, top: l.ground + l.height, frontPlane: l.front, fixtures: [],
      point: (u, y, out = 0) => origin.clone().addScaledVector(t, u).addScaledVector(n, out).setY(y) };
  });
}

export function build(ctx) {
  const { L, make } = ctx;
  const rng = ctx.rng('signs');
  const all = ctx.use('facades') || fallbackFacades(L);
  // 招牌挂在底商前沿，不沿楼身 setback 后退；fixtures 转到同一坐标系。
  const lotFacades = fallbackFacades(L).map(front => {
    const facade = all.find(f => f.id === front.id);
    return facade ? { ...front, podiumTop: facade.podiumTop, top: facade.top,
      fixtures: fixtureBounds(facade, front.origin) } : front;
  });
  const pickSet = () => rng.pick(NEON_SETS).map(k => NEON[k]);
  let vi = 0, hi = 0;

  for (const f of lotFacades) {
    // -------- 竖向挑出灯牌（双面，正对梯坎上下方向）
    const nV = rng.int(2, 3);
    const used = [];
    for (let k = 0; k < nV; k++) {
      const text = VERT[(vi++ * 7 + rng.int(0, 3)) % VERT.length];
      const [c1, c2] = pickSet();
      const style = rng() < 0.25 ? 'box' : 'tube';
      let size = rng.range(0.55, 0.85);
      const nch = [...text].length;
      const { aspect } = ctx.tex.neonText(text, { vertical: true, style, color: c1, color2: c2, sub: '' });
      // 整块牌板（含边框）与支架均收在 |x|=8.5..10，不能只约束挂点。
      const maxOut = Math.abs(f.frontPlane) - 8.5;
      size = Math.min(size, (maxOut - 0.28) / ((nch + 0.56) * aspect));
      if (size <= 0) continue;
      const h = size * (nch + 0.56);
      const w = h * aspect;
      let u = 0, yTop = 0, found = false;
      for (let tries = 0; tries < 32; tries++) {
        u = rng.range(1.2, f.length - 1.2);
        yTop = Math.min(f.top - 0.5, f.podiumTop + h + rng.range(0.5, 4));
        if (yTop - h < f.podiumTop + 0.15 || used.some(x => Math.abs(x - u) < 3)) continue;
        if (overlapsFixtures(f, u - 0.2, u + 0.2, yTop - h - 0.08, yTop + 0.12, 0.15)) continue;
        found = true; break;
      }
      if (!found) continue;
      used.push(u);
      const p = f.point(u, yTop, (w + 0.08) / 2 + 0.2);
      make.neonSign({ text, pos: [p.x, p.y, p.z], ry: 0, vertical: true, double: true, color: c1, color2: c2,
        size, intensity: rng.range(1.8, 2.8), style, flicker: rng() < 0.12 ? rng.range(0.3, 1) : 0 });
      // 挑出支架
      const reach = w + 0.28;
      const arm = f.point(u, yTop + 0.05, reach / 2);
      make.block(reach, 0.06, 0.06, ctx.mat.surface('metalDk'), { x: arm.x, y: arm.y, z: arm.z, ry: f.ry + Math.PI / 2 });
    }
    // -------- 底商横向灯箱（贴在基座挑檐下）
    const nH = rng.int(1, 2);
    const seg = f.length / nH;
    for (let k = 0; k < nH; k++) {
      const text = HORI[(hi++ * 5 + rng.int(0, 2)) % HORI.length];
      const [c1] = pickSet();
      const u = seg * (k + 0.5);
      const sub = rng.pick(SUBS);
      const { aspect } = ctx.tex.neonText(text, { vertical: false, style: 'box', color: c1, color2: undefined, sub });
      const units = 1.56 + (sub ? 0.45 : 0);
      const size = Math.min(0.5, (seg - 0.48) / (units * aspect), 0.84 / units);
      const yTop = f.podiumTop - 0.08, h = size * units;
      if (overlapsFixtures(f, u - h * aspect / 2 - 0.04, u + h * aspect / 2 + 0.04, yTop - h - 0.08, yTop, 0.06)) continue;
      const p = f.point(u, yTop, 0.12);
      make.neonSign({ text, pos: [p.x, p.y, p.z], ry: f.ry, style: 'box', color: c1, size,
        intensity: 2.0, sub, halo: false });
    }
  }

  // -------- 坡顶广场牌坊：保留造型，放在 hero 镜头身后，阶梯上空净空。
  const gz = L.STAIR.zTop + 8, gy = L.Y_UPPER, gh = 9.5;
  const pillar = ctx.mat.surface('metalDk');
  for (const s of [-1, 1]) {
    make.block(0.6, gh + 0.6, 0.6, pillar, { x: s * 9.6, y: gy - 0.3, z: gz });
    make.block(0.12, gh - 1, 0.04, ctx.mat.neon(NEON.hotpot, 3), { x: s * 9.6, y: gy + 0.5, z: gz + 0.32 });
  }
  make.block(20.4, 0.7, 0.7, pillar, { x: 0, y: gy + gh, z: gz });
  make.block(19.2, 0.06, 0.04, ctx.mat.neon(NEON.amber, 3), { x: 0, y: gy + gh - 0.08, z: gz + 0.37 });
  make.neonSign({ text: '十八梯', pos: [0, gy + gh - 0.1, gz + 0.4], ry: 0, color: NEON.hotpot, color2: NEON.amber, size: 1.1,
    sub: 'SHIBATI · 山城观景台', intensity: 2.8 });

  // -------- 楼顶大字（朝南，面向梯坎顶）
  const roofs = [['W2', '重庆老火锅', NEON.hotpot], ['E2', '雾都大酒店', NEON.magenta]];
  for (const [id, text, color] of roofs) {
    const f = lotFacades.find(x => x.id === id) || all.find(x => x.id === id);
    if (!f) continue;
    const lot = L.LOTS.find(l => l.id === id);
    const xc = (lot.front + lot.back) / 2, zc = lot.z0 - 1.2;
    const size = 1.5;
    const s = make.neonSign({ text, pos: [xc, f.top + 1.3 + size * 1.56, zc], ry: 0, color, color2: NEON.white, size, intensity: 2.6, double: false });
    // 广告架
    for (const dx of [-s.width / 2 + 0.5, s.width / 2 - 0.5]) {
      make.block(0.15, size * 1.56 + 1.3, 0.15, ctx.mat.surface('rust'), { x: xc + dx, y: f.top + 0.3, z: zc - 0.3 });
    }
  }
}
