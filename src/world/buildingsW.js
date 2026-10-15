// buildingsW —— 梯坎西侧地块 + 西半边街区的居民楼。发布服务 'facades'（立面描述数组，追加）。
import { buildSide } from './lib/side.js';

export function build(ctx) {
  buildSide(ctx, 'W');
}
