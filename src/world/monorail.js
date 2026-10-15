// monorail —— 跨座式单轨（轻轨）：轨道梁、T 形墩、"穿楼"站楼（列车从楼中穿过）、4 节编组列车。
// 时刻表：周期 MONORAIL.period 秒，自东向西进站、停靠、出站。位置只由时间 t 决定（截图可复现）。
import * as THREE from 'three';
import { boxGeo } from '../core/make.js';
import { buildTower } from './lib/tower.js';
import { NEON, WINDOW } from '../core/palette.js';

const CARS = 4, CAR_L = 15, CAR_W = 2.9, CAR_H = 3.6;

// 列车车头 x 坐标（向 -X 行驶）。null = 不在线路上
export function trainX(t, M) {
  const p = ((t % M.period) + M.period) % M.period;
  const dist = 330;
  const tIn = 26, dwell = 10, tOut = 26;          // 进站 / 停站 / 出站
  const sIn = (k) => dist * (1 - Math.pow(1 - k, 2));      // 减速
  if (p < tIn) return dist - sIn(p / tIn);                  // 330 → 0
  if (p < tIn + dwell) return 0;
  if (p < tIn + dwell + tOut) { const k = (p - tIn - dwell) / tOut; return -dist * k * k; }   // 加速离站
  return null;
}

export function build(ctx) {
  const { L, mat, make } = ctx;
  const M = L.MONORAIL, B = M.building;
  const beamMat = mat.surface('concrete', { wet: 0.4 });
  const beamTop = M.y;
  const CX = (B.x0 + B.x1) / 2, HW = (B.x1 - B.x0) / 2;   // 站楼中心 / 半宽

  // ------------------------------------------------------------ 轨道梁 + 墩
  const segs = [[M.x0, B.x0], [B.x1, M.x1]];
  for (const [a, b] of segs) {
    make.block(b - a, 1.5, 0.85, beamMat, { x: (a + b) / 2, y: beamTop - 1.5, z: M.z });
    for (let x = Math.ceil(a / 30) * 30; x <= b; x += 30) {
      if (Math.abs(x - CX) < HW + 4) continue;
      const g = L.heightAt(x, M.z);
      make.block(1.4, beamTop - 2.6 - g, 1.4, beamMat, { x, y: g, z: M.z });
      make.block(2.2, 1.1, 2.6, beamMat, { x, y: beamTop - 2.6, z: M.z });
    }
  }

  // ------------------------------------------------------------ 穿楼站楼
  const fac = buildTower(ctx, {
    id: 'station', x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, ground: B.base - 1,
    podiumTop: B.base + 5, height: B.floors * B.floorH + 1, face: 'S',
  });
  ctx.provide('stationFacade', fac);
  // 东西两侧洞口：亮着的站台
  const openW = 7, openH = 5.2;
  for (const s of [-1, 1]) {
    const x = CX + s * (HW + 0.03);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH), mat.neon(0xfff2dc, 2.6));
    hole.position.set(x, beamTop + openH / 2 - 1.6, M.z);
    hole.rotation.y = s * Math.PI / 2;
    ctx.staticRoot.add(hole);
    // 洞口框
    for (const [w, h, dy, dz] of [[openW + 0.8, 0.4, openH + 0.2, 0], [0.4, openH + 0.6, -0.2, openW / 2 + 0.2], [0.4, openH + 0.6, -0.2, -openW / 2 - 0.2]]) {
      const f = new THREE.Mesh(boxGeo(0.5, h, w === openW + 0.8 ? w : 0.4), mat.surface('metalDk'));
      f.position.set(x + s * 0.2, beamTop - 1.6 + dy, M.z + dz);
      ctx.staticRoot.add(f);
    }
    ctx.lights.add({ position: [x + s * 2, beamTop + 1.5, M.z], color: 0xfff0d0, intensity: 3, radius: 16 });
    ctx.halos.add({ position: [x + s * 0.6, beamTop + 1.0, M.z], color: 0xfff0d0, size: 12, intensity: 0.35 });
  }
  // 站名招牌（虚构站名）
  make.neonSign({ text: '雾岭站', pos: [CX, beamTop + 9.5, B.z1 + 0.15], ry: 0, color: NEON.cyan, color2: NEON.white, size: 1.6, sub: 'WULING STATION', intensity: 2.4 });
  make.neonSign({ text: '轨道交通2号线', pos: [CX, B.base + 4.7, B.z1 + 0.1], ry: 0, style: 'box', color: 0x1a7a3a, size: 0.7, intensity: 2.2, halo: false });

  // ------------------------------------------------------------ 列车
  const train = new THREE.Group();
  train.name = 'monorailTrain';
  const body = mat.std({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.2, wet: 0.6 });
  const stripe = mat.neon(0xd02030, 0.8);
  const winMat = mat.neon(WINDOW.fluor, 2.2);
  const skirt = mat.surface('metalDk');
  for (let c = 0; c < CARS; c++) {
    const car = new THREE.Group();
    car.position.x = c * (CAR_L + 0.4) + CAR_L / 2;
    const sh = new THREE.Mesh(boxGeo(CAR_L, CAR_H, CAR_W), body); sh.position.y = 0.0; car.add(sh);
    const roof = new THREE.Mesh(boxGeo(CAR_L - 0.4, 0.35, CAR_W - 0.5), body); roof.position.y = CAR_H; car.add(roof);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(CAR_L - 1.6, 1.15), winMat);
      w.position.set(0, 2.15, s * (CAR_W / 2 + 0.01)); w.rotation.y = s > 0 ? 0 : Math.PI; car.add(w);
      const st = new THREE.Mesh(new THREE.PlaneGeometry(CAR_L, 0.18), stripe);
      st.position.set(0, 1.25, s * (CAR_W / 2 + 0.012)); st.rotation.y = s > 0 ? 0 : Math.PI; car.add(st);
    }
    // 跨座裙板（骑在轨道梁上）
    const sk = new THREE.Mesh(boxGeo(CAR_L - 1, 1.5, CAR_W - 0.3), skirt); sk.position.y = -1.5; car.add(sk);
    if (c === 0) {   // 车头灯
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.35), mat.neon(0xf4f8ff, 6));
      hl.position.set(-CAR_L / 2 - 0.01, 1.0, 0); hl.rotation.y = -Math.PI / 2; car.add(hl);
    }
    train.add(car);
  }
  train.position.set(0, beamTop + 0.2, M.z);
  ctx.dynamicRoot.add(train);
  const light = ctx.lights.add({ position: [0, beamTop + 2, M.z], color: WINDOW.fluor, intensity: 2.2, radius: 18 });
  const headLight = ctx.lights.add({ position: [0, beamTop + 1, M.z], color: 0xf4f8ff, intensity: 3.5, radius: 22 });

  ctx.onUpdate((dt, t) => {
    const xr = trainX(t, M);
    const x = xr === null ? null : xr + CX;
    train.visible = x !== null;
    if (x === null) { light.intensity = 0; headLight.intensity = 0; return; }
    train.position.x = x;
    light.position.set(x + CARS * CAR_L / 2, beamTop + 2.5, M.z + 2.5);
    light.intensity = 2.2;
    headLight.position.set(x - 6, beamTop + 1, M.z);
    headLight.intensity = 3.5;
  });
}
