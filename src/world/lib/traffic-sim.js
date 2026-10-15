// traffic-sim —— 车道离线仿真：构建时把一个周期 P 内每辆车的轨迹算好，运行时按 t 查表。
// 车流是开放系统：车按 P 周期的时刻表从车道起点驶入，跟车 + 红灯排队；红灯每个周期都能清空队列，
// 所以稳定后轨迹严格以 P 为周期 —— 位置只由时间 t 决定（截图 dt=0 也可复现）。
export const SAMPLE = 0.1;   // 轨迹采样间隔（秒）

// lane: { length, v0, stopS?(null=无信号), green(t)->'G'|'Y'|'R' }
// slots: [{ entry (0..P), len, v0? }]
export function simulateLane(lane, slots, P) {
  const dt = 0.05, sub = Math.round(SAMPLE / dt);
  const A = 2.0, B = 3.2, GAP = 2.2;
  const events = [];
  for (let k = 0; k < 4; k++) for (let j = 0; j < slots.length; j++) events.push({ t: slots[j].entry + k * P, j, k });
  events.sort((a, b) => a.t - b.t);
  const out = slots.map(() => ({ s: [], v: [] }));
  const cars = [];   // 车道上的车，车头在前（s 大的在前）
  let ei = 0;
  const steps = Math.ceil(4 * P / dt) + 1;
  for (let n = 0; n < steps; n++) {
    const t = n * dt;
    // 驶入
    while (ei < events.length && events[ei].t <= t) {
      const e = events[ei++];
      const sl = slots[e.j];
      const last = cars[cars.length - 1];
      let v = sl.v0 ?? lane.v0, s = 0;
      if (last) {
        const g = last.s - last.len - GAP;
        if (g < 0) s = g;   // 极端情况：排到起点之外，继续跟车
        v = Math.min(v, Math.sqrt(2 * B * Math.max(0, g)));
      }
      cars.push({ s, v, len: sl.len, v0: sl.v0 ?? lane.v0, j: e.j, rec: e.k === 2, t0: e.t, done: false });
    }
    const sig = lane.stopS != null ? lane.signal(t) : 'G';
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      let gap = Infinity;
      if (i > 0) gap = cars[i - 1].s - cars[i - 1].len - c.s - GAP;
      if (sig !== 'G' && c.s < lane.stopS - 0.05) {
        const d = lane.stopS - c.s;
        if (sig === 'R' || c.v * c.v / (2 * 4.5) < d) gap = Math.min(gap, d - 0.3);
      }
      const vt = Math.min(c.v0, Math.sqrt(2 * B * Math.max(0, gap)));
      c.v = vt > c.v ? Math.min(vt, c.v + A * dt) : vt;
      c.s += c.v * dt;
    }
    // 记录（以驶入时刻为 0 的本地时间，每 SAMPLE 秒一个样本）
    for (const c of cars) {
      if (!c.rec) continue;
      const local = Math.round((t - c.t0) / dt);
      if (local >= 0 && local % sub === 0) { out[c.j].s.push(c.s); out[c.j].v.push(c.v); }
    }
    while (cars.length && cars[0].s > lane.length + cars[0].len) cars.shift();
  }
  return out.map(o => ({ s: Float32Array.from(o.s), v: Float32Array.from(o.v), T: (o.s.length - 1) * SAMPLE }));
}

// 查表：返回 { s, v, a } 或 null（此刻不在车道上）
export function sampleTrack(tr, entry, t, P) {
  const tau = (((t - entry) % P) + P) % P;
  if (tau >= tr.T) return null;
  const f = tau / SAMPLE, i = Math.floor(f), k = f - i;
  const i1 = Math.min(i + 1, tr.s.length - 1);
  const s = tr.s[i] + (tr.s[i1] - tr.s[i]) * k;
  const v = tr.v[i] + (tr.v[i1] - tr.v[i]) * k;
  const a = (tr.v[i1] - tr.v[Math.max(0, i - 1)]) / (SAMPLE * (i1 - Math.max(0, i - 1) || 1));
  return { s, v, a };
}
