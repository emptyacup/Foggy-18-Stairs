// 霓虹光场：模块可以登记任意多个点光（招牌、路灯、窗口溢光），
// 每帧按"对相机的贡献"挑出最重要的 MAX_LIGHTS 个上传到所有 ctx.mat 材质。
// 真正的 THREE.PointLight 在本场景里禁止使用（太贵、上限低）。
import * as THREE from 'three';

export const MAX_LIGHTS = 96;

export class LightField {
  constructor() {
    this.list = [];
    // 光场数据放在一张 MAX_LIGHTS×2 的浮点纹理里（行 0：位置+半径，行 1：颜色×强度）。
    // 比 uniform 数组快得多：切换材质时只需重新绑定纹理，不必重新上传 2×96 个 vec4。
    this.data = new Float32Array(MAX_LIGHTS * 2 * 4);
    this.tex = new THREE.DataTexture(this.data, MAX_LIGHTS, 2, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.uPos = { value: this.tex };      // shader 里的 uLPos（sampler2D）
    this.uCol = { value: this.tex };      // 兼容旧写法（uniforms 里写了 uLCol 也无害）
    this.uCount = { value: 0 };
    this._tmp = new THREE.Color();
    this._acc = 1;
    this.active = 0;
  }

  // color: sRGB hex；intensity: 1 ≈ 一块普通霓虹招牌；radius: 影响半径（米）
  add({ position, color = 0xffffff, intensity = 1, radius = 8 }) {
    const c = new THREE.Color(color);   // ColorManagement 自动转到线性
    const h = {
      position: position.clone ? position.clone() : new THREE.Vector3(...position),
      color: c, intensity, radius, enabled: true,
    };
    this.list.push(h);
    return h;
  }

  // 每帧调用：按 intensity*radius² / 距离² 排序，选前 MAX_LIGHTS 个
  update(camPos, force = false) {
    this._acc += 1;
    if (!force && this._acc < 6 && this.list.length <= MAX_LIGHTS) { this._write(); return; }
    this._acc = 0;
    let arr = this.list.filter(l => l.enabled && l.intensity > 0);
    if (arr.length > MAX_LIGHTS) {
      for (const l of arr) {
        const d2 = l.position.distanceToSquared(camPos);
        l._score = l.intensity * l.radius * l.radius / Math.max(4, d2);
      }
      arr.sort((a, b) => b._score - a._score);
      arr = arr.slice(0, MAX_LIGHTS);
    }
    this._sel = arr;
    this._write();
  }

  _write() {
    const arr = this._sel || [];
    const D = this.data, R1 = MAX_LIGHTS * 4;
    for (let i = 0; i < arr.length; i++) {
      const l = arr[i], o = i * 4;
      D[o] = l.position.x; D[o + 1] = l.position.y; D[o + 2] = l.position.z; D[o + 3] = l.radius;
      D[R1 + o] = l.color.r * l.intensity; D[R1 + o + 1] = l.color.g * l.intensity; D[R1 + o + 2] = l.color.b * l.intensity; D[R1 + o + 3] = 0;
    }
    this.tex.needsUpdate = true;
    this.uCount.value = arr.length;
    this.active = arr.length;
  }
}

// 供自定义 shader（雨丝、体积光）复用的 GLSL：在世界坐标点估算光场照度
export const LIGHTFIELD_DECL = /* glsl */`
uniform highp sampler2D uLPos;
uniform int uLCount;
vec4 lfPos(int i) { return texelFetch(uLPos, ivec2(i, 0), 0); }
vec4 lfCol(int i) { return texelFetch(uLPos, ivec2(i, 1), 0); }
`;
export const LIGHTFIELD_GLSL = LIGHTFIELD_DECL + /* glsl */`
vec3 lightFieldAt(vec3 p) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLCount) break;
    vec4 lp = lfPos(i);
    vec3 d = lp.xyz - p;
    float d2 = dot(d, d);
    if (d2 > lp.w * lp.w) continue;
    float a = 1.0 - sqrt(d2) / lp.w;
    acc += lfCol(i).rgb * a * a / (1.0 + d2 * 0.05);
  }
  return acc;
}
`;
