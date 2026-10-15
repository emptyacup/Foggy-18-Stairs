// megacity —— 江对岸巨构城：巨构塔楼、雾都塔、巨型屏幕（川剧变脸 / 人像 / 眼睛 / 广告 / 字幕 / 数据码）、光柱、探照灯、被照亮的云底。
// 远景全部走自定义 shader（自带高度雾与江面倒影 pass），见 lib/megacity-*.js。任务卡：docs/tasks/megacity.md
import * as THREE from 'three';
import { towerMaterial, farMaterial, addWithMirror, Glows } from './lib/megacity-gl.js';
import { buildTowers } from './lib/megacity-towers.js';
import { buildScreens } from './lib/megacity-screens.js';
import { buildBeams } from './lib/megacity-beams.js';

export function build(ctx) {
  const root = new THREE.Group(); root.name = 'megacity';
  ctx.staticRoot.add(root);
  const dyn = new THREE.Group(); dyn.name = 'megacityDyn';
  ctx.dynamicRoot.add(dyn);
  const glows = new Glows();

  // ---- 塔楼
  const T = buildTowers(ctx, glows);
  addWithMirror(ctx, root, T.geo.geometry(), towerMaterial(ctx), towerMaterial(ctx, { mirror: true }), 'megaTowers');
  const eg = T.emit.merged();
  if (eg) addWithMirror(ctx, root, eg, farMaterial(ctx, { emit: true }), farMaterial(ctx, { emit: true, mirror: true }), 'megaRings');

  // ---- 屏幕
  const S = buildScreens(ctx, root, T.mounts);

  // ---- 光柱 / 探照灯 / 云
  const B = buildBeams(ctx, dyn, T.tops, S.list, glows);

  glows.build(ctx, root, 'megaGlows');

  // 对外服务：屏幕位置与实时代表色（environment 的江面倒影光带读取）
  ctx.provide('megaScreens', S.list.map(s => ({ id: s.sc.id, pos: s.pos, w: s.sc.w, color: s.color })));

  const step = (dt, t) => { S.update(t); B.update(t); };
  step(0, ctx.time || 0);
  ctx.onUpdate(step);
}
