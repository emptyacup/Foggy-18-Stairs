// ctx：模块拿到的唯一入口。模块签名：export function build(ctx) { ... }
import * as THREE from 'three';
import * as L from '../world/layout.js';
import { makeRng } from './rng.js';
import { LightField } from './lights.js';
import { MaterialLib } from './mat.js';
import { TexLib } from './tex.js';
import { Maker } from './make.js';
import { Halos } from './halos.js';
import { Wires } from './wires.js';
import { Physics } from './physics.js';
import * as palette from './palette.js';

export const QUALITY = {
  high:   { pixelRatio: 1.5, msaa: 4, ssr: true, rain: 1.0 },
  medium: { pixelRatio: 1.0, msaa: 4, ssr: true, rain: 0.7 },
  low:    { pixelRatio: 0.75, msaa: 0, ssr: false, rain: 0.4 },
};

export function createContext({ scene, camera, renderer, quality, audio }) {
  const shared = {
    uTime: { value: 0 },
    uRain: { value: 1 },       // 0..1 雨势（影响湿润、SSR、雨丝）
    uDaylight: { value: 0 },   // 0 夜景，1 阴雨白天
    uSkyTop: { value: new THREE.Color() },   // 天空顶/地平线色（sky.setDaylight 写入；SSR 未命中时的反射兜底）
    uSkyHor: { value: new THREE.Color() },
    uDryAreas: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    uDryCount: { value: 0 },
  };
  const lights = new LightField();
  const mat = new MaterialLib(lights, shared);
  const physics = new Physics(L);
  const staticRoot = new THREE.Group(); staticRoot.name = 'static';
  const dynamicRoot = new THREE.Group(); dynamicRoot.name = 'dynamic';
  scene.add(staticRoot, dynamicRoot);

  const ctx = {
    THREE, L, palette, scene, camera, renderer, quality, audio, shared,
    staticRoot,       // 不会动的东西 → 构建后自动合批
    dynamicRoot,      // 会动的东西（列车、车辆、行人、雨）
    lights, mat, physics,
    tex: new TexLib(renderer),
    halos: new Halos(),
    wires: new Wires(mat, () => ctx._module),
    time: 0,
    player: new THREE.Vector3(),   // 每帧同步相机位置
    _updates: [],
    _services: new Map(),
    _module: null,

    // 确定性随机数：ctx.rng('signs') —— 自动拼上模块名，模块间互不干扰
    rng(seed = '') { return makeRng((ctx._module || 'core') + ':' + seed); },
    // 每帧回调 (dt, t)。shot 模式下 dt=0、t 为固定时刻
    onUpdate(fn) { fn._module = ctx._module; ctx._updates.push(fn); },
    // 模块间服务：provide 发布数据，use 读取（可能为 undefined → 用 layout 兜底）
    provide(name, value) { ctx._services.set(name, value); },
    use(name) { return ctx._services.get(name); },
  };
  ctx.make = new Maker(ctx);
  return ctx;
}
