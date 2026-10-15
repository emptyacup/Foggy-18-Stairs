// traffic-signals —— 梯坎底斑马线的机动车信号灯（悬臂式）+ 行人信号灯（红小人 / 绿小人）。
// 状态只由时间 t 决定：周期 CYCLE 秒，机动车绿 → 黄 → 红（红灯期间行人绿灯，末尾绿灯闪烁）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo } from '../../core/make.js';

export const CYCLE = 40;
export const G_END = 24, Y_END = 27, W0 = 28, W1 = 36, F1 = 39;   // 行人绿灯 [W0, F1)，末段闪烁

const phase = (t) => ((t % CYCLE) + CYCLE) % CYCLE;
// terrain 的斑马线位于道路中点以西 30 m；车辆与行人共享同一位置。
export const crossingX = (L) => (L.ROAD.x0 + L.ROAD.x1) / 2 - 30;
export function roadSignal(t) { const p = phase(t); return p < G_END ? 'G' : p < Y_END ? 'Y' : 'R'; }
export function pedSignal(t) {
  const p = phase(t);
  if (p >= W0 && p < W1) return 'W';
  if (p >= W1 && p < F1) return (p * 2) % 1 < 0.5 ? 'W' : 'off';
  return 'R';
}

const RED = 0xff2a1a, YEL = 0xffb020, GRN = 0x2affa0;

function pedTex(ctx, walk) {
  const S = 64;
  const c = ctx.tex.canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#020203'; g.fillRect(0, 0, S, S);
  g.fillStyle = walk ? '#2affa0' : '#ff2a1a';
  g.beginPath(); g.arc(32, 12, 6, 0, Math.PI * 2); g.fill();
  if (walk) {
    g.save(); g.translate(32, 20); g.rotate(0.15); g.fillRect(-5, 0, 10, 20); g.restore();
    g.save(); g.translate(30, 39); g.rotate(0.45); g.fillRect(-3, 0, 6, 20); g.restore();
    g.save(); g.translate(35, 39); g.rotate(-0.4); g.fillRect(-3, 0, 6, 20); g.restore();
    g.save(); g.translate(28, 22); g.rotate(0.7); g.fillRect(-2.5, 0, 5, 16); g.restore();
    g.save(); g.translate(36, 22); g.rotate(-0.8); g.fillRect(-2.5, 0, 5, 16); g.restore();
  } else {
    g.fillRect(25, 20, 14, 22); g.fillRect(26, 41, 5, 19); g.fillRect(33, 41, 5, 19);
    g.fillRect(20, 21, 5, 18); g.fillRect(39, 21, 5, 18);
  }
  // 点阵
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = '#fff';
  for (let y = 0; y < S; y += 3) for (let x = 0; x < S; x += 3) g.fillRect(x, y, 2.2, 2.2);
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#020203'; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSignals(ctx, { zS, zN, stop, crossX = crossingX(ctx.L) }) {
  const { mat, L } = ctx;
  const y0 = L.ROAD.y;
  const metal = mat.surface('metalDk', { wet: 0.8 });
  const black = mat.std({ color: 0x0c0c0e, roughness: 0.5, wet: 0.6 });
  const offCol = { R: 0x2a0806, Y: 0x2a1c04, G: 0x04200f };
  const offMat = Object.fromEntries(Object.entries(offCol).map(([k, c]) => [k, mat.std({ color: c, roughness: 0.15, metalness: 0.2, wet: 0 })]));
  const onGeo = { R: [], Y: [], G: [] };
  const neonCol = { R: RED, Y: YEL, G: GRN };
  const lamps = [];   // 交给 traffic.js 的眩光系统（有朝向，背面看不到）
  const headLights = [];
  const S = ctx.staticRoot;
  const tmp = new THREE.Object3D();

  const pole = (x, z, h, r = 0.1) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 10), metal);
    m.position.set(x, y0 + h / 2, z); S.add(m);
    ctx.make.block(r * 3.2, 0.25, r * 3.2, metal, { x, y: y0, z });
    ctx.physics.addBox(x - r, z - r, x + r, z + r, y0 + h, y0);
  };

  // 车行信号灯头：局部 +Z 为灯面朝向
  const head = (x, y, z, ry, light) => {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = ry; S.add(g);
    const plate = new THREE.Mesh(boxGeo(0.58, 1.26, 0.03), black); plate.position.set(0, -0.63, -0.14); g.add(plate);
    const house = new THREE.Mesh(boxGeo(0.36, 1.02, 0.26), black); house.position.set(0, -0.51, 0); g.add(house);
    const keys = ['R', 'Y', 'G'];
    g.updateMatrixWorld(true);
    keys.forEach((k, i) => {
      const ly = -0.51 + (1 - i) * 0.32;
      const off = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), offMat[k]); off.position.set(0, ly, 0.132); g.add(off);
      const visor = new THREE.Mesh(boxGeo(0.3, 0.025, 0.2), black); visor.position.set(0, ly + 0.14, 0.23); g.add(visor);
      const on = new THREE.CircleGeometry(0.12, 16);
      tmp.position.set(0, ly, 0.136); tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
      on.applyMatrix4(tmp.matrix); on.applyMatrix4(g.matrixWorld);
      onGeo[k].push(on);
      const hp = new THREE.Vector3(0, ly, 0.2).applyMatrix4(g.matrixWorld);
      lamps.push({ pos: hp, dx: Math.sin(ry), dz: Math.cos(ry), color: neonCol[k], size: 0.5, intensity: 0.5, on: t => roadSignal(t) === k });
    });
    if (light) {
      const lp = new THREE.Vector3(0, -0.5, 0.9).applyMatrix4(g.matrixWorld);
      headLights.push(ctx.lights.add({ position: lp, color: RED, intensity: 0.9, radius: 6 }));
    }
  };

  const laneW = (zS - zN) / 4;
  const H = 6.3, armY = y0 + H - 0.3;
  // 东行（来自 -X，看 +X 方向）：东南角立杆，悬臂向北
  {
    const px = crossX + stop + 0.8, pz = zS + 1.1;
    pole(px, pz, H, 0.12);
    const armLen = laneW * 2.3;
    ctx.make.block(0.1, 0.14, armLen, metal, { x: px, y: armY, z: pz - armLen / 2 });
    ctx.wires.add([px, y0 + H - 1.4, pz], [px, armY + 0.05, pz - armLen * 0.6], { sag: 0.02, r: 0.025 });   // 斜拉杆
    for (const k of [0.5, 1.5]) head(px, armY, zS - laneW * k, -Math.PI / 2, true);
    head(px - 0.15, y0 + 3.6, pz, -Math.PI / 2, false);
  }
  // 西行（来自 +X）：西北角立杆，悬臂向南
  {
    const px = crossX - stop - 0.8, pz = zN - 1.1;
    pole(px, pz, H, 0.12);
    const armLen = laneW * 2.3;
    ctx.make.block(0.1, 0.14, armLen, metal, { x: px, y: armY, z: pz + armLen / 2 });
    ctx.wires.add([px, y0 + H - 1.4, pz], [px, armY + 0.05, pz + armLen * 0.6], { sag: 0.02, r: 0.025 });
    for (const k of [0.5, 1.5]) head(px, armY, zN + laneW * k, Math.PI / 2, true);
    head(px + 0.15, y0 + 3.6, pz, Math.PI / 2, false);
  }

  // 行人信号灯：两端各两台，面向对岸等候的行人
  const pedOn = { W: [], R: [] };
  const pedLights = [];
  const texW = pedTex(ctx, true), texR = pedTex(ctx, false);
  const ped = (x, z, ry) => {
    pole(x, z, 3.1, 0.06);
    const g = new THREE.Group(); g.position.set(x, y0 + 3.1, z); g.rotation.y = ry; S.add(g);
    const house = new THREE.Mesh(boxGeo(0.42, 0.84, 0.22), black); house.position.set(0, -0.2, 0.02); g.add(house);
    g.updateMatrixWorld(true);
    for (const [k, ly] of [['R', 0.42], ['W', 0.0]]) {
      const q = new THREE.PlaneGeometry(0.34, 0.34);
      tmp.position.set(0, ly, 0.135); tmp.updateMatrix();
      q.applyMatrix4(tmp.matrix); q.applyMatrix4(g.matrixWorld);
      pedOn[k].push(q);
      const off = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), offMat[k === 'R' ? 'R' : 'G']); off.position.set(0, ly, 0.132); g.add(off);
      lamps.push({ pos: new THREE.Vector3(0, ly, 0.2).applyMatrix4(g.matrixWorld), dx: Math.sin(ry), dz: Math.cos(ry),
        color: k === 'R' ? RED : GRN, size: 0.4, intensity: 0.4, on: t => pedSignal(t) === k });
    }
    pedLights.push(ctx.lights.add({ position: new THREE.Vector3(0, 0.2, 0.8).applyMatrix4(g.matrixWorld), color: RED, intensity: 0.6, radius: 4 }));
  };
  for (const sx of [-1, 1]) {
    ped(crossX + sx * 4.9, zN - 0.7, 0);     // 北端，朝南
    ped(crossX + sx * 4.9, zS + 0.7, Math.PI); // 南端，朝北
  }

  // 亮灯网格（动态：按状态切 visible）
  const onMesh = {};
  for (const k of ['R', 'Y', 'G']) {
    onMesh[k] = new THREE.Mesh(mergeGeometries(onGeo[k], false), mat.neon(neonCol[k], 5));
    onMesh[k].name = 'signal-' + k;
    ctx.dynamicRoot.add(onMesh[k]);
  }
  const pedMesh = {
    W: new THREE.Mesh(mergeGeometries(pedOn.W, false), mat.emissiveMap(texW, 3.2)),
    R: new THREE.Mesh(mergeGeometries(pedOn.R, false), mat.emissiveMap(texR, 3.2)),
  };
  for (const k in pedMesh) { pedMesh[k].name = 'pedsignal-' + k; ctx.dynamicRoot.add(pedMesh[k]); }

  const cRed = new THREE.Color(RED), cYel = new THREE.Color(YEL), cGrn = new THREE.Color(GRN);
  return {
    lamps,
    update(t) {
      const s = roadSignal(t);
      for (const k of ['R', 'Y', 'G']) {
        onMesh[k].visible = s === k;
      }
      for (const h of headLights) h.color.copy(s === 'R' ? cRed : s === 'Y' ? cYel : cGrn);
      const p = pedSignal(t);
      pedMesh.W.visible = p === 'W';
      pedMesh.R.visible = p === 'R';
      for (const h of pedLights) { h.color.copy(p === 'R' ? cRed : cGrn); h.intensity = p === 'off' ? 0 : 0.6; }
    },
  };
}
