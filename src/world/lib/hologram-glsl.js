// hologram 公共 GLSL：哈希、雾、全息着色（菲涅尔 + 扫描线 + 扫光 + 闪烁）、glitch 横向切片错位、江面倒影投影。
// 所有动画只依赖 uTime（= ctx.shared.uTime），截图模式可复现。

export const HOLO_COMMON = /* glsl */`
uniform float uTime;
uniform float uFogDensity;
uniform vec3 uFogColor;
float hh1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
float hh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh2(i), hh2(i + vec2(1, 0)), u.x), mix(hh2(i + vec2(0, 1)), hh2(i + vec2(1, 1)), u.x), u.y);
}
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

// 顶点：glitch 横向切片错位（世界坐标）。seed 区分不同全息体；bandH = 切片高度（米）；amp = 最大错位（米）
export const HOLO_GLITCH = /* glsl */`
float glitchOn(float seed){
  // 每 ~1.6 s 一个时间窗，约 22% 的窗口发生 glitch；窗口内再按 1/12 s 切换切片
  float w = floor(uTime / 1.6 + seed);
  float act = step(0.78, hh1(w * 3.17 + seed * 11.0));
  float inWin = step(fract(uTime / 1.6 + seed), 0.35);
  return act * inWin;
}
vec3 glitchOffset(vec3 wp, vec3 dirX, float seed, float bandH, float amp){
  float on = glitchOn(seed);
  if (on < 0.5) return wp;
  float slot = floor(uTime * 12.0);
  float band = floor(wp.y / bandH);
  float r = hh1(band * 7.31 + slot * 1.73 + seed * 5.0);
  float sh = step(0.72, r) * (hh1(band * 3.1 + slot * 0.7 + seed) - 0.5) * 2.0 * amp;
  return wp + dirX * sh;
}
`;

// 片元：全息着色。N/V 世界空间；h = 归一化高度（颜色渐变）；返回 HDR 颜色（加法混合）
export const HOLO_SHADE = /* glsl */`
float aaLine(float x, float w){
  // x：周期坐标；返回周期中心细线（抗锯齿）
  float f = abs(fract(x) - 0.5);
  float fw = max(fwidth(x), 1e-4);
  return 1.0 - smoothstep(w * 0.5 - fw, w * 0.5 + fw, 0.5 - f);
}
float holoFlicker(float seed){
  float a = hh1(floor(uTime * 24.0) + seed * 17.0);
  float dip = step(0.965, hh1(floor(uTime * 7.0) * 1.37 + seed));
  return (0.9 + 0.1 * a) * (1.0 - 0.55 * dip);
}
float holoFog(vec3 wp, float k){
  float d = length(wp - cameraPosition);
  float f = uFogDensity * k * d;
  return exp(-f * f);
}
`;

// 顶点：把江面以下的镜像点沿视线投到水面（y = yw），使倒影在屏幕上的位置正确、且能被前景正确遮挡
export const HOLO_MIRROR = /* glsl */`
vec3 mirrorToWater(vec3 wp, float yw){
  vec3 m = vec3(wp.x, 2.0 * yw - wp.y, wp.z);
  vec3 c = cameraPosition;
  float dy = m.y - c.y;
  float k = (yw + 0.12 - c.y) / (abs(dy) < 1e-3 ? -1e-3 : dy);
  return c + (m - c) * k;
}
`;
