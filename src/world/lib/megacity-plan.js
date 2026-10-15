// megacity 构图规划（纯数据，environment 也读取它来给江面倒影光带上色）。
// 屏幕宿主塔楼手工摆放：从 hero 机位看，主屏落在 V 形取景框上方的天空里，并避开全息巨人 (130,-330)。
import { MEGA } from '../layout.js';

// 主观察点（hero 机位）——用来让屏幕略微转向镜头、并剔除挡住屏幕的随机塔楼
export const VIEW = [{ x: 0.5, y: 41.65, z: -6.5 }, { x: 0, y: 11.65, z: -119 }, { x: 0, y: 75, z: -40 }];

// kind: mask 川剧变脸 | portrait 人像 | eye 眼睛特写 | ad 品牌广告轮播 | qr 数据方块 | sub 竖排滚动字幕
// host: 宿主塔楼 { x, z, w, d, h }；screen: 屏幕中心高度 y、宽 w、高 h；color: 代表色（云底反光、倒影用）
export const SCREENS = [
  { id: 'mask', kind: 'mask', host: { x: 78, z: -500, w: 118, d: 64, h: 330 }, y: 196, w: 100, h: 126, color: 0xff3020 },
  { id: 'portrait', kind: 'portrait', host: { x: -235, z: -540, w: 108, d: 60, h: 372 }, y: 210, w: 92, h: 124, color: 0xff3fc0 },
  { id: 'eye', kind: 'eye', host: { x: 270, z: -790, w: 190, d: 70, h: 470 }, y: 335, w: 168, h: 70, color: 0x30d8ff },
  { id: 'adA', kind: 'ad', host: { x: -470, z: -700, w: 120, d: 70, h: 300 }, y: 214, w: 110, h: 56, color: 0xffa030, ads: [0, 1, 2] },
  { id: 'adB', kind: 'ad', host: { x: 460, z: -560, w: 96, d: 60, h: 250 }, y: 150, w: 84, h: 44, color: 0x40ffd0, ads: [3, 4, 0] },
  { id: 'qr', kind: 'qr', host: { x: -120, z: -930, w: 90, d: 60, h: 540 }, y: 420, w: 70, h: 70, color: 0x7d5cff },
  { id: 'subHero', kind: 'sub', host: null, x: MEGA.hero.x, z: MEGA.hero.z, y: 300, w: 16, h: 300, color: 0xff2fd0, sub: 0 },
  { id: 'subA', kind: 'sub', host: { x: 175, z: -620, w: 60, d: 50, h: 410 }, y: 230, w: 12, h: 240, color: 0x22e6ff, sub: 1 },
  { id: 'subB', kind: 'sub', host: { x: -360, z: -860, w: 60, d: 50, h: 480 }, y: 300, w: 13, h: 300, color: 0xffb03a, sub: 2 },
  { id: 'adC', kind: 'ad', host: { x: -60, z: -1180, w: 140, d: 70, h: 560 }, y: 470, w: 130, h: 64, color: 0xff5fa8, ads: [2, 4, 1] },
];

// 屏幕朝向：朝向 hero 机位（绕 Y）
export function screenYaw(x, z) {
  const v = VIEW[0];
  return Math.atan2(v.x - x, v.z - z);
}
