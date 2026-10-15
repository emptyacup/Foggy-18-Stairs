// characters-routes —— 行人路线：折线 + 时间轴（走 / 停 / 等到信号灯某一相位），周期循环。
// 构建时把时间轴展开成关键帧表，运行时按 t 查表（二分 + 线性插值）→ 位置只由时间决定。
export class Route {
  // pts: [[x,z], ...]；closed: 首尾相连（环线）
  constructor(pts, { closed = false } = {}) {
    this.pts = closed ? [...pts, pts[0]] : pts.slice();
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, az] = this.pts[i - 1], [bx, bz] = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this.length = this.cum[this.cum.length - 1];
    this.T = [0]; this.S = [0]; this.G = [0]; this.F = [null];
    this.s = 0; this.t = 0; this.g = 0;
  }
  at(s) {
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const k = (s - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    const [ax, az] = this.pts[i - 1], [bx, bz] = this.pts[i];
    return [ax + (bx - ax) * k, az + (bz - az) * k];
  }
  // 路标处的弧长（第 i 个折点）
  node(i) { return this.cum[i]; }
  _push(face = null) { this.T.push(this.t); this.S.push(this.s); this.G.push(this.g); this.F.push(face); }
  // 走到弧长 toS。speed(x,z) → m/s；stride(x,z) → 一个步态周期（两步）对应的水平距离
  walk(toS, speed, stride) {
    const dir = Math.sign(toS - this.s);
    const step = 0.25;
    while (Math.abs(toS - this.s) > 1e-6) {
      const ds = Math.min(step, Math.abs(toS - this.s));
      const [x, z] = this.at(this.s + dir * ds / 2);
      this.t += ds / speed(x, z);
      this.g += ds / stride(x, z);
      this.s += dir * ds;
      this._push();
    }
    return this;
  }
  wait(dur, face = null) { if (dur > 0) { this.t += dur; this._push(face); } return this; }
  // 等到 (t mod cycle) == phase 的下一个时刻
  waitPhase(cycle, phase, face = null) {
    const p = ((this.t % cycle) + cycle) % cycle;
    let d = phase - p; if (d < 0) d += cycle;
    return this.wait(d, face);
  }
  // 结束：把周期补齐到 multiple 的整数倍；步态周期取整，保证循环接缝处腿不跳
  finish(multiple = 0) {
    if (multiple > 0) { const r = this.t % multiple; if (r > 1e-6) this.wait(multiple - r); }
    this.period = this.t;
    const gEnd = this.g, gRound = Math.max(1, Math.round(gEnd));
    if (gEnd > 0) this.G = this.G.map(g => g * gRound / gEnd);
    // 每段的朝向：走动段 = 运动方向；停留段 = 指定朝向 face，否则沿用上一段
    const n = this.T.length;
    this.H = new Float32Array(n);
    let last = null;
    for (let i = 1; i < n; i++) {
      const ds = this.S[i] - this.S[i - 1];
      let h = null;
      if (Math.abs(ds) > 1e-6) h = this.headingAt((this.S[i] + this.S[i - 1]) / 2, Math.sign(ds));
      else if (this.F[i] != null) h = this.F[i];
      else h = last;
      this.H[i] = h ?? NaN;
      if (h != null) last = h;
    }
    // 开头没有朝向的段：用循环末尾的朝向（首尾相接）
    for (let i = 1; i < n && Number.isNaN(this.H[i]); i++) this.H[i] = last ?? 0;
    this.H[0] = this.H[n - 1];
    return this;
  }
  _seg(tau) {
    const T = this.T;
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= tau) lo = m; else hi = m; }
    return hi;
  }
  // 平滑朝向：前后 0.4 s 窗口内的圆周平均（转身不跳变）
  heading(t) {
    const P = this.period;
    let sx = 0, sz = 0;
    for (const o of [-0.4, -0.2, 0, 0.2, 0.4]) {
      const tau = (((t + o) % P) + P) % P;
      const h = this.H[this._seg(tau)];
      sx += Math.sin(h); sz += Math.cos(h);
    }
    return Math.atan2(sx, sz);
  }
  // 查表 → { x, z, s, gait(0..1 循环), speed, heading(由运动方向 / face 决定), moving }
  sample(t) {
    const P = this.period, tau = ((t % P) + P) % P;
    const T = this.T;
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= tau) lo = m; else hi = m; }
    const k = (tau - T[lo]) / Math.max(1e-6, T[hi] - T[lo]);
    const s = this.S[lo] + (this.S[hi] - this.S[lo]) * k;
    const g = this.G[lo] + (this.G[hi] - this.G[lo]) * k;
    const ds = this.S[hi] - this.S[lo], dt = T[hi] - T[lo];
    const [x, z] = this.at(s);
    return { x, z, s, gait: g, speed: dt > 0 ? Math.abs(ds) / dt : 0, dir: Math.sign(ds), face: this.F[hi], seg: lo };
  }
  // 运动方向（世界 yaw，人物局部 +Z 朝前）：用前后各 0.3 m 的差分，拐角自然平滑
  headingAt(s, dir) {
    const [ax, az] = this.at(s - 0.35 * dir), [bx, bz] = this.at(s + 0.35 * dir);
    return Math.atan2(bx - ax, bz - az);
  }
}

// 角度插值（最短路径）
export function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}
