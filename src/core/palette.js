// 调色板 —— 所有颜色从这里取，保证十几个模块拼起来是同一套画面。
// 规则（DESIGN.md §4）：非发光表面亮度 ≤ 0.55；饱和色只给霓虹/灯/招牌。

// 基底：低饱和、偏冷的暗色。雨夜里它们主要靠霓虹染色。
export const BASE = {
  asphalt:   0x2a2b32,
  stone:     0x5a5960,   // 梯坎青石
  stoneWet:  0x3e3d44,
  concrete:  0x6e7078,
  concreteDk:0x50525a,
  tileWhite: 0xb4b8be,   // 老居民楼白瓷砖（会被染色）
  tilePink:  0xa88a88,
  tileGreen: 0x7a8c86,
  plaster:   0x8e8a82,
  brick:     0x5a3d36,
  grime:     0x37363e,
  metal:     0x6a707a,
  metalDk:   0x3c4048,
  rust:      0x5a3a2a,
  glassDk:   0x10141c,
  wood:      0x4a3428,
  plastic:   0x3c6f8a,   // 蓝色塑料雨棚
  tarpRed:   0x7a2a2a,
  green:     0x2f4a33,   // 植物
};

// 霓虹：只用于发光体。值是 sRGB 色相，强度由 mat.neon(color, intensity) 决定。
export const NEON = {
  hotpot:  0xff2a3a,  // 火锅红 —— 场景主色
  magenta: 0xff2fd0,
  pink:    0xff5fa8,
  cyan:    0x22e6ff,
  teal:    0x19ffc8,
  green:   0x7dff4a,
  amber:   0xffb03a,
  orange:  0xff7a1f,
  violet:  0x8a5cff,
  blue:    0x3a7bff,
  white:   0xdfeeff,
};

// 窗内灯光色温
export const WINDOW = {
  warm:  0xffc27a,
  tv:    0x8fb8ff,
  fluor: 0xd8ffe8,
  red:   0xff6a5a,
};

// 天空 / 雾（线性空间之前的 sRGB）
export const ATMO = {
  fog:      0x252036,   // 被城市灯光染成紫灰
  skyTop:   0x05060c,
  skyHor:   0x3a2238,   // 云底反射的城市光
  cloudLit: 0x6a3550,
};

// 阴雨白天与较清晰的夜景：同时调整天空、雾和受光表面，不能只抬曝光。
export const LIGHTING = {
  // megaFog：远景巨构城空气透视消光倍率；rain：默认雨势（URL ?rain= 优先）
  night: { ...ATMO, density: 0.0085, skyLight: 0xaaa4cc, groundLight: 0x77717f,
    hemi: 3.3, glowColor: 0xb8acc8, glow: 1.15,
    exposure: 1.24, bloom: 0.35, ca: 0.45, grain: 0.025, vignette: 0.26, megaFog: 1.0, rain: 1.0 },
  day: { fog: 0xc6d2da, skyTop: 0x7c97ad, skyHor: 0xd2dce2, cloudLit: 0x8a9aa6,
    density: 0.0016, skyLight: 0xe8f0f6, groundLight: 0x949ca2,
    hemi: 3.6, glowColor: 0xfff2e2, glow: 2.6,
    exposure: 1.06, bloom: 0.13, ca: 0.1, grain: 0.012, vignette: 0.08, megaFog: 0.3, rain: 0.55 },
};

// 常用霓虹组合（招牌随机取色时用）
export const NEON_SETS = [
  ['hotpot', 'amber'], ['cyan', 'magenta'], ['pink', 'white'], ['green', 'teal'],
  ['violet', 'cyan'], ['orange', 'hotpot'], ['blue', 'pink'],
];
