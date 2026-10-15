// terrain —— 所有"地面"：坡顶广场、20 m 大阶梯与平台、两侧山体台地、坡底观景平台、挡墙、滨江路、江堤、全部路灯。
import * as THREE from 'three';

export function build(ctx) {
  const { L, mat, make, tex } = ctx;
  const rng = ctx.rng('terrain');
  const S = ctx.staticRoot;

  const pave = mat.std({ map: tex.paving('pave-a'), color: 0xffffff, roughness: 0.7 });
  const stepMat = mat.std({ map: tex.paving('step'), color: 0xe8e4e0, roughness: 0.65 });
  const asphalt = mat.surface('asphalt', { roughness: 0.75 });
  const curb = mat.surface('concrete', { roughness: 0.8 });
  const wallStone = mat.std({ map: tex.paving('wall'), color: 0xb0aca6, roughness: 0.9 });
  const hillMat = mat.surface('concreteDk');
  const metal = mat.surface('metalDk');
  const paint = mat.std({ color: 0x9a9890, roughness: 0.5 });
  const paintY = mat.std({ color: 0x9a7a2a, roughness: 0.5 });

  // ------------------------------------------------------------ 坡顶广场 + 街道
  const U = L.UPPER, UW = U.x1 - U.x0, UX = (U.x0 + U.x1) / 2;
  make.block(UW, 8, U.z1 - U.z0, pave, { x: UX, y: L.Y_UPPER - 8, z: (U.z0 + U.z1) / 2, uv: 3 });
  make.block(UW, 0.02, 7, asphalt, { x: UX, y: L.Y_UPPER, z: 5.5 });
  for (const z of [1.95, 9.05]) make.block(UW, 0.15, 0.25, curb, { x: UX, y: L.Y_UPPER, z });
  for (let x = U.x0 + 1; x < U.x1; x += 5) make.block(2.5, 0.025, 0.12, paint, { x, y: L.Y_UPPER, z: 5.5 });

  // ------------------------------------------------------------ 大阶梯
  const SW = L.STAIR.x1 - L.STAIR.x0;
  const RAILS = [-3.4, 3.4];
  for (const f of L.FLIGHTS) {
    if (f.type === 'landing') {
      make.block(SW, 1.4, f.z0 - f.z1, pave, { x: 0, y: f.y0 - 1.4, z: (f.z0 + f.z1) / 2, uv: 3 });
      continue;
    }
    for (let i = 0; i < f.steps; i++) {
      const top = f.y0 - (i + 1) * f.rise;
      const zc = f.z0 - (i + 0.5) * f.run;
      make.block(SW, f.rise + 0.6, f.run + 0.02, stepMat, { x: 0, y: top - f.rise - 0.6, z: zc, uv: 2 });
    }
    // 两条分道扶手：立柱 + 顺坡扶手
    const len = f.z0 - f.z1, drop = f.y0 - f.y1;
    const slope = Math.atan2(drop, len), railLen = Math.hypot(len, drop);
    for (const rx of RAILS) {
      for (let d = 0.3; d < len; d += 1.7) {
        const z = f.z0 - d;
        make.block(0.06, 1.0, 0.06, metal, { x: rx, y: L.stairHeightAt(z), z });
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, railLen), metal);
      rail.position.set(rx, (f.y0 + f.y1) / 2 + 1.0 - f.rise / 2, (f.z0 + f.z1) / 2);
      rail.rotation.x = -slope;
      S.add(rail);
      // 扶手碰撞：顺坡按 ~1 m 分段（整段一个 AABB 会挡住低处的人或放过高处的人）
      for (let d = 0; d < len - 1e-3; d += 1.0) {
        const za = f.z0 - d, zb = Math.max(f.z1, f.z0 - d - 1.0);
        const yHi = L.stairHeightAt(za - 1e-3), yLo = L.stairHeightAt(zb + 1e-3);
        ctx.physics.addBox(rx - 0.06, zb, rx + 0.06, za, yHi + 1.05, yLo - 0.1);
      }
    }
    // 两侧石砌边墙压顶
    for (const s of [-1, 1]) {
      const cop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, railLen), curb);
      cop.position.set(s * (L.STAIR.x1 - 0.25), (f.y0 + f.y1) / 2 + 0.25 - f.rise / 2, (f.z0 + f.z1) / 2);
      cop.rotation.x = -slope;
      S.add(cop);
    }
  }

  // ------------------------------------------------------------ 两侧山体台地（楼与山坡街区的地基）
  // 外缘止于后山梯道（districts）之前：梯道自带基础，不受台地逐级高差约束
  const hillA1 = L.DISTRICTS ? L.DISTRICTS.hill.path.a0 - 0.1 : 110;
  for (const s of [-1, 1]) {
    for (let z0 = L.STAIR.zTop; z0 > L.STAIR.zBottom; z0 -= 8) {
      const z1 = Math.max(L.STAIR.zBottom, z0 - 8);
      const top = L.stairHeightAt(z1);
      make.block(hillA1 - 10, top - (L.Y_LOWER - 6), z0 - z1, hillMat, { x: s * (10 + hillA1) / 2, y: L.Y_LOWER - 6, z: (z0 + z1) / 2, solid: true });
    }
  }

  // ------------------------------------------------------------ 坡底观景平台
  const P = L.PLAZA;
  const pit = L.EXPLORATION.stairwell, door = L.EXPLORATION.door;
  const platform = (x0,x1,z0,z1,top = P.y) => make.block(x1-x0,top+1,z0-z1,pave,
    { x:(x0+x1)/2,y:-1,z:(z0+z1)/2,uv:3 });
  platform(P.x0,pit.x0,P.z0,P.z1);
  platform(pit.x1,P.x1,P.z0,P.z1);
  platform(pit.x0,pit.x1,P.z0,pit.z0);
  platform(pit.x0,L.EXPLORATION.descent.x0,pit.z0,pit.z1);
  platform(L.EXPLORATION.descent.x0,pit.x1,pit.z0,pit.z1,0);
  for (const s of [-1, 1]) make.block(340, 10, P.z0 - P.z1, hillMat, { x: s * (P.x1 + 170), y: P.y - 10, z: (P.z0 + P.z1) / 2 });
  const edgeZ = L.WALL.z0 + 0.3;
  for (const [x0,x1] of [[P.x0,door.x0],[door.x1,P.x1]]) {
    for (let x = x0 + 0.5; x <= x1; x += 2.0) make.block(0.08, 1.1, 0.08, metal, { x, y: P.y, z: edgeZ });
    for (const y of [0.55, 1.1]) make.block(x1-x0, 0.06, 0.06, metal, { x:(x0+x1)/2, y: P.y + y, z: edgeZ });
    ctx.physics.addBox(x0,L.WALL.z1,x1,edgeZ+0.1,P.y+1.2,P.y-0.1);
  }

  // ------------------------------------------------------------ 挡墙（平台 → 滨江路）
  for (const [x0,x1] of [[-410,door.x0],[door.x1,410]]) {
    make.block(x1-x0,L.Y_LOWER+0.2,L.WALL.z0-L.WALL.z1,wallStone,
      {x:(x0+x1)/2,y:-0.2,z:(L.WALL.z0+L.WALL.z1)/2,uv:4,solid:true});
  }
  make.block(door.x1-door.x0,7,L.WALL.z0-L.WALL.z1,wallStone,
    {x:(door.x0+door.x1)/2,y:3,z:(L.WALL.z0+L.WALL.z1)/2,uv:4,solid:true});
  for (let x = -120; x < 120; x += 4.5) {
    make.block(0.25, 0.25, 0.1, mat.std({ color: 0x050506 }), { x, y: L.Y_ROAD + 5, z: L.WALL.z1 - 0.05 });
  }

  // ------------------------------------------------------------ 滨江路
  const R = L.ROAD, RL = R.x1 - R.x0, RX = (R.x0 + R.x1) / 2;
  const roadZ0 = R.z0 - R.sidewalkS, roadZ1 = R.z1 + R.sidewalkN;
  make.block(RL, 3, roadZ0 - roadZ1, asphalt, { x: RX, y: R.y - 3, z: (roadZ0 + roadZ1) / 2 });
  for (const [z0, z1] of [[R.z0, roadZ0], [roadZ1, R.z1]]) {
    make.block(RL, 3.15, z0 - z1, pave, { x: RX, y: R.y - 3, z: (z0 + z1) / 2, uv: 3 });
    make.block(RL, 0.16, 0.22, curb, { x: RX, y: R.y, z: z0 === R.z0 ? roadZ0 + 0.11 : roadZ1 - 0.11 });
  }
  const mid = (roadZ0 + roadZ1) / 2;
  for (const dz of [-0.12, 0.12]) make.block(RL, 0.02, 0.1, paintY, { x: RX, y: R.y, z: mid + dz });
  for (const lz of [(roadZ0 + mid) / 2, (roadZ1 + mid) / 2]) {
    for (let x = R.x0 + 2; x < R.x1; x += 9) make.block(4, 0.02, 0.12, paint, { x, y: R.y, z: lz });
  }
  for (let x = -34; x <= -26; x += 1.0) make.block(0.5, 0.02, roadZ0 - roadZ1 - 1, paint, { x, y: R.y, z: mid });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 16), metal);
    m.position.set(rng.range(-80, 80), R.y + 0.01, rng.range(roadZ1 + 1, roadZ0 - 1));
    S.add(m);
  }

  // ------------------------------------------------------------ 江堤
  make.block(820, 12, 1.2, wallStone, { x: 0, y: L.Y_RIVER - 8, z: L.RIVER.zEdge - 0.6, uv: 4 });
  make.block(820, 7.15, R.z1 - L.RIVER.zEdge + 0.01, pave, { x: 0, y: R.y - 7, z: (R.z1 + L.RIVER.zEdge) / 2, uv: 3 });
  // 江边栏杆与防落水碰撞：在趸船跳板处断开（districts 模块建跳板与趸船）
  const gw = L.DISTRICTS?.river?.gangway;
  const gap = gw ? [gw.x0 - 0.1, gw.x1 + 0.1] : [1e9, 1e9];
  for (let x = -200; x <= 200; x += 2.2) if (x < gap[0] || x > gap[1]) make.block(0.08, 1.1, 0.08, metal, { x, y: R.y + 0.15, z: L.RIVER.zEdge + 0.3 });
  for (const [x0, x1] of gw ? [[-200, gap[0]], [gap[1], 200]] : [[-200, 200]]) {
    for (const y of [0.55, 1.1]) make.block(x1 - x0, 0.06, 0.06, metal, { x: (x0 + x1) / 2, y: R.y + 0.15 + y, z: L.RIVER.zEdge + 0.3 });
  }
  for (const [x0, x1] of gw ? [[-410, gap[0]], [gap[1], 410]] : [[-410, 410]]) ctx.physics.addBox(x0, L.RIVER.zEdge - 2, x1, L.RIVER.zEdge + 0.4, 999);

  // ------------------------------------------------------------ 路灯
  const lamp = (x, z, dir, { h = 5.2, arm = 1.2, color = 0xffa850, intensity = 2.4, radius = 12 } = {}) => {
    const g = L.heightAt(x, z);
    make.block(0.14, h, 0.14, metal, { x, y: g, z });
    const hx = x + dir * arm;
    if (arm) make.block(Math.abs(arm) + 0.1, 0.08, 0.1, metal, { x: (x + hx) / 2, y: g + h - 0.1, z });
    make.block(0.55, 0.12, 0.3, mat.neon(color, 4), { x: hx, y: g + h - 0.25, z });
    make.block(0.6, 0.12, 0.34, metal, { x: hx, y: g + h - 0.15, z });
    make.lightCone({ pos: [hx, g + h - 0.3, z], length: h - 0.4, radius: 2.1, color, intensity: 0.08 });
    ctx.lights.add({ position: [hx, g + h - 0.6, z], color, intensity, radius });
    ctx.halos.add({ position: [hx, g + h - 0.35, z], color, size: 2.8, intensity: 0.7 });
  };
  for (const f of L.FLIGHTS) {
    if (f.type !== 'landing' || f.z0 - f.z1 < 3) continue;
    for (const s of [-1, 1]) lamp(s * 8.6, (f.z0 + f.z1) / 2, -s, { h: 5.5, arm: 1.0 });
  }
  for (const x of [-30, -14, 14, 30]) lamp(x, -6.8, 0, { h: 6.5, arm: 0 });
  for (const x of [-38, 38]) lamp(x, 28, 0, { h: 5.2, arm: 0, intensity: 4, radius: 18 });
  for (const x of [-48, -24, 24, 48]) lamp(x, L.WALL.z0 + 1.2, 0, { h: 5, arm: 0, color: 0xdfe8ff, intensity: 2 });
  for (const x of [-90, -60, -30, 0, 30, 60, 90]) lamp(x, R.z1 + 1.0, 0, { h: 8, arm: 0, color: 0xdfe8ff, radius: 14 });
}
