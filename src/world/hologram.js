// hologram —— 江面 140 m 全息巨人、绕雾都塔盘旋的全息龙、空中游弋的全息锦鲤。
// 任务卡：docs/tasks/hologram.md。全部为加法混合 ShaderMaterial（ctx.mat.custom），动画只由 uTime 决定。
import * as THREE from 'three';
import { buildGiantGeometry, giantMaterial } from './lib/hologram-giant.js';
import { buildBase } from './lib/hologram-base.js';
import { buildDragon } from './lib/hologram-dragon.js';
import { buildKoi } from './lib/hologram-koi.js';
import { NEON } from '../core/palette.js';

export function build(ctx) {
  const { L } = ctx;
  const fog = ctx.scene.fog;
  const common = {
    uTime: ctx.shared.uTime,
    uFogDensity: { value: fog ? fog.density : 0.012 },
    uFogColor: { value: fog ? fog.color : new THREE.Color(0x252036) },
  };
  const root = new THREE.Group();
  root.name = 'hologram';
  ctx.dynamicRoot.add(root);

  // ------------------------------------------------------------ 全息巨人
  const H = L.MEGA.holo.h, gx = L.MEGA.holo.x, gz = L.MEGA.holo.z, yw = L.Y_RIVER;
  const origin = new THREE.Vector3(gx, yw, gz);
  // 身体朝向：大致朝南岸（主镜头方向），留一点侧身，转头时才正对镜头
  const toHero = Math.atan2(L.CAMS.hero[0] - gx, L.CAMS.hero[2] - gz);
  const bodyYaw = toHero * 0.45;
  const gU = {
    ...common,
    uH: { value: H }, uYw: { value: yw }, uSeed: { value: 1.3 }, uGain: { value: 1.0 },
    uOrigin: { value: origin },
  };
  const gGeo = buildGiantGeometry(H);
  const giant = new THREE.Mesh(gGeo, ctx.mat.custom(giantMaterial(THREE, { uniforms: gU })));
  const mirror = new THREE.Mesh(gGeo, ctx.mat.custom(giantMaterial(THREE, { uniforms: gU, mirror: true })));
  for (const m of [giant, mirror]) {
    m.position.copy(origin);
    m.rotation.y = bodyYaw;
    m.frustumCulled = false;
    m.userData.noBatch = true;
    m.renderOrder = 7;
    root.add(m);
  }
  giant.name = 'holoGiant'; mirror.name = 'holoGiantReflection';
  buildBase(ctx, { x: gx, z: gz, yw, uniforms: gU, parent: root });

  // 光场：脚下青色（照亮江面/桥）、胸口品红
  ctx.lights.add({ position: new THREE.Vector3(gx, yw + 6, gz + 10), color: NEON.cyan, intensity: 60, radius: 80 });
  ctx.lights.add({ position: new THREE.Vector3(gx, yw + H * 0.7, gz + 12), color: NEON.magenta, intensity: 40, radius: 90 });
  // 光晕：光环上的投影器节点
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.halos.add({ position: [gx + Math.cos(a) * 40, yw + 1.5, gz + Math.sin(a) * 40], color: NEON.cyan, size: 16, intensity: 0.9 });
  }
  ctx.halos.add({ position: [gx, yw + 4, gz], color: NEON.cyan, size: 70, intensity: 0.5 });

  // ------------------------------------------------------------ 全息龙 / 锦鲤
  buildDragon(ctx, { uniforms: common, parent: root });
  buildKoi(ctx, { uniforms: common, parent: root });
}
