// props/steam —— 火锅 / 蒸笼冒出的蒸汽：加法混合的 billboard 团，GPU 上按时间 t 计算上升、膨胀、漂移、消散。
// 颜色取自霓虹光场（lightFieldAt），所以蒸汽会被头顶灯泡和周围招牌染色。
import * as THREE from 'three';
import { LIGHTFIELD_GLSL } from '../../core/lights.js';

// sources: [{ x, y, z, k = 1(浓度), rise = 1.2(上升高度), n = 7(团数) }]
export function addSteam(ctx, sources) {
  if (!sources.length) return null;
  const rng = ctx.rng('steam');
  const total = sources.reduce((s, src) => s + (src.n || 7), 0);
  const geo = new THREE.PlaneGeometry(1, 1);
  const aSeed = new Float32Array(total * 4);
  const aPar = new Float32Array(total * 2);
  const mesh = new THREE.InstancedMesh(geo, null, total);
  const m = new THREE.Matrix4();
  let i = 0;
  for (const s of sources) {
    const n = s.n || 7;
    for (let k = 0; k < n; k++, i++) {
      m.makeTranslation(s.x + rng.range(-0.08, 0.08), s.y, s.z + rng.range(-0.08, 0.08));
      mesh.setMatrixAt(i, m);
      aSeed.set([(k + rng.range(0, 0.6)) / n, rng(), rng(), rng()], i * 4);
      aPar.set([s.k ?? 1, s.rise ?? 1.2], i * 2);
    }
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 4));
  geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(aPar, 2));
  const { lights, shared } = ctx;
  mesh.material = ctx.mat.custom(new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uLPos: lights.uPos, uLCol: lights.uCol, uLCount: lights.uCount },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute vec2 aPar;
      uniform float uTime;
      varying vec2 vUv; varying vec3 vCol; varying float vR;
      ${LIGHTFIELD_GLSL}
      void main(){
        vec3 src = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float rate = 0.16 + 0.08 * aSeed.y;
        float life = fract(uTime * rate + aSeed.x);
        float rise = aPar.y * (0.8 + 0.4 * aSeed.z);
        vec3 c = src;
        c.y += rise * (1.0 - (1.0 - life) * (1.0 - life));
        c.x += sin(life * 3.1 + aSeed.w * 6.2831) * 0.13 * life + 0.32 * life * life;
        c.z += cos(life * 2.3 + aSeed.w * 4.0) * 0.13 * life + 0.12 * life * life;
        float size = (0.22 + 1.1 * life) * (0.75 + 0.5 * aSeed.z) * (0.7 + 0.3 * aPar.x);
        float ang = aSeed.w * 6.2831 + life * (aSeed.y - 0.5) * 2.0;
        float ca = cos(ang), sa = sin(ang);
        vec2 p = vec2(ca * position.x - sa * position.y, sa * position.x + ca * position.y);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += p * size;
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vR = aSeed.y;
        float a = smoothstep(0.0, 0.15, life) * (1.0 - life) * (1.0 - life);
        vec3 lf = min(lightFieldAt(c), vec3(2.5));
        float near = smoothstep(0.4, 1.6, -mv.z);
        vCol = (lf * 0.55 + vec3(0.04, 0.036, 0.05)) * a * aPar.x * near;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vCol; varying float vR;
      void main(){
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        // 不规则的絮状：几层低频波扰动半径
        float th = atan(q.y, q.x);
        float wob = 0.18 * sin(th * 3.0 + vR * 17.0) + 0.1 * sin(th * 5.0 - vR * 9.0);
        float rr = r * (1.0 + wob);
        float n = 0.7 + 0.3 * sin(q.x * 7.0 + vR * 20.0) * sin(q.y * 6.0 - vR * 13.0);
        float a = exp(-rr * rr * 2.4) * smoothstep(1.0, 0.55, r) * n;
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  mesh.name = 'props:steam';
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.userData.noBatch = true;
  ctx.dynamicRoot.add(mesh);
  return mesh;
}
