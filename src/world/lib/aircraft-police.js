// aircraft-police —— 警用飞行器（Spinner）：悬停在大阶梯上空，红蓝警灯交替，探照灯光锥扫过阶梯与人群。
// 局部坐标：+X 机头，+Y 上，Z 机宽。整机挂在 Group 下（dynamicRoot），位置/姿态只由 t 决定。
import * as THREE from 'three';
import { NEON } from '../../core/palette.js';
import { Glows, makeBeam, aimBeam, prep, merge } from './aircraft-fx.js';

function extrude(pts, width, bevel = 0.06) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 1, curveSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function box(w, h, d, x, y, z, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; }
function cylY(r, h, x, y, z, seg = 14) { const g = new THREE.CylinderGeometry(r, r, h, seg, 1, false); g.translate(x, y, z); return g; }
const P = (list) => merge(list.map(g => prep(g)));

// 机体几何（按材质分组）
function spinnerGeos() {
  const W = 2.5;
  const body = [
    // 主体侧面轮廓：低矮楔形机头、隆起的座舱段、上翘的尾部
    extrude([[-3.3, -0.45], [2.4, -0.45], [3.4, -0.12], [3.3, 0.12], [1.5, 0.42], [-1.0, 0.62], [-2.9, 0.78], [-3.45, 0.35]], W, 0.08),
    // 两侧推进舱（长条吊舱）
    extrude([[-3.0, -0.75], [2.0, -0.75], [2.6, -0.45], [2.2, -0.1], [-3.2, -0.05], [-3.4, -0.4]], 0.7, 0.05).translate(0, 0, W / 2 + 0.25),
    extrude([[-3.0, -0.75], [2.0, -0.75], [2.6, -0.45], [2.2, -0.1], [-3.2, -0.05], [-3.4, -0.4]], 0.7, 0.05).translate(0, 0, -W / 2 - 0.25),
    box(0.9, 0.22, W + 1.6, -2.95, 0.78, 0),                       // 尾部扰流翼
    box(0.12, 0.42, 0.12, -2.9, 0.48, W / 2 + 0.6), box(0.12, 0.42, 0.12, -2.9, 0.48, -W / 2 - 0.6),
  ];
  const stripe = [
    box(4.6, 0.16, W + 0.04, 0.0, 0.05, 0),                         // 白色腰线
    box(1.8, 0.1, 0.74, -0.6, -0.42, W / 2 + 0.25), box(1.8, 0.1, 0.74, -0.6, -0.42, -W / 2 - 0.25),
  ];
  const glass = [extrude([[1.45, 0.4], [0.4, 1.12], [-1.4, 1.2], [-2.3, 0.72]], W - 0.5, 0.04)];
  const dark = [
    cylY(0.5, 0.3, 1.7, -0.9, W / 2 + 0.25), cylY(0.5, 0.3, 1.7, -0.9, -W / 2 - 0.25),   // 垂直推进器
    cylY(0.55, 0.3, -2.2, -0.9, W / 2 + 0.25), cylY(0.55, 0.3, -2.2, -0.9, -W / 2 - 0.25),
    box(1.1, 0.14, 0.8, -0.4, 1.28, 0),                               // 警灯底座
    box(0.5, 0.35, 0.5, 2.5, -0.62, 0),                               // 探照灯吊架
    cylY(0.28, 0.4, 2.5, -0.95, 0, 12),
    box(0.06, 0.06, 0.9, 3.36, 0.0, 0),                               // 前格栅
  ];
  const thr = [];
  for (const [x, z, r] of [[1.7, W / 2 + 0.25, 0.42], [1.7, -W / 2 - 0.25, 0.42], [-2.2, W / 2 + 0.25, 0.47], [-2.2, -W / 2 - 0.25, 0.47]]) {
    const c = new THREE.CircleGeometry(r, 14); c.rotateX(Math.PI / 2); c.translate(x, -1.06, z); thr.push(c);
  }
  const head = [box(0.08, 0.09, 0.55, 3.33, 0.0, 0.75), box(0.08, 0.09, 0.55, 3.33, 0.0, -0.75)];
  const tail = [box(0.08, 0.12, W - 0.2, -3.47, 0.4, 0), box(0.06, 0.08, 0.6, -3.2, -0.25, W / 2 + 0.25), box(0.06, 0.08, 0.6, -3.2, -0.25, -W / 2 - 0.25)];
  // 侧舱外沿的蓝色灯带 + 机头横向灯条 + 尾部竖灯
  const accent = [
    box(4.6, 0.06, 0.06, -0.5, -0.5, W / 2 + 0.62), box(4.6, 0.06, 0.06, -0.5, -0.5, -W / 2 - 0.62),
    box(0.06, 0.05, 1.9, 3.36, 0.1, 0),
    box(0.06, 0.3, 0.08, -3.0, 0.95, W / 2 + 0.6), box(0.06, 0.3, 0.08, -3.0, 0.95, -W / 2 - 0.6),
    box(3.4, 0.04, 0.04, -0.45, 0.47, W / 2 - 0.24), box(3.4, 0.04, 0.04, -0.45, 0.47, -W / 2 + 0.24),   // 座舱下沿
  ];
  const red = [box(0.44, 0.16, 0.36, -0.4, 1.43, 0.22)];
  const blue = [box(0.44, 0.16, 0.36, -0.4, 1.43, -0.22)];
  const lens = (() => { const c = new THREE.CircleGeometry(0.24, 12); c.rotateX(Math.PI / 2); c.translate(2.5, -1.16, 0); return [c]; })();
  return { body: P(body), stripe: P(stripe), glass: P(glass), dark: P(dark), thr: P(thr), head: P(head), tail: P(tail), accent: P(accent), red: P(red), blue: P(blue), lens: P(lens) };
}

export function buildPolice(ctx) {
  const { L, mat } = ctx;
  const G = spinnerGeos();
  const sideTex = ctx.tex.neonText('空中巡警', { style: 'led', color: NEON.cyan });

  // 两架：A 悬停在大阶梯中段上空（主镜头可见），B 在更远处绕圈巡逻
  const units = [
    { id: 'A', mode: 'hover', base: [-3, 63, -64], seed: 0.0 },
    { id: 'B', mode: 'patrol', base: [8, 71, -86], seed: 2.3 },
  ];
  const glows = new Glows(ctx, units.length * 10, { fogK: 1.0, minPx: 4, streak: 0.9, name: 'police-glows', dynamic: true });

  for (const [ui, u] of units.entries()) {
    const grp = new THREE.Group();
    grp.name = 'spinner-' + u.id;
    ctx.dynamicRoot.add(grp);
    // 每架独立的警灯材质（颜色逐帧改）
    const redMat = mat.neon(0xff1a2a, 4, { uid: 'police-red-' + u.id });
    const blueMat = mat.neon(0x2a5aff, 4, { uid: 'police-blue-' + u.id });
    const M = {
      body: mat.std({ color: 0x2a303c, roughness: 0.22, metalness: 0.6, wet: 1 }),
      stripe: mat.std({ color: 0xc8ccd4, roughness: 0.3, metalness: 0.2, wet: 1 }),
      accent: mat.neon(0x3a7bff, 3.2),
      glass: mat.std({ color: 0x0a0e18, roughness: 0.04, metalness: 0.7, wet: 0.6 }),
      dark: mat.surface('metalDk', { wet: 0.8 }),
      thr: mat.neon(0x7ab8ff, 3.2),
      head: mat.neon(0xfff2dc, 5),
      tail: mat.neon(0xff1420, 3),
      red: redMat, blue: blueMat,
      lens: mat.neon(0xffffff, 8),
    };
    for (const k of Object.keys(G)) {
      const m = new THREE.Mesh(G[k], M[k]);
      m.name = 'spinner-' + k;
      grp.add(m);
    }
    // 侧面 LED 字
    const sw = 1.6, sh = sw / sideTex.aspect;
    for (const sd of [1, -1]) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat.emissiveMap(sideTex.texture, 2.0));
      q.position.set(-0.3, 0.32, sd * 1.255);
      if (sd < 0) q.rotation.y = Math.PI;
      grp.add(q);
    }
    const beam = makeBeam(ctx, ctx.dynamicRoot, { color: 0xe8f2ff, intensity: 0.55, fogK: 1.0, falloff: 0.6, rain: 0.4, core: 0.9, name: 'spinner-beam' });
    const spot = ctx.lights.add({ position: new THREE.Vector3(0, 30, -50), color: 0xdfeeff, intensity: 9, radius: 11 });
    const flash = ctx.lights.add({ position: new THREE.Vector3(...u.base), color: 0xff2030, intensity: 0, radius: 24 });
    Object.assign(u, { grp, redMat, blueMat, beam, spot, flash, gi: ui * 10 });
  }

  const RED = new THREE.Color(0xff1a2a).multiplyScalar(4), BLUE = new THREE.Color(0x2a5aff).multiplyScalar(4), OFF = new THREE.Color(0x200508);
  const OFFB = new THREE.Color(0x05081a);
  const v = new THREE.Vector3(), lensW = new THREE.Vector3(), tgt = new THREE.Vector3(), from = new THREE.Vector3();

  ctx.onUpdate((dt, t) => {
    for (const u of units) {
      const s = u.seed;
      let x, y, z, yaw;
      if (u.mode === 'hover') {
        x = u.base[0] + 2.5 * Math.sin(t * 0.13 + s);
        y = u.base[1] + 0.7 * Math.sin(t * 0.9 + s) + 0.3 * Math.sin(t * 2.1);
        z = u.base[2] + 3.5 * Math.sin(t * 0.09 + s + 1);
        yaw = 0.9 + 0.35 * Math.sin(t * 0.05 + s);          // 机头大致朝西南，侧面对着坡顶
      } else {
        const a = t * 2 * Math.PI / 80 + s;
        x = u.base[0] + 14 * Math.cos(a);
        z = u.base[2] + 24 * Math.sin(a);
        y = u.base[1] + 1.2 * Math.sin(t * 0.7 + s);
        // 机头沿切线方向
        const dx = -14 * Math.sin(a), dz = 24 * Math.cos(a);
        yaw = Math.atan2(-dz, dx);
      }
      const g = u.grp;
      g.position.set(x, y, z);
      g.rotation.set(0.04 * Math.sin(t * 0.8 + s), yaw, -0.06 + 0.03 * Math.sin(t * 0.6 + s), 'YXZ');
      g.updateMatrixWorld(true);

      // 探照灯：目标在阶梯 / 平台上缓慢扫动
      let tx, tz;
      if (u.mode === 'hover') { tx = 4.5 * Math.sin(t * 0.31 + s) + 2 * Math.sin(t * 0.83); tz = -40 + 13 * Math.sin(t * 0.17 + 0.5); }
      else { tx = 7 * Math.sin(t * 0.21 + s); tz = -80 + 16 * Math.sin(t * 0.13 + s); }
      const ty = L.heightAt(tx, tz, true);
      tgt.set(tx, ty, tz);
      from.set(2.5, -1.2, 0).applyMatrix4(g.matrixWorld);
      aimBeam(u.beam, from, tgt, 2.6);
      u.spot.position.set(tx, ty + 2.2, tz);

      // 警灯：红闪两下 → 蓝闪两下（周期 0.9 s）
      const ph = (t / 0.9 + s) % 1;
      const fl = (a) => (ph >= a && ph < a + 0.09) || (ph >= a + 0.16 && ph < a + 0.25);
      const r = fl(0.0), b = fl(0.5);
      u.redMat.color.copy(r ? RED : OFF);
      u.blueMat.color.copy(b ? BLUE : OFFB);
      u.flash.position.set(x, y + 1.5, z);
      if (r) { u.flash.color.setHex(0xff2030); u.flash.intensity = 3.5; }
      else if (b) { u.flash.color.setHex(0x3060ff); u.flash.intensity = 3.5; }
      else u.flash.intensity = 0.0;

      // 眩光
      const gi = u.gi;
      v.set(-0.4, 1.5, 0.22).applyMatrix4(g.matrixWorld); glows.set(gi, v.x, v.y, v.z, 0xff1a2a, r ? 7 : 0, 1.6);
      v.set(-0.4, 1.5, -0.22).applyMatrix4(g.matrixWorld); glows.set(gi + 1, v.x, v.y, v.z, 0x2a5aff, b ? 8 : 0, 1.6);
      lensW.copy(from);
      const dir = tgt.clone().sub(from).normalize();
      glows.set(gi + 2, lensW.x, lensW.y, lensW.z, 0xf0f6ff, 6, 1.4, { dir: [dir.x, dir.y, dir.z], dirMix: 0.7 });
      let k = 3;
      for (const [lx, lz] of [[1.7, 1.5], [1.7, -1.5], [-2.2, 1.5], [-2.2, -1.5]]) {
        v.set(lx, -1.15, lz).applyMatrix4(g.matrixWorld); glows.set(gi + k++, v.x, v.y, v.z, 0x7ab8ff, 1.4, 1.1);
      }
      v.set(3.4, 0.0, 0).applyMatrix4(g.matrixWorld);
      const fwd = new THREE.Vector3(1, 0, 0).transformDirection(g.matrixWorld);
      glows.set(gi + k++, v.x, v.y, v.z, 0xfff0d8, 3.5, 1.3, { dir: [fwd.x, fwd.y, fwd.z], dirMix: 0.85 });
      v.set(-3.5, 0.4, 0).applyMatrix4(g.matrixWorld);
      glows.set(gi + k++, v.x, v.y, v.z, 0xff1a24, 2.0, 1.0, { dir: [-fwd.x, -fwd.y, -fwd.z], dirMix: 0.6 });
      // 白色频闪
      const strobe = ((t + s * 0.37) % 1.3) < 0.05 ? 9 : 0;
      v.set(-2.9, 0.95, 0).applyMatrix4(g.matrixWorld); glows.set(gi + k++, v.x, v.y, v.z, 0xffffff, strobe, 1.2);
    }
    glows.commit();
  });
  return { units: units.length };
}
