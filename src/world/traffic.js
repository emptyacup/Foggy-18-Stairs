// traffic —— 滨江路双向 4 车道 + 上半城街单车道的车流、车灯（光场 + 眩光 + 雨中光柱）、斑马线红绿灯、中央隔离栏。
// 车流：构建时离线仿真（跟车 + 红灯排队），运行时按 t 查表 → 位置只由时间决定。
// 渲染：每种车型的每个部件一个 InstancedMesh（车漆、车灯亮度走 instanceColor），总共 ~40 个 draw call。
import * as THREE from 'three';

// 色值 → 线性颜色缓存：热路径里每帧大量 Color.set(hex) 会反复做 sRGB→线性转换（性能整合时加）
const _colorCache = new Map();
function cachedColor(hex) {
  let c = _colorCache.get(hex);
  if (!c) { c = new THREE.Color(hex); _colorCache.set(hex, c); }
  return c;
}
import { carTypes, PAINTS } from './lib/traffic-cars.js';
import { simulateLane, sampleTrack } from './lib/traffic-sim.js';
import { buildSignals, roadSignal, crossingX } from './lib/traffic-signals.js';

const HEAD_COL = 0xfff0d8, LED_COL = 0xe4eeff, TAIL_COL = 0xff2418;
const N_HEAD_LIGHTS = 20, N_TAIL_LIGHTS = 16;

export function build(ctx) {
  const { L } = ctx;
  const rng = ctx.rng('traffic');
  const T = carTypes(ctx);
  const R = L.ROAD;
  const P = L.LOOP;
  const zS = R.z0 - R.sidewalkS, zN = R.z1 + R.sidewalkN;
  const laneW = (zS - zN) / R.lanes;
  const X0 = R.x0, X1 = R.x1, LEN = X1 - X0;
  const CROSS = crossingX(L), STOP = 5.6; // 停止线距斑马线中心的距离
  const upperZ0 = L.UPPER.z1 - 8, upperZ1 = L.UPPER.z1 - 1;

  // ------------------------------------------------------------ 车道 & 时刻表
  const MIX_OUT = [['sedan', 3], ['taxi', 3.2], ['suv', 1.4], ['van', 1.6], ['bus', 0.9], ['moto', 1.8]];
  const MIX_IN = [['sedan', 3], ['taxi', 2.5], ['suv', 2], ['van', 0.6]];
  const lanes = [
    { z: zS - laneW * 0.5, dir: 1, v0: 10.5, head: 4.4, mix: MIX_OUT },
    { z: zS - laneW * 1.5, dir: 1, v0: 13, head: 4.8, mix: MIX_IN },
    { z: zS - laneW * 2.5, dir: -1, v0: 13.5, head: 4.6, mix: MIX_IN },
    { z: zS - laneW * 3.5, dir: -1, v0: 10, head: 4.2, mix: MIX_OUT },
  ].map(l => ({ ...l, y: R.y, x0: l.dir > 0 ? X0 : X1, length: LEN,
    stopS: l.dir > 0 ? CROSS - STOP - X0 : X1 - CROSS - STOP, signal: roadSignal }));
  // 上半城街：单向西行、无信号；车慢、车少
  lanes.push({ z: upperZ0 + 1.65, dir: -1, v0: 7.5, head: 13, y: L.Y_UPPER,
    x0: L.UPPER.x1 - 5, length: L.UPPER.x1 - L.UPPER.x0 - 10, stopS: null,
    mix: [['sedan', 2], ['taxi', 2], ['van', 1.5], ['moto', 2], ['suv', 1]] });

  const slots = [];   // 每个 slot = 一辆车（实例）
  for (const [li, lane] of lanes.entries()) {
    const ls = [];
    let e = rng.range(0, lane.head);
    while (e < P - 1.5) {
      const type = rng.weighted(lane.mix);
      ls.push({ entry: e, type, len: T[type].length, v0: lane.v0 * (type === 'bus' ? 0.85 : type === 'moto' ? 0.9 : rng.range(0.9, 1.08)) });
      e += lane.head * rng.range(0.5, 1.5) + (type === 'bus' ? 2 : 0);
    }
    const tracks = simulateLane(lane, ls, P);
    ls.forEach((s, k) => slots.push({ ...s, lane, li, track: tracks[k] }));
  }
  // 上半城街路边停的车（静止、熄火）
  for (const [x, type] of [[-31, 'sedan'], [-25.5, 'van'], [-15, 'taxi'], [17, 'suv'], [23, 'sedan'], [33, 'sedan']]) {
    slots.push({ type, parked: { x, y: L.Y_UPPER, z: upperZ1 - 1.4, ry: Math.PI + rng.range(-0.03, 0.03) } });
  }

  // ------------------------------------------------------------ 实例化网格
  const byType = {};
  for (const s of slots) (byType[s.type] ||= []).push(s);
  const meshes = [];
  const white = new THREE.Color(1, 1, 1);
  for (const [type, list] of Object.entries(byType)) {
    const def = T[type];
    list.forEach((s, i) => { s.idx = i; s.def = def; s.paint = new THREE.Color(rng.pick(PAINTS[type])); });
    for (const part of def.parts) {
      const m = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      m.name = `car-${type}-${part.key}`;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (part.inst) {
        for (let i = 0; i < list.length; i++) m.setColorAt(i, part.inst === 'body' ? list[i].paint : white);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      ctx.dynamicRoot.add(m);
      meshes.push({ m, part, type, list });
    }
  }

  // ------------------------------------------------------------ 车灯眩光（相机朝向的光斑 + 横向拉丝）与雨中光柱
  const sig = buildSignals(ctx, { zS, zN, stop: STOP, crossX: CROSS });
  const fogD = ctx.scene.fog?.density ?? 0.012;
  const nFlare = slots.reduce((n, s) => n + s.def.headPts.length + s.def.tailPts.length, 0) + sig.lamps.length;
  const flares = makeFlares(ctx, nFlare, fogD);
  const nBeam = slots.reduce((n, s) => n + s.def.headPts.length, 0);
  const beams = makeBeams(ctx, nBeam, fogD);

  // ------------------------------------------------------------ 光场灯池（只给离镜头近的车）
  const headPool = Array.from({ length: N_HEAD_LIGHTS }, () => ctx.lights.add({ position: [0, -50, 0], color: HEAD_COL, intensity: 0, radius: 11 }));
  const tailPool = Array.from({ length: N_TAIL_LIGHTS }, () => ctx.lights.add({ position: [0, -50, 0], color: TAIL_COL, intensity: 0, radius: 5 }));
  const busPool = Array.from({ length: 2 }, () => ctx.lights.add({ position: [0, -50, 0], color: 0xd8ffe8, intensity: 0, radius: 7 }));

  // ------------------------------------------------------------ 红绿灯 + 隔离栏（静态）
  buildBarrier(ctx, { z: (zS + zN) / 2, gap: STOP + 2, crossX: CROSS, x0: X0 + 2, x1: X1 - 2, y: R.y });

  // ------------------------------------------------------------ 每帧
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(CROSS, -100, (zS + zN) / 2);
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpC = new THREE.Color();
  const live = [];

  function pose(s, t) {
    if (s.parked) return { x: s.parked.x, y: s.parked.y, z: s.parked.z, ry: s.parked.ry, v: 0, a: 0, on: false, fade: 1 };
    const q = sampleTrack(s.track, s.entry, t, P);
    if (!q || q.s < 0 || q.s > s.lane.length + s.len) return null;
    const l = s.lane;
    const xf = l.x0 + l.dir * q.s;                 // 车头 x
    const x = xf - l.dir * s.len / 2;              // 车中心
    const edge = Math.min(q.s, l.length - q.s + s.len);
    const fade = THREE.MathUtils.clamp(edge / 18, 0, 1);
    return { x, y: l.y, z: l.z, ry: l.dir > 0 ? 0 : Math.PI, v: q.v, a: q.a, on: true, fade };
  }

  const update = (dt, t) => {
    live.length = 0;
    let fi = 0, bi = 0;
    for (const s of slots) {
      const p = pose(s, t);
      s.p = p;
      if (!p) continue;
      live.push(s);
      // 刹车：减速或停车时尾灯更亮
      s.brake = p.on && (p.a < -0.6 || p.v < 0.8) ? 1 : 0;
    }
    // 实例矩阵 / 颜色
    for (const { m, part, list } of meshes) {
      for (let i = 0; i < list.length; i++) {
        const s = list[i], p = s.p;
        if (!p) { m.setMatrixAt(i, ZERO); continue; }
        Q.setFromAxisAngle(UP, p.ry);
        V.set(p.x, p.y, p.z);
        m.setMatrixAt(i, M4.compose(V, Q, S1));
        if (part.inst === 'head') m.setColorAt(i, tmpC.setScalar(p.on ? p.fade : 0.02));
        else if (part.inst === 'tail') m.setColorAt(i, tmpC.setScalar(p.on ? p.fade * (s.brake ? 1.9 : 0.85) : 0.05));
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // 眩光 + 光柱
    for (const s of slots) {
      const p = s.p, d = s.def;
      const cos = p ? Math.cos(p.ry) : 1, sin = p ? Math.sin(p.ry) : 0;
      const led = s.type === 'suv' || s.type === 'moto';
      for (const [hx, hy, hz] of d.headPts) {
        if (p && p.on) {
          const wx = p.x + hx * cos + hz * sin, wz = p.z - hx * sin + hz * cos;
          flares.set(fi++, wx, p.y + hy, wz, cos, -sin, led ? LED_COL : HEAD_COL, 0.55 * p.fade, s.type === 'moto' ? 0.9 : 1.15);
          beams.set(bi++, wx, p.y + hy, wz, p.ry, s.type === 'bus' ? 1.2 : 1, (led ? 0.11 : 0.1) * p.fade, led ? LED_COL : HEAD_COL);
        } else { flares.hide(fi++); beams.hide(bi++); }
      }
      for (const [hx, hy, hz] of d.tailPts) {
        if (p && p.on) {
          const wx = p.x + hx * cos + hz * sin, wz = p.z - hx * sin + hz * cos;
          flares.set(fi++, wx, p.y + hy, wz, -cos, sin, TAIL_COL, (s.brake ? 0.5 : 0.22) * p.fade, s.brake ? 0.9 : 0.6);
        } else flares.hide(fi++);
      }
    }
    for (const l of sig.lamps) {
      if (l.on(t)) flares.set(fi++, l.pos.x, l.pos.y, l.pos.z, l.dx, l.dz, l.color, l.intensity, l.size);
      else flares.hide(fi++);
    }
    flares.commit(); beams.commit();

    // 光场灯池：按离"关注点"（梯坎底斑马线、滨江路机位）的距离分配
    const moving = live.filter(s => s.p.on);
    for (const s of moving) {
      const x = s.p.x, z = s.p.z;
      s.prio = Math.min(Math.hypot(x - CROSS, z - (zS + zN) / 2),
        Math.hypot(x - L.CAMS.road[0], z - L.CAMS.road[2]) * 0.9,
        Math.hypot(x, z - (upperZ0 + upperZ1) / 2) + 6);
    }
    moving.sort((a, b) => a.prio - b.prio);
    for (let i = 0; i < headPool.length; i++) {
      const h = headPool[i], s = moving[i];
      if (!s) { h.intensity = 0; continue; }
      const p = s.p, fx = Math.cos(p.ry), fz = -Math.sin(p.ry);
      const ahead = s.len / 2 + 3.2;
      h.position.set(p.x + fx * ahead, p.y + 0.9, p.z + fz * ahead);
      h.intensity = (s.type === 'moto' ? 1.2 : 2.4) * p.fade;
      h.radius = s.type === 'moto' ? 7 : 11;
    }
    for (let i = 0; i < tailPool.length; i++) {
      const h = tailPool[i], s = moving[i];
      if (!s) { h.intensity = 0; continue; }
      const p = s.p, fx = Math.cos(p.ry), fz = -Math.sin(p.ry);
      const back = s.len / 2 + 0.7;
      h.position.set(p.x - fx * back, p.y + 0.7, p.z - fz * back);
      h.intensity = (s.brake ? 1.5 : 0.6) * p.fade;
    }
    const buses = moving.filter(s => s.type === 'bus');
    for (let i = 0; i < busPool.length; i++) {
      const h = busPool[i], s = buses[i];
      if (!s) { h.intensity = 0; continue; }
      h.position.set(s.p.x, s.p.y + 2.0, s.p.z);
      h.intensity = 1.6 * s.p.fade;
    }

    sig.update(t);
  };
  ctx.onUpdate(update);
  update(0, 0);

}

// ------------------------------------------------------------ 中央隔离栏：镂空格栅（alphaTest）+ 立柱 + 反光贴
function buildBarrier(ctx, { z, gap, crossX, x0, x1, y }) {
  const { mat, tex } = ctx;
  const grille = mat.std({ map: tex.grille({ bars: 10, rails: 2, thick: 4 }), color: 0x7a7e84, roughness: 0.55, metalness: 0.3, alphaTest: 0.5, side: THREE.DoubleSide, wet: 0.6 });
  const post = mat.std({ color: 0x6e7078, roughness: 0.5, metalness: 0.4, wet: 0.6 });
  const refl = mat.std({ color: 0xb08a1c, roughness: 0.2, metalness: 0.6, wet: 0.2 });
  const H = 0.95;
  for (const [a, b] of [[x0, crossX - gap], [crossX + gap, x1]]) {
    const len = b - a;
    const g = new THREE.PlaneGeometry(len, H - 0.12);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2);
    const m = new THREE.Mesh(g, grille);
    m.position.set((a + b) / 2, y + 0.12 + (H - 0.12) / 2, z);
    ctx.staticRoot.add(m);
    ctx.make.block(len, 0.05, 0.06, post, { x: (a + b) / 2, y: y + H, z });
    ctx.make.block(len, 0.12, 0.25, ctx.mat.surface('concreteDk'), { x: (a + b) / 2, y, z });
    for (let x = a + 1; x < b; x += 2.4) {
      ctx.make.block(0.07, H + 0.08, 0.07, post, { x, y, z });
      ctx.make.block(0.1, 0.16, 0.08, refl, { x, y: y + H - 0.3, z });
    }
  }
}

// ------------------------------------------------------------ 眩光：实例化 billboard（位置每帧更新），带朝向衰减与横向拉丝
function makeFlares(ctx, n, fogD) {
  const hiddenZ = (ctx.L.ROAD.z0 + ctx.L.ROAD.z1) / 2;
  const geo = new THREE.PlaneGeometry(1, 1);
  const aCol = new Float32Array(n * 3), aSize = new Float32Array(n), aDir = new Float32Array(n * 3);
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(aDir, 3).setUsage(THREE.DynamicDrawUsage));
  const m = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uFog: { value: fogD } },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aSize; attribute vec3 aDir;
      varying vec2 vUv; varying vec3 vCol;
      uniform float uFog;
      void main(){
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float d = max(-mv.z, 0.01);
        vec3 toCam = normalize(cameraPosition - c);
        float facing = dot(normalize(aDir + vec3(0.0, 1e-4, 0.0)), toCam);
        float k = 0.08 + 0.92 * smoothstep(-0.05, 0.75, facing);
        float sz = aSize * (1.0 + d * 0.012);
        mv.xy += position.xy * vec2(sz * 3.2, sz);
        mv.z += min(sz * 0.6, d * 0.5);
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        float fog = exp(-d * uFog * 0.5);
        vCol = aCol * k * fog * smoothstep(0.3, 2.0, d);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vCol;
      void main(){
        vec2 p = (vUv - 0.5) * vec2(3.2, 1.0) * 2.0;
        float r2 = dot(p, p);
        float a = exp(-r2 * 7.0) * 0.7 + exp(-r2 * 70.0) * 2.2;
        a += exp(-p.y * p.y * 260.0) * exp(-abs(p.x) * 1.6) * 0.45;   // 横向拉丝
        a *= smoothstep(1.0, 0.85, abs(p.y));
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const mesh = new THREE.InstancedMesh(geo, m, n);
  mesh.name = 'car-flares';
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.noBatch = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const M4 = new THREE.Matrix4(), C = new THREE.Color();
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, M4.makeTranslation(0, -100, hiddenZ));
  ctx.dynamicRoot.add(mesh);
  return {
    set(i, x, y, z, dx, dz, color, intensity, size) {
      mesh.setMatrixAt(i, M4.makeTranslation(x, y, z));
      const Cc = typeof color === 'number' ? cachedColor(color) : C.set(color);
      aCol[i * 3] = Cc.r * intensity; aCol[i * 3 + 1] = Cc.g * intensity; aCol[i * 3 + 2] = Cc.b * intensity;
      aSize[i] = size; aDir[i * 3] = dx; aDir[i * 3 + 1] = 0; aDir[i * 3 + 2] = dz;
    },
    hide(i) { aSize[i] = 0; aCol[i * 3] = aCol[i * 3 + 1] = aCol[i * 3 + 2] = 0; mesh.setMatrixAt(i, M4.makeTranslation(0, -100, hiddenZ)); },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      for (const k of ['aCol', 'aSize', 'aDir']) geo.attributes[k].needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------ 车灯光柱：雨雾中的体积光锥（实例化，加法混合）
function makeBeams(ctx, n, fogD) {
  const geo = new THREE.ConeGeometry(1, 1, 14, 1, true);
  geo.translate(0, -0.5, 0);                              // 尖端在原点，向 -Y 张开
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setY(i, -pos.getY(i));
  geo.rotateZ(Math.PI / 2);                               // 改为向 +X 张开
  const aCol = new Float32Array(n * 3);
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3).setUsage(THREE.DynamicDrawUsage));
  const m = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uFog: { value: fogD }, uTime: ctx.shared.uTime },
    vertexShader: /* glsl */`
      attribute vec3 aCol;
      varying vec3 vCol; varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      uniform float uFog;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vT = uv.y; vW = wp.xyz;
        float d = length(cameraPosition - wp.xyz);
        vCol = aCol * exp(-d * uFog * 0.6);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      uniform float uTime;
      void main(){
        float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.4);
        float t = clamp(vT, 0.0, 1.0);
        float along = pow(1.0 - t, 1.6) * smoothstep(0.0, 0.04, t);
        // 雨丝穿过光柱：沿竖向流动的细纹
        float rain = 0.85 + 0.15 * sin(vW.x * 5.0 + vW.z * 3.0 + vW.y * 2.0 + uTime * 6.0);
        gl_FragColor = vec4(vCol * edge * along * rain, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const mesh = new THREE.InstancedMesh(geo, m, n);
  mesh.name = 'car-beams';
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.userData.noBatch = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -100, (ctx.L.ROAD.z0 + ctx.L.ROAD.z1) / 2);
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, HIDE);
  ctx.dynamicRoot.add(mesh);
  return {
    // 光柱沿车头方向（ry）略向下打
    set(i, x, y, z, ry, scale, intensity, color) {
      E.set(0, ry, -0.07, 'YXZ'); Q.setFromEuler(E);
      const len = 11 * scale, rad = 1.5 * scale;
      M4.compose(V.set(x, y, z), Q, S.set(len, rad, rad * 0.8));
      mesh.setMatrixAt(i, M4);
      const Cc = typeof color === 'number' ? cachedColor(color) : C.set(color);
      aCol[i * 3] = Cc.r * intensity; aCol[i * 3 + 1] = Cc.g * intensity; aCol[i * 3 + 2] = Cc.b * intensity;
    },
    hide(i) { mesh.setMatrixAt(i, HIDE); aCol[i * 3] = aCol[i * 3 + 1] = aCol[i * 3 + 2] = 0; },
    commit() { mesh.instanceMatrix.needsUpdate = true; geo.attributes.aCol.needsUpdate = true; },
  };
}
