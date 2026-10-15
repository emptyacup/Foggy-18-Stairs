// aircraft —— 天空中的飞行器：悬停母舰、飞车航道灯河、广告飞艇、警用飞行器（Spinner）。
// 任务卡：docs/tasks/aircraft.md。所有动画只由时间 t 决定（截图模式 dt=0）。
// 远处的东西（母舰 / 飞艇 / 远航道）用 lib/aircraft-fx.js 的自带雾 shader，否则会被场景雾完全吞掉。
import { buildCarrier } from './lib/aircraft-carrier.js';
import { buildLanes } from './lib/aircraft-lanes.js';
import { buildBlimp } from './lib/aircraft-blimp.js';
import { buildPolice } from './lib/aircraft-police.js';
import { buildClouds } from './lib/aircraft-clouds.js';

export function build(ctx) {
  const carrier = buildCarrier(ctx);
  buildClouds(ctx, carrier.root);
  buildLanes(ctx);
  buildBlimp(ctx);
  buildPolice(ctx);
}
