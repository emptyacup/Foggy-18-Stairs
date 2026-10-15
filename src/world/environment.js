// environment —— 远景：江对岸天际线（含 LED 灯光秀楼）、两岸楼群、江面、跨江大桥、江面倒影光带。
// 所有远景都是 InstancedMesh + 程序化窗户 shader，几乎不占预算。
import * as THREE from 'three';
import { NEON } from '../core/palette.js';

export function build(ctx) {
  const { L, mat, rng: mkRng } = ctx;
  const rng = mkRng('skyline');
  const fog = ctx.scene.fog;

  // ------------------------------------------------------------ 天际线楼群
  const towers = [];
  const addTower = (x, z, w, d, h, led = 0) => towers.push({ x, z, w, d, h, led, seed: rng(), lit: rng.range(0.12, 0.4), hue: rng() });
  // 巨构城之后的天际线填充，避免旧楼群挡住巨屏和江面全息体。
  const far = L.MEGA.zFar;
  for (const [zA, zB, hMin, hMax, n] of [[far - 50, far - 180, 40, 140, 70], [far - 180, far - 360, 80, 230, 90], [far - 360, far - 600, 60, 180, 80]]) {
    for (let i = 0; i < n; i++) {
      const x = rng.range(-900, 900);
      const h = rng() < 0.12 ? rng.range(hMax, hMax * 1.5) : rng.range(hMin, hMax);
      addTower(x, rng.range(zB, zA), rng.range(18, 40), rng.range(18, 40), h, rng() < 0.18 ? 1 : 0);
    }
  }
  // 本岸两侧沿江楼群（梯坎街区之外）
  for (let i = 0; i < 70; i++) {
    const side = rng.sign();
    const z = rng.range(-60, L.MEGA.holo.z);
    // 保留两岸楼群，但从 hero / terrace 看，把江心与全息巨人留在楼群之间。
    const x = side * rng.range(Math.max(105, (L.CAMS.hero[2] - z) * 0.75), 420);
    addTower(x, z, rng.range(16, 30), rng.range(16, 30), rng.range(40, 120), rng() < 0.1 ? 1 : 0);
  }
  // 身后（南）山城高处
  for (let i = 0; i < 40; i++) addTower(rng.range(-500, 500), rng.range(60, 300), rng.range(16, 30), rng.range(16, 30), rng.range(50, 130));

  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const skyMat = mat.custom(new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.shared.uTime, uFogColor: { value: fog.color }, uFogDensity: { value: fog.density },
    },
    vertexShader: /* glsl */`
      attribute vec4 aInfo;
      varying vec3 vW; varying vec3 vN; varying vec4 vInfo;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vInfo = aInfo;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying vec4 vInfo;
      uniform float uTime, uFogDensity; uniform vec3 uFogColor;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 col = vec3(0.010, 0.010, 0.016);
        if (abs(vN.y) < 0.5) {
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          vec2 g = vec2(u / 3.6, vW.y / 3.3);
          vec2 cell = floor(g), f = fract(g);
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.28, f.y) * step(f.y, 0.78);
          float r = h(cell + vInfo.x * 91.7);
          float lit = step(r, vInfo.z * (0.6 + 0.8 * h(vec2(cell.y, vInfo.x))));
          vec3 wc = mix(vec3(1.0, 0.66, 0.36), vec3(0.7, 0.85, 1.0), step(0.72, h(cell * 1.7 + vInfo.x)));
          col += win * lit * wc * (0.5 + 1.2 * h(cell + 3.1));
          if (vInfo.y > 0.5) {
            float band = 0.5 + 0.5 * sin(vW.y * 0.09 - uTime * 1.2 + vInfo.x * 40.0 + u * 0.02);
            vec3 hue = 0.5 + 0.5 * cos(6.2831 * (vInfo.w + vec3(0.0, 0.33, 0.67)) + uTime * 0.15);
            col += hue * pow(band, 4.0) * 3.0;
            col += hue * 0.25;
          }
        }
        float d = length(vW - cameraPosition);
        float fd = uFogDensity * 0.34 * d;
        col = mix(col, uFogColor, 1.0 - exp(-fd * fd));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const inst = new THREE.InstancedMesh(box, skyMat, towers.length);
  const info = new Float32Array(towers.length * 4);
  const m4 = new THREE.Matrix4();
  towers.forEach((t, i) => {
    const y = t.z > 0 ? L.Y_UPPER + 6 : t.z > L.RIVER.zEdge ? L.Y_LOWER : L.Y_RIVER + 2;
    m4.compose(new THREE.Vector3(t.x, y, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(-0.2, 0.2)), new THREE.Vector3(t.w, t.h, t.d));
    inst.setMatrixAt(i, m4);
    info.set([t.seed, t.led, t.lit, t.hue], i * 4);
    t.y = y;
  });
  box.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  inst.name = 'skyline';
  inst.userData.noBatch = true;
  ctx.staticRoot.add(inst);

  // 高楼顶航空障碍灯（红色，闪烁）
  const beacons = [];
  for (const t of towers) {
    if (t.h > 150 && t.z < -300) beacons.push(ctx.halos.add({ position: [t.x, t.y + t.h + 1, t.z], color: 0xff2020, size: 14, intensity: 0.0 }));
  }
  ctx.onUpdate((dt, time) => {
    const on = (time % 2.0) < 0.25 ? 1.6 : 0.0;
    for (const b of beacons) b.intensity = on;
  });

  // ------------------------------------------------------------ 江面
  const riverZ0 = L.RIVER.zEdge - 4;
  const river = new THREE.Mesh(new THREE.PlaneGeometry(3000, 900), mat.std({ color: 0x07090d, roughness: 0.06, metalness: 0.0, wet: 1 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, L.Y_RIVER, riverZ0 - 450);
  river.name = 'river';
  ctx.staticRoot.add(river);

  // 江面倒影光带：远处亮源在水面拉出的竖向光柱
  const streakSrc = [];
  for (const t of towers) if (t.z < -360 && (t.led || rng() < 0.25)) streakSrc.push({ x: t.x, z: t.z, w: t.w * 0.7, hue: t.led ? t.hue : -1 });
  const streakGeo = new THREE.PlaneGeometry(1, 1);
  const streakMat = mat.custom(new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.shared.uTime },
    vertexShader: /* glsl */`
      attribute vec4 aS; varying vec2 vUv; varying vec4 vS;
      void main(){ vUv = uv; vS = aS; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec4 vS; uniform float uTime;
      float h(float x){ return fract(sin(x * 91.3) * 43758.5); }
      void main(){
        float x = abs(vUv.x - 0.5) * 2.0;
        float along = vUv.y;                                   // 1 = 光源端
        float rip = 0.6 + 0.4 * sin(along * 140.0 + uTime * 3.0 + vS.x * 10.0);
        float br = floor(along * 60.0); float gap = step(0.35, h(br + floor(uTime * 4.0) + vS.x * 7.0));
        float a = (1.0 - x * x) * pow(along, 1.5) * rip * gap;
        vec3 c = vS.w < 0.0 ? vec3(1.0, 0.62, 0.32) : 0.5 + 0.5 * cos(6.2831 * (vS.w + vec3(0.0, 0.33, 0.67)) + uTime * 0.15);
        gl_FragColor = vec4(c * a * 0.55, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, streakSrc.length);
  const sAttr = new Float32Array(streakSrc.length * 4);
  streakSrc.forEach((s, i) => {
    // 天际线已移到巨构后方，光带仍落在本岸与巨构城之间的实际江段。
    const len = Math.min(rng.range(120, 260), L.RIVER.zEdge - L.MEGA.zNear - 8);
    m4.compose(new THREE.Vector3(s.x, L.Y_RIVER + 0.05, L.MEGA.zNear + 2 + len / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(s.w, len, 1));
    streaks.setMatrixAt(i, m4);
    sAttr.set([rng(), 0, 0, s.hue], i * 4);
  });
  streakGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(sAttr, 4));
  streaks.name = 'riverStreaks';
  streaks.userData.noBatch = true;
  streaks.renderOrder = 5;
  ctx.staticRoot.add(streaks);

  // ------------------------------------------------------------ 跨江大桥（斜拉桥）
  const BZ = -330, BY = 26, BX = 760;
  const deckMat = mat.surface('concreteDk', { wet: 0.3 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(BX * 2, 2.2, 22), deckMat);
  deck.position.set(0, BY - 1.1, BZ);
  ctx.staticRoot.add(deck);
  const edgeMat = mat.neon(NEON.amber, 2.5);
  for (const dz of [-11.2, 11.2]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(BX * 2, 0.25, 0.25), edgeMat);
    e.position.set(0, BY + 0.2, BZ + dz);
    ctx.staticRoot.add(e);
  }
  const pylonMat = mat.surface('concrete', { wet: 0.2 });
  for (const px of [-220, 220]) {
    for (const dz of [-9, 9]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(4, 110, 4), pylonMat);
      p.position.set(px, L.Y_RIVER + 55, BZ + dz);
      ctx.staticRoot.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 22), pylonMat);
    top.position.set(px, L.Y_RIVER + 108, BZ);
    ctx.staticRoot.add(top);
    // 塔身泛光
    const glowTower = new THREE.Mesh(new THREE.BoxGeometry(4.3, 70, 4.3), mat.neon(NEON.cyan, 0.5));
    glowTower.position.set(px, L.Y_RIVER + 75, BZ - 9);
    ctx.staticRoot.add(glowTower);
    // 斜拉索
    for (let k = 1; k <= 9; k++) {
      for (const s of [-1, 1]) {
        for (const dz of [-9, 9]) {
          ctx.wires.add([px, L.Y_RIVER + 104 - k * 2, BZ + dz], [px + s * k * 21, BY + 0.5, BZ + dz * 1.15], { sag: 0.1, r: 0.12 });
        }
      }
    }
  }
  // 桥面路灯光点
  for (let x = -BX + 10; x < BX; x += 16) {
    for (const dz of [-10, 10]) ctx.halos.add({ position: [x, BY + 6, BZ + dz], color: 0xffc070, size: 9, intensity: 0.5 });
  }

  // 江边（对岸）一条暖色滨江路灯带
  const embank = new THREE.Mesh(new THREE.BoxGeometry(1800, 0.4, 0.4), mat.neon(0xffb070, 1.6));
  embank.position.set(0, L.Y_RIVER + 3, -372);
  ctx.staticRoot.add(embank);
}
